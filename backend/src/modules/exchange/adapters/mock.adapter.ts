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

  constructor(private readonly basePrice: number) {}

  async getTicker(symbol: string): Promise<Ticker> {
    // Small deterministic wiggle so charts look alive.
    const wiggle = (Date.now() % 1000) / 100000; // < 0.01
    return {
      symbol,
      price: this.basePrice * (1 + wiggle),
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
      avgFillPrice: params.price ?? this.basePrice,
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
