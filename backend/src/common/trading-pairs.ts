import { BadRequestException } from '@nestjs/common';
import { D } from './money';

export type TradingPair = {
  symbol: string;
  base: string;
  quote: string;
  tvSymbol: string;
  type: 'spot' | 'futures';
};

export const SPOT_PAIRS: TradingPair[] = [
  { symbol: 'BTCUSDT', base: 'BTC', quote: 'USDT', tvSymbol: 'BINANCE:BTCUSDT', type: 'spot' },
  { symbol: 'ETHUSDT', base: 'ETH', quote: 'USDT', tvSymbol: 'BINANCE:ETHUSDT', type: 'spot' },
  { symbol: 'SOLUSDT', base: 'SOL', quote: 'USDT', tvSymbol: 'BINANCE:SOLUSDT', type: 'spot' },
  { symbol: 'XRPUSDT', base: 'XRP', quote: 'USDT', tvSymbol: 'BINANCE:XRPUSDT', type: 'spot' },
  { symbol: 'BNBUSDT', base: 'BNB', quote: 'USDT', tvSymbol: 'BINANCE:BNBUSDT', type: 'spot' },
  { symbol: 'ADAUSDT', base: 'ADA', quote: 'USDT', tvSymbol: 'BINANCE:ADAUSDT', type: 'spot' },
  { symbol: 'DOGEUSDT', base: 'DOGE', quote: 'USDT', tvSymbol: 'BINANCE:DOGEUSDT', type: 'spot' },
  { symbol: 'TONUSDT', base: 'TON', quote: 'USDT', tvSymbol: 'BINANCE:TONUSDT', type: 'spot' },
];

export const FUTURES_PAIRS: TradingPair[] = SPOT_PAIRS.map((p) => ({
  ...p,
  type: 'futures' as const,
  tvSymbol: `${p.tvSymbol}.P`,
}));

const PAIR_MAP = new Map(SPOT_PAIRS.map((p) => [p.symbol, p] as const));

export const REFERENCE_PRICES: Record<string, number> = {
  BTC: 67842,
  ETH: 3521,
  SOL: 178,
  XRP: 0.62,
  BNB: 612,
  ADA: 0.58,
  DOGE: 0.14,
  TON: 5.8,
};

export function resolvePair(symbol: string, type?: 'spot' | 'futures'): TradingPair {
  const key = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 24);
  const pair = PAIR_MAP.get(key);
  if (!pair) throw new BadRequestException('Unknown trading pair');
  if (type && pair.type !== type) {
    return type === 'futures'
      ? { ...pair, type: 'futures', tvSymbol: `${pair.tvSymbol}.P` }
      : { ...pair, type: 'spot', tvSymbol: pair.tvSymbol.replace(/\.P$/, '') };
  }
  return pair;
}

export function houseBidAsk(base: string, spreadPct: number) {
  const mid = REFERENCE_PRICES[base] ?? 100;
  const half = spreadPct / 2;
  return {
    mid,
    bid: mid * (1 - half),
    ask: mid * (1 + half),
  };
}

export function parsePositiveDecimal(raw: string, label: string) {
  const v = D(raw);
  if (!v.isFinite() || v.lte(0)) throw new BadRequestException(`Invalid ${label}`);
  return v;
}
