'use client';

import { ChevronDown, Filter } from 'lucide-react';
import { useLocale } from '@/lib/i18n/locale-context';
import { COUNTRY_FIAT_MAP } from '@/lib/i18n/countries';

const ALL_FIATS = [...new Set(Object.values(COUNTRY_FIAT_MAP).flatMap((c) => c.fiats))].sort();

interface MarketFiltersProps {
  tab: 'buy' | 'sell';
  onTab: (t: 'buy' | 'sell') => void;
  amount: string;
  onAmount: (v: string) => void;
  fiat: string;
  onFiat: (v: string) => void;
  payment: string;
  onPayment: (v: string) => void;
  paymentOptions: string[];
}

export function MarketFilters({
  tab, onTab, amount, onAmount, fiat, onFiat, payment, onPayment, paymentOptions,
}: MarketFiltersProps) {
  const { t } = useLocale();
  const m = t.app.market;

  return (
    <div className="border-b border-white/[0.06]">
      <div className="flex items-end gap-0 px-3 sm:px-4 pt-2">
        <button type="button" onClick={() => onTab('buy')} className={tab === 'buy' ? 'tab-active-buy' : 'tab-inactive'}>
          {m.buy}
        </button>
        <button type="button" onClick={() => onTab('sell')} className={tab === 'sell' ? 'tab-active-sell' : 'tab-inactive'}>
          {m.sell}
        </button>
      </div>
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 px-3 sm:px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="filter-chip shrink-0">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#26A17B] text-[9px] font-black text-white">₮</span>
            <span className="font-semibold text-white text-sm">USDT</span>
          </div>
          <input
            className="input flex-1 min-w-[100px] max-w-[140px] py-2 text-sm tabular-nums font-medium"
            value={amount}
            onChange={(e) => onAmount(e.target.value.replace(/\D/g, ''))}
            placeholder="0"
            inputMode="numeric"
          />
          <div className="relative shrink-0">
            <select
              className="filter-chip appearance-none pr-8 cursor-pointer bg-transparent font-semibold text-white text-sm border-0 outline-none"
              value={fiat}
              onChange={(e) => onFiat(e.target.value)}
              aria-label={m.selectFiat}
            >
              {ALL_FIATS.map((f) => (
                <option key={f} value={f} className="bg-[#10131C] text-white">{f}</option>
              ))}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-nexora-muted" />
          </div>
          <select
            className="input w-full sm:w-auto sm:min-w-[160px] py-2 text-sm cursor-pointer flex-1 sm:flex-none"
            value={payment}
            onChange={(e) => onPayment(e.target.value)}
          >
            {paymentOptions.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <button type="button" className="btn-secondary text-xs py-2 px-3 gap-1.5 w-full sm:w-auto sm:ml-auto">
          <Filter size={14} />
          {m.filters}
        </button>
      </div>
    </div>
  );
}

export { ALL_FIATS };
