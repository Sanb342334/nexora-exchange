'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';
import { useLocale } from '@/lib/i18n/locale-context';
import { useFormat } from '@/lib/use-format';

type Book = {
  bids: { price: number; amount: number }[];
  asks: { price: number; amount: number }[];
  lastPrice: number;
};

export function OrderBookPanel({ symbol }: { symbol: string }) {
  const { t } = useLocale();
  const tr = t.app.trade;
  const { fmtNum } = useFormat();
  const [book, setBook] = useState<Book | null>(null);

  useEffect(() => {
    const load = () => apiGet<Book>(`/trading/orderbook/${symbol}`).then(setBook).catch(() => {});
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [symbol]);

  if (!book) {
    return <div className="rounded-[14px] border border-nexora-border bg-[#10131C] p-4 text-sm text-nexora-muted">{tr.loadingOrderBook}</div>;
  }

  return (
    <div className="rounded-[14px] border border-nexora-border bg-[#10131C] overflow-hidden">
      <div className="border-b border-nexora-border px-3 py-2 text-xs font-semibold text-nexora-muted">{tr.orderBook}</div>
      <div className="px-2 py-1 text-[10px] text-nexora-muted flex justify-between">
        <span>{tr.price}</span>
        <span>{tr.amount}</span>
      </div>
      <div className="max-h-[280px] overflow-y-auto text-[11px]">
        {book.asks.slice(0, 12).reverse().map((a, i) => (
          <div key={`a${i}`} className="flex justify-between px-2 py-0.5 tabular-nums text-nexora-error/90 hover:bg-white/[0.03]">
            <span>{fmtNum(a.price)}</span>
            <span className="text-nexora-muted">{a.amount.toFixed(4)}</span>
          </div>
        ))}
        <div className="border-y border-nexora-border py-1.5 text-center text-sm font-bold tabular-nums text-white">
          {fmtNum(book.lastPrice)}
        </div>
        {book.bids.slice(0, 12).map((b, i) => (
          <div key={`b${i}`} className="flex justify-between px-2 py-0.5 tabular-nums text-nexora-neon/90 hover:bg-white/[0.03]">
            <span>{fmtNum(b.price)}</span>
            <span className="text-nexora-muted">{b.amount.toFixed(4)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
