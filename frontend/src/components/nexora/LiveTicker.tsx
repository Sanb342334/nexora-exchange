'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';
import { fmtFiat } from '@/lib/format';

export function LiveTicker() {
  const [price, setPrice] = useState<number | null>(null);

  useEffect(() => {
    const load = () => apiGet<{ price: number }>('/rates/market').then((r) => setPrice(r.price)).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const items = [
    { label: 'USDT/KZT', val: price ? fmtFiat(price) : '—', up: true },
    { label: 'BTC', val: '67,842', up: true },
    { label: 'ETH', val: '3,521', up: true },
  ];

  return (
    <div className="hidden lg:flex items-center gap-6 border-b border-white/[0.04] bg-[#080A10] px-6 py-1.5 text-[11px]">
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-2 tabular-nums">
          <span className="text-nexora-muted">{i.label}</span>
          <span className="font-semibold text-white">{i.val}</span>
          <span className={i.up ? 'text-nexora-neon' : 'text-nexora-error'}>{i.up ? '▲' : '▼'}</span>
        </div>
      ))}
      <div className="ml-auto flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-nexora-neon animate-pulse" />
        <span className="text-nexora-muted">Live</span>
      </div>
    </div>
  );
}
