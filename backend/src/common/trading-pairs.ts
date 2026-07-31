import { BadRequestException } from '@nestjs/common';
import { D } from './money';

export type TradingPair = {
  symbol: string;
  base: string;
  quote: string;
  tvSymbol: string;
  type: 'spot' | 'futures';
};

function usdt(base: string): TradingPair {
  return {
    symbol: `${base}USDT`,
    base,
    quote: 'USDT',
    tvSymbol: `BINANCE:${base}USDT`,
    type: 'spot',
  };
}

/** Core + extended crypto list for binary / spot (~58 USDT pairs). */
export const SPOT_PAIRS: TradingPair[] = [
  usdt('BTC'),
  usdt('ETH'),
  usdt('SOL'),
  usdt('XRP'),
  usdt('BNB'),
  usdt('ADA'),
  usdt('DOGE'),
  usdt('TON'),
  // +50
  usdt('AVAX'),
  usdt('DOT'),
  usdt('LINK'),
  usdt('POL'),
  usdt('LTC'),
  usdt('BCH'),
  usdt('ATOM'),
  usdt('NEAR'),
  usdt('APT'),
  usdt('ARB'),
  usdt('OP'),
  usdt('SUI'),
  usdt('SEI'),
  usdt('INJ'),
  usdt('FIL'),
  usdt('ICP'),
  usdt('TRX'),
  usdt('SHIB'),
  usdt('PEPE'),
  usdt('WIF'),
  usdt('BONK'),
  usdt('FLOKI'),
  usdt('UNI'),
  usdt('AAVE'),
  usdt('MKR'),
  usdt('CRV'),
  usdt('LDO'),
  usdt('RENDER'),
  usdt('FET'),
  usdt('TAO'),
  usdt('IMX'),
  usdt('GRT'),
  usdt('SAND'),
  usdt('MANA'),
  usdt('AXS'),
  usdt('GALA'),
  usdt('ALGO'),
  usdt('XLM'),
  usdt('VET'),
  usdt('HBAR'),
  usdt('ETC'),
  usdt('XMR'),
  usdt('CAKE'),
  usdt('RUNE'),
  usdt('STX'),
  usdt('TIA'),
  usdt('JUP'),
  usdt('WLD'),
  usdt('PYTH'),
  usdt('ORDI'),
  usdt('NOT'),
];

export const FUTURES_PAIRS: TradingPair[] = SPOT_PAIRS.map((p) => ({
  ...p,
  type: 'futures' as const,
  tvSymbol: `${p.tvSymbol}.P`,
}));

const PAIR_MAP = new Map(SPOT_PAIRS.map((p) => [p.symbol, p] as const));

/** Approximate mid-market levels (UTC, 2026-07-31). */
export const REFERENCE_PRICES: Record<string, number> = {
  BTC: 64280,
  ETH: 1907,
  SOL: 74.2,
  XRP: 1.08,
  BNB: 590,
  ADA: 0.385,
  DOGE: 0.072,
  TON: 3.15,
  AVAX: 18.4,
  DOT: 3.85,
  LINK: 9.25,
  POL: 0.248,
  LTC: 68.5,
  BCH: 312,
  ATOM: 4.15,
  NEAR: 2.85,
  APT: 4.55,
  ARB: 0.385,
  OP: 0.72,
  SUI: 1.45,
  SEI: 0.185,
  INJ: 11.2,
  FIL: 2.65,
  ICP: 5.15,
  TRX: 0.142,
  SHIB: 0.0000112,
  PEPE: 0.0000058,
  WIF: 0.85,
  BONK: 0.0000125,
  FLOKI: 0.000085,
  UNI: 5.85,
  AAVE: 128,
  MKR: 1120,
  CRV: 0.32,
  LDO: 0.85,
  RENDER: 3.65,
  FET: 0.72,
  TAO: 185,
  IMX: 0.68,
  GRT: 0.118,
  SAND: 0.245,
  MANA: 0.265,
  AXS: 3.85,
  GALA: 0.018,
  ALGO: 0.125,
  XLM: 0.28,
  VET: 0.022,
  HBAR: 0.095,
  ETC: 16.8,
  XMR: 148,
  CAKE: 1.65,
  RUNE: 2.95,
  STX: 1.15,
  TIA: 1.85,
  JUP: 0.42,
  WLD: 1.15,
  PYTH: 0.145,
  ORDI: 12.5,
  NOT: 0.0042,
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
