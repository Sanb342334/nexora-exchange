import { randomUUID } from 'crypto';
import {
  ExchangeOrderResult,
  IExchangeAdapter,
  PlaceOrderParams,
  Ticker,
} from '../exchange-adapter.interface';

/**
 * Deterministic in-memory adapter for local development and simulation.
 * Orders fill instantly at the requested (or a synthetic) price.
 */
export class MockExchangeAdapter implements IExchangeAdapter {
  readonly name = 'mock';
  private readonly orders = new Map<string, ExchangeOrderResult>();

  constructor(private readonly priceBySymbol: Record<string, number>) {}

  private resolvePrice(symbol: string): number {
    const key = symbol.toUpperCase().replace('/', '');
    if (this.priceBySymbol[key] != null) return this.priceBySymbol[key];
    if (key.startsWith('USDT') && key.length > 4) {
      const fiatKey = `USDT${key.slice(4)}`;
      if (this.priceBySymbol[fiatKey] != null) return this.priceBySymbol[fiatKey];
    }
    return this.priceBySymbol.USDTKZT ?? 470;
  }

  async getTicker(symbol: string): Promise<Ticker> {
    const base = this.resolvePrice(symbol);
    const wiggle = (Date.now() % 1000) / 100000;
    return {
      symbol,
      price: base * (1 + wiggle),
      source: 'mock',
      timestamp: Date.now(),
    };
  }

  async placeOrder(params: PlaceOrderParams): Promise<ExchangeOrderResult> {
    const externalOrderId = `mock_${randomUUID()}`;
    const result: ExchangeOrderResult = {
      externalOrderId,
      status: 'FILLED',
      filledQty: params.qty,
      avgFillPrice: params.price ?? this.resolvePrice(params.symbol),
      raw: { simulated: true, ...params },
    };
    this.orders.set(externalOrderId, result);
    return result;
  }

  async getOrder(externalOrderId: string): Promise<ExchangeOrderResult> {
    const order = this.orders.get(externalOrderId);
    if (!order) {
      return { externalOrderId, status: 'FAILED', filledQty: 0 };
    }
    return order;
  }

  async cancelOrder(externalOrderId: string): Promise<ExchangeOrderResult> {
    const order = this.orders.get(externalOrderId);
    const cancelled: ExchangeOrderResult = {
      externalOrderId,
      status: 'CANCELLED',
      filledQty: order?.filledQty ?? 0,
    };
    this.orders.set(externalOrderId, cancelled);
    return cancelled;
  }
}
