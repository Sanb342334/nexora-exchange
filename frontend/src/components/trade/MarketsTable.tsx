'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiGet } from '@/lib/api';
import { useLocale } from '@/lib/i18n/locale-context';
import { useFormat } from '@/lib/use-format';
import { CryptoIcon } from '@/components/trade/CryptoIcon';

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
  const router = useRouter();
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    apiGet<Pair[]>('/trading/pairs?type=spot').then(setPairs).catch(() => {});
    const timer = setInterval(() => {
      apiGet<Pair[]>('/trading/pairs?type=spot').then(setPairs).catch(() => {});
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toUpperCase();
    if (!s) return pairs;
    return pairs.filter(
      (p) => p.base.includes(s) || p.quote.includes(s) || p.symbol.includes(s),
    );
  }, [pairs, q]);

  return (
    <div className="overflow-hidden rounded-[14px] border border-white/[0.06] bg-[#10131C]">
      <div className="border-b border-white/[0.06] px-4 py-3 space-y-2">
        <div>
          <h2 className="text-sm font-bold text-white">Криптовалюты</h2>
          <p className="text-[11px] text-nexora-muted mt-0.5">
            {pairs.length} пар · нажмите — откроется терминал
          </p>
        </div>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск пары (BTC, SOL…)"
          className="input w-full text-sm"
        />
      </div>
      <div className="max-h-[min(70vh,640px)] overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-[#10131C] z-10">
          <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-wide text-nexora-muted">
            <th className="px-4 py-3 text-left">{tr.pair}</th>
            <th className="px-4 py-3 text-right">{tr.lastPrice}</th>
            <th className="px-4 py-3 text-right">{tr.change24h}</th>
            <th className="px-4 py-3 text-right">Торговля</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((p) => {
            const ch = parseFloat(p.change24h);
            const up = ch >= 0;
            const href = `/trade/${p.base}_${p.quote}`;
            return (
              <tr
                key={p.symbol}
                role="link"
                tabIndex={0}
                onClick={() => router.push(href)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    router.push(href);
                  }
                }}
                className="border-b border-white/[0.04] hover:bg-nexora-accent/10 cursor-pointer transition"
              >
                <td className="px-4 py-3 font-semibold text-white">
                  <span className="inline-flex items-center gap-2">
                    <CryptoIcon symbol={p.base} size={22} />
                    <span>
                      {p.base}
                      <span className="text-nexora-muted">/{p.quote}</span>
                    </span>
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-white">
                  {fmtNum(p.lastPrice, p.lastPrice >= 100 ? 3 : p.lastPrice >= 1 ? 3 : 5)}
                </td>
                <td className={`px-4 py-3 text-right tabular-nums ${up ? 'text-nexora-neon' : 'text-nexora-error'}`}>
                  {up ? '+' : ''}
                  {p.change24h}%
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={href}
                    onClick={(e) => e.stopPropagation()}
                    className="text-nexora-accent hover:underline text-xs font-semibold"
                  >
                    Открыть →
                  </Link>
                </td>
              </tr>
            );
          })}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-8 text-center text-sm text-nexora-muted">
                Пары не найдены
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
