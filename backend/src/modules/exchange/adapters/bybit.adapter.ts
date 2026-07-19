import { createHmac } from 'crypto';
import { Logger } from '@nestjs/common';
import {
  ExchangeOrderResult,
  IExchangeAdapter,
  PlaceOrderParams,
  Ticker,
} from '../exchange-adapter.interface';

interface BybitConfig {
  apiKey: string;
  apiSecret: string;
  testnet: boolean;
}

/**
 * Bybit v5 REST adapter. Public market data works without keys; trading
 * endpoints require API credentials. Implements request signing per the
 * Bybit v5 spec so it is production-ready once keys are provided.
 *
 * Docs: https://bybit-exchange.github.io/docs/v5/intro
 */
export class BybitExchangeAdapter implements IExchangeAdapter {
  readonly name = 'bybit';
  private readonly logger = new Logger(BybitExchangeAdapter.name);
  private readonly baseUrl: string;
  private readonly recvWindow = '5000';

  constructor(private readonly config: BybitConfig) {
    this.baseUrl = config.testnet
      ? 'https://api-testnet.bybit.com'
      : 'https://api.bybit.com';
  }

  private assertKeys() {
    if (!this.config.apiKey || !this.config.apiSecret) {
      throw new Error(
        'Bybit API-ключи не настроены. Заполните BYBIT_API_KEY / BYBIT_API_SECRET в .env',
      );
    }
  }

  private sign(timestamp: string, payload: string): string {
    return createHmac('sha256', this.config.apiSecret)
      .update(timestamp + this.config.apiKey + this.recvWindow + payload)
      .digest('hex');
  }

  private async signedRequest(
    method: 'GET' | 'POST',
    path: string,
    params: Record<string, string | number>,
  ): Promise<any> {
    this.assertKeys();
    const timestamp = Date.now().toString();
    let url = this.baseUrl + path;
    let body = '';
    let payloadForSign = '';

    if (method === 'GET') {
      const qs = new URLSearchParams(
        Object.entries(params).map(([k, v]) => [k, String(v)]),
      ).toString();
      payloadForSign = qs;
      if (qs) url += `?${qs}`;
    } else {
      body = JSON.stringify(params);
      payloadForSign = body;
    }

    const sign = this.sign(timestamp, payloadForSign);
    const res = await fetch(url, {
      method,
      headers: {
        'X-BAPI-API-KEY': this.config.apiKey,
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-RECV-WINDOW': this.recvWindow,
        'X-BAPI-SIGN': sign,
        'Content-Type': 'application/json',
      },
      body: method === 'POST' ? body : undefined,
    });
    const json = await res.json();
    if (json.retCode !== 0) {
      this.logger.error(`Bybit error ${json.retCode}: ${json.retMsg}`);
      throw new Error(`Bybit: ${json.retMsg} (${json.retCode})`);
    }
    return json.result;
  }

  async getTicker(symbol: string): Promise<Ticker> {
    const url = `${this.baseUrl}/v5/market/tickers?category=spot&symbol=${symbol}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.retCode !== 0) {
      throw new Error(`Bybit ticker: ${json.retMsg}`);
    }
    const item = json.result?.list?.[0];
    return {
      symbol,
      price: parseFloat(item?.lastPrice ?? '0'),
      source: 'bybit',
      timestamp: Date.now(),
    };
  }

  async placeOrder(params: PlaceOrderParams): Promise<ExchangeOrderResult> {
    const result = await this.signedRequest('POST', '/v5/order/create', {
      category: 'spot',
      symbol: params.symbol,
      side: params.side === 'BUY' ? 'Buy' : 'Sell',
      orderType: params.price ? 'Limit' : 'Market',
      qty: String(params.qty),
      ...(params.price ? { price: String(params.price) } : {}),
    });
    return {
      externalOrderId: result.orderId,
      status: 'SUBMITTED',
      filledQty: 0,
      raw: result,
    };
  }

  async getOrder(externalOrderId: string): Promise<ExchangeOrderResult> {
    const result = await this.signedRequest('GET', '/v5/order/realtime', {
      category: 'spot',
      orderId: externalOrderId,
    });
    const order = result?.list?.[0];
    const statusMap: Record<string, ExchangeOrderResult['status']> = {
      New: 'SUBMITTED',
      PartiallyFilled: 'PARTIALLY_FILLED',
      Filled: 'FILLED',
      Cancelled: 'CANCELLED',
      Rejected: 'FAILED',
    };
    return {
      externalOrderId,
      status: statusMap[order?.orderStatus] ?? 'SUBMITTED',
      filledQty: parseFloat(order?.cumExecQty ?? '0'),
      avgFillPrice: order?.avgPrice ? parseFloat(order.avgPrice) : undefined,
      raw: order,
    };
  }

  async cancelOrder(externalOrderId: string): Promise<ExchangeOrderResult> {
    const result = await this.signedRequest('POST', '/v5/order/cancel', {
      category: 'spot',
      orderId: externalOrderId,
    });
    return { externalOrderId, status: 'CANCELLED', filledQty: 0, raw: result };
  }
}
