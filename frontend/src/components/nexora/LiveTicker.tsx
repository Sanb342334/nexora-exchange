'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiGet } from '@/lib/api';
import { useFormat } from '@/lib/use-format';

type Pair = { symbol: string; base: string; quote: string; lastPrice: number; change24h: string };

export function LiveTicker({ fiat = 'KZT' }: { fiat?: string }) {
  const { fmtNum } = useFormat();
  const [usdt, setUsdt] = useState<number | null>(null);
  const [pairs, setPairs] = useState<Pair[]>([]);

  useEffect(() => {
    const load = () => {
      apiGet<{ price: number }>(`/rates/market?asset=USDT&fiat=${encodeURIComponent(fiat)}`)
        .then((r) => setUsdt(r.price))
        .catch(() => {});
      apiGet<Pair[]>('/trading/pairs?type=spot')
        .then((p) => setPairs(p.slice(0, 6)))
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [fiat]);

  return (
    <div className="hidden lg:flex items-center gap-5 border-b border-nexora-border bg-[var(--nexora-ticker-bg)] px-6 py-1.5 text-[11px] overflow-x-auto">
      <Link href="/trade" className="flex items-center gap-2 tabular-nums hover:opacity-80 shrink-0">
        <span className="text-nexora-muted">USDT/{fiat}</span>
        <span className="font-semibold text-nexora-text">{usdt ? fmtNum(usdt) : '—'}</span>
      </Link>
      {pairs.map((p) => {
        const ch = parseFloat(p.change24h);
        const up = ch >= 0;
        return (
          <Link
            key={p.symbol}
            href={`/trade/${p.base}_${p.quote}`}
            className="flex items-center gap-2 tabular-nums hover:opacity-80 shrink-0"
          >
            <span className="text-nexora-muted">
              {p.base}/{p.quote}
            </span>
            <span className="font-semibold text-nexora-text">
              {fmtNum(p.lastPrice, p.lastPrice >= 100 ? 3 : p.lastPrice >= 1 ? 3 : 5)}
            </span>
            <span className={up ? 'text-nexora-neon' : 'text-nexora-error'}>{up ? '▲' : '▼'}</span>
          </Link>
        );
      })}
      <div className="ml-auto flex items-center gap-1.5 shrink-0">
        <span className="h-1.5 w-1.5 rounded-full bg-nexora-neon animate-pulse" />
        <span className="text-nexora-muted">Live</span>
      </div>
    </div>
  );
}
