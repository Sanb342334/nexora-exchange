'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';
import { useSocketEvent } from '@/lib/socket';
import { Card, Stat, Spinner, Empty, Badge } from '@/components/ui';
import { fmtCrypto, fmtFiat, fmtDate, dealStatusLabel, dealStatusColor } from '@/lib/format';
import type { Balance, Deal } from '@/lib/types';
import Link from 'next/link';

export default function DashboardPage() {
  const [balances, setBalances] = useState<Balance[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [market, setMarket] = useState<{ price: number; source: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [b, d, m] = await Promise.all([
      apiGet<Balance[]>('/wallets/balances'),
      apiGet<Deal[]>('/deals'),
      apiGet<{ price: number; source: string }>('/rates/market'),
    ]);
    setBalances(b);
    setDeals(d);
    setMarket(m);
    setLoading(false);
  };

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, []);

  useSocketEvent('balance:update', (b: Balance[]) => setBalances(b));
  useSocketEvent('deal:completed', () => load());
  useSocketEvent('deal:closed', () => load());

  if (loading) return <Spinner />;

  const activeDeals = deals.filter((d) => ['CREATED', 'PAID', 'DISPUTED'].includes(d.status));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Обзор</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {balances.map((b) => (
          <Stat
            key={b.currency}
            label={`Баланс ${b.currency}`}
            value={b.currency === 'USDT' ? fmtCrypto(b.available) : fmtFiat(b.available)}
            hint={`В сделках: ${b.currency === 'USDT' ? fmtCrypto(b.frozen) : fmtFiat(b.frozen)}`}
          />
        ))}
        <Stat
          label="Курс USDT"
          value={market ? fmtFiat(market.price) : '—'}
          hint={`Источник: ${market?.source ?? '—'}`}
        />
      </div>

      <Card title="Активные сделки" action={<Link href="/deals" className="text-xs text-brand">Все сделки →</Link>}>
        {activeDeals.length === 0 ? (
          <Empty text="Нет активных сделок" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-200">
                  <th className="th">Код</th>
                  <th className="th">Сумма</th>
                  <th className="th">Крипта</th>
                  <th className="th">Статус</th>
                  <th className="th">Создана</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {activeDeals.map((d) => (
                  <tr key={d.id} className="border-b border-surface-200/50">
                    <td className="td font-mono">{d.code}</td>
                    <td className="td">{fmtFiat(d.fiatAmount)} {d.fiat}</td>
                    <td className="td">{fmtCrypto(d.assetAmount)} {d.asset}</td>
                    <td className="td">
                      <Badge className={dealStatusColor[d.status]}>{dealStatusLabel[d.status]}</Badge>
                    </td>
                    <td className="td text-gray-400">{fmtDate(d.createdAt)}</td>
                    <td className="td">
                      <Link href={`/deals/${d.id}`} className="text-brand text-xs">Открыть</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
