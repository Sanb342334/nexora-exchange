import { SPOT_PAIRS } from '../../common/trading-pairs';

export type BinaryPair = {
  id: string;
  title: string;
  base: string;
  quote: string;
  kind: 'fx' | 'crypto';
};

export const BINARY_FX_PAIRS: BinaryPair[] = [
  { id: 'EURUSD', title: 'EUR/USD', base: 'EUR', quote: 'USD', kind: 'fx' },
  { id: 'GBPUSD', title: 'GBP/USD', base: 'GBP', quote: 'USD', kind: 'fx' },
  { id: 'USDJPY', title: 'USD/JPY', base: 'USD', quote: 'JPY', kind: 'fx' },
  { id: 'AUDUSD', title: 'AUD/USD', base: 'AUD', quote: 'USD', kind: 'fx' },
];

export const BINARY_CRYPTO_PAIRS: BinaryPair[] = SPOT_PAIRS.map((p) => ({
  id: p.symbol,
  title: `${p.base}/${p.quote}`,
  base: p.base,
  quote: p.quote,
  kind: 'crypto' as const,
}));

export const BINARY_PAIRS: BinaryPair[] = [...BINARY_CRYPTO_PAIRS, ...BINARY_FX_PAIRS];

export const BINARY_DURATIONS = [
  { sec: 60, label: '1 мин' },
  { sec: 300, label: '5 мин' },
  { sec: 900, label: '15 мин' },
  { sec: 1200, label: '20 мин' },
  { sec: 1800, label: '30 мин' },
  { sec: 3600, label: '1 час' },
] as const;

export const BINARY_CURRENCIES: Record<string, { symbol: string; name: string }> = {
  KZT: { symbol: '₸', name: 'Тенге' },
  USD: { symbol: '$', name: 'Доллар' },
  RUB: { symbol: '₽', name: 'Рубль' },
  EUR: { symbol: '€', name: 'Евро' },
};

/** Approximate FX vs USD for display-currency conversion (mid-2026 levels). */
export const FIAT_USD_RATE: Record<string, number> = {
  USD: 1,
  EUR: 1.085,
  RUB: 0.0115, // ~87 ₽ / $
  KZT: 0.00196, // ~510 ₸ / $
};

export function convertFiatAmount(amount: number, from: string, to: string): number {
  if (from === to) return amount;
  const a = FIAT_USD_RATE[from];
  const b = FIAT_USD_RATE[to];
  if (!a || !b) return amount;
  return (amount * a) / b;
}

export const DEFAULT_BINARY_PAYOUT = 1.96;

/** Flat trading fee as a fraction of margin (stake). */
export const BINARY_TRADE_FEE_RATE = 0.01;

/** Accept BTCUSDT, BTC_USDT, btc-usdt → BTCUSDT */
export function normalizePairId(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function findBinaryPair(raw: string): BinaryPair | undefined {
  const id = normalizePairId(raw);
  return BINARY_PAIRS.find((p) => p.id === id);
}

export function isAllowedDuration(sec: number): boolean {
  return BINARY_DURATIONS.some((d) => d.sec === sec);
}

export function formatDuration(sec: number): string {
  const found = BINARY_DURATIONS.find((d) => d.sec === sec);
  if (found) return found.label;
  if (sec >= 60) return `${Math.floor(sec / 60)} мин`;
  return `${sec} сек`;
}

/** Deterministic WIN for RANDOM so chart path matches settlement. */
export function plannedWin(
  tradeId: string,
  mode: 'WIN' | 'LOSE' | 'RANDOM' | string,
): boolean {
  if (mode === 'WIN') return true;
  if (mode === 'LOSE') return false;
  let h = 0;
  for (let i = 0; i < tradeId.length; i++) h = (Math.imul(h, 31) + tradeId.charCodeAt(i)) | 0;
  return (h & 1) === 0;
}
