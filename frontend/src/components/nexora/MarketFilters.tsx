'use client';

import { ChevronDown, Filter } from 'lucide-react';

const PAYMENT_OPTIONS = ['Все способы оплаты', 'Kaspi', 'Halyk', 'Visa', 'Mastercard', 'СБП'];

interface MarketFiltersProps {
  tab: 'buy' | 'sell';
  onTab: (t: 'buy' | 'sell') => void;
  amount: string;
  onAmount: (v: string) => void;
  payment: string;
  onPayment: (v: string) => void;
}

export function MarketFilters({ tab, onTab, amount, onAmount, payment, onPayment }: MarketFiltersProps) {
  return (
    <div className="border-b border-white/[0.06]">
      <div className="flex items-end gap-0 px-3 sm:px-4 pt-2">
        <button type="button" onClick={() => onTab('buy')} className={tab === 'buy' ? 'tab-active-buy' : 'tab-inactive'}>
          Купить
        </button>
        <button type="button" onClick={() => onTab('sell')} className={tab === 'sell' ? 'tab-active-sell' : 'tab-inactive'}>
          Продать
        </button>
      </div>
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 px-3 sm:px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="filter-chip shrink-0">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#26A17B] text-[9px] font-black text-white">
              ₮
            </span>
            <span className="font-semibold text-white text-sm">USDT</span>
            <ChevronDown size={14} className="text-nexora-muted" />
          </div>
          <input
            className="input flex-1 min-w-[100px] max-w-[140px] py-2 text-sm tabular-nums font-medium"
            value={amount}
            onChange={(e) => onAmount(e.target.value.replace(/\D/g, ''))}
            placeholder="50 000"
            inputMode="numeric"
          />
          <div className="filter-chip shrink-0">
            <span className="font-semibold text-white text-sm">KZT</span>
            <ChevronDown size={14} className="text-nexora-muted" />
          </div>
          <select
            className="input w-full sm:w-auto sm:min-w-[160px] py-2 text-sm cursor-pointer flex-1 sm:flex-none"
            value={payment}
            onChange={(e) => onPayment(e.target.value)}
          >
            {PAYMENT_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="btn-secondary text-xs py-2 px-3 gap-1.5 w-full sm:w-auto sm:ml-auto">
          <Filter size={14} />
          Фильтры
        </button>
      </div>
    </div>
  );
}
