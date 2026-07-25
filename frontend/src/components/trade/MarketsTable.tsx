'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiGet } from '@/lib/api';
import { useLocale } from '@/lib/i18n/locale-context';
import { useFormat } from '@/lib/use-format';

type Pair = {
  symbol: string;
  base: string;
  quote: string;
  lastPrice: number;
  change24h: string;
};

export function MarketsTable() {
  const { t } = useLocale();
  const tr = t.app.trade;
  const { fmtNum } = useFormat();
  const [tab, setTab] = useState<'spot' | 'futures'>('spot');
  const [pairs, setPairs] = useState<Pair[]>([]);

  useEffect(() => {
    apiGet<Pair[]>(`/trading/pairs?type=${tab}`).then(setPairs).catch(() => {});
    const timer = setInterval(() => {
      apiGet<Pair[]>(`/trading/pairs?type=${tab}`).then(setPairs).catch(() => {});
    }, 30000);
    return () => clearInterval(timer);
  }, [tab]);

  return (
    <div className="overflow-hidden rounded-[14px] border border-white/[0.06] bg-[#10131C]">
      <div className="flex gap-1 border-b border-white/[0.06] p-2">
        {(['spot', 'futures'] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => setTab(kind)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${tab === kind ? 'bg-nexora-accent/20 text-nexora-accent' : 'text-nexora-muted'}`}
          >
            {kind === 'spot' ? tr.marketsSpot : tr.marketsFutures}
          </button>
        ))}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-wide text-nexora-muted">
            <th className="px-4 py-3 text-left">{tr.pair}</th>
            <th className="px-4 py-3 text-right">{tr.lastPrice}</th>
            <th className="px-4 py-3 text-right">{tr.change24h}</th>
            <th className="px-4 py-3 text-right">{tr.trade}</th>
          </tr>
        </thead>
        <tbody>
          {pairs.map((p) => {
            const ch = parseFloat(p.change24h);
            const up = ch >= 0;
            const href = tab === 'futures'
              ? `/trade/${p.base}_${p.quote}?type=futures`
              : `/trade/${p.base}_${p.quote}`;
            return (
              <tr key={p.symbol} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                <td className="px-4 py-3 font-semibold text-white">
                  {p.base}<span className="text-nexora-muted">/{p.quote}</span>
                  {tab === 'futures' && <span className="ml-1 text-[10px] text-nexora-accent">PERP</span>}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-white">{fmtNum(p.lastPrice)}</td>
                <td className={`px-4 py-3 text-right tabular-nums ${up ? 'text-nexora-neon' : 'text-nexora-error'}`}>
                  {up ? '+' : ''}{p.change24h}%
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={href} className="text-nexora-accent hover:underline text-xs font-semibold">
                    {tr.chartLink}
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
