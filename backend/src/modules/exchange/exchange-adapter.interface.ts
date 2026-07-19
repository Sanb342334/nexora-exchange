export interface Ticker {
  symbol: string;
  price: number;
  source: string;
  timestamp: number;
}

export interface PlaceOrderParams {
  symbol: string;
  side: 'BUY' | 'SELL';
  qty: number;
  price?: number; // omit for market order
}

export interface ExchangeOrderResult {
  externalOrderId: string;
  status: 'SUBMITTED' | 'FILLED' | 'PARTIALLY_FILLED' | 'FAILED' | 'CANCELLED';
  filledQty: number;
  avgFillPrice?: number;
  raw?: unknown;
}

/**
 * Abstraction over a real exchange (Bybit) used by the admin to hedge/close
 * the real trades behind the internal P2P desk. Swap implementations without
 * touching the domain logic.
 */
export interface IExchangeAdapter {
  readonly name: string;
  getTicker(symbol: string): Promise<Ticker>;
  placeOrder(params: PlaceOrderParams): Promise<ExchangeOrderResult>;
  getOrder(externalOrderId: string): Promise<ExchangeOrderResult>;
  cancelOrder(externalOrderId: string): Promise<ExchangeOrderResult>;
}

export const EXCHANGE_ADAPTER = Symbol('EXCHANGE_ADAPTER');
