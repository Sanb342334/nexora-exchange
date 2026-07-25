'use client';

import Link from 'next/link';
import { Plus, ArrowDownToLine, ArrowUpFromLine, History, TrendingUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';
import { fmtFiat } from '@/lib/format';

const actions = [
  { href: '/ads', icon: Plus, label: 'Объявление', color: 'text-nexora-accent' },
  { href: '/wallet', icon: ArrowDownToLine, label: 'Пополнить', color: 'text-nexora-neon' },
  { href: '/wallet', icon: ArrowUpFromLine, label: 'Вывести', color: 'text-orange-400' },
  { href: '/deals', icon: History, label: 'Сделки', color: 'text-blue-400' },
];

export function MobileMarketPanel() {
  const [usdtKzt, setUsdtKzt] = useState<number | null>(null);

  useEffect(() => {
    apiGet<{ price: number }>('/rates/market').then((r) => setUsdtKzt(r.price)).catch(() => {});
  }, []);

  const rates = [
    { pair: 'BTC', val: '67,842', ch: '+2.4%', up: true },
    { pair: 'ETH', val: '3,521', ch: '+1.8%', up: true },
    { pair: 'USDT/KZT', val: usdtKzt ? fmtFiat(usdtKzt) : '499.8', ch: '+0.3%', up: true },
  ];

  return (
    <div className="lg:hidden space-y-3">
      <div className="grid grid-cols-4 gap-2">
        {actions.map(({ href, icon: Icon, label, color }) => (
          <Link
            key={label}
            href={href}
            className="flex flex-col items-center gap-1.5 rounded-[12px] border border-white/[0.06] bg-[#10131C] py-3 px-1 active:scale-[0.98] transition"
          >
            <Icon size={18} className={color} />
            <span className="text-[10px] font-medium text-nexora-muted text-center leading-tight">{label}</span>
          </Link>
        ))}
      </div>

      <div className="rounded-[14px] border border-white/[0.06] bg-[#10131C] p-3">
        <div className="flex items-center gap-2 mb-2.5">
          <TrendingUp size={14} className="text-nexora-neon" />
          <span className="text-xs font-bold text-white">Курсы</span>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-0.5">
          {rates.map((r) => (
            <div key={r.pair} className="shrink-0 min-w-[88px] rounded-[10px] bg-white/[0.03] px-3 py-2">
              <div className="text-[10px] text-nexora-muted">{r.pair}</div>
              <div className="text-sm font-bold text-white tabular-nums">{r.val}</div>
              <div className={`text-[10px] font-semibold ${r.up ? 'text-nexora-neon' : 'text-nexora-error'}`}>{r.ch}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
