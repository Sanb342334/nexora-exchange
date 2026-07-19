'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiGet } from '@/lib/api';
import { useSocketEvent } from '@/lib/socket';
import { Card, Spinner, Empty, Badge } from '@/components/ui';
import { fmtCrypto, fmtFiat, fmtDate, dealStatusLabel, dealStatusColor } from '@/lib/format';
import type { Deal } from '@/lib/types';

export default function DealsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => apiGet<Deal[]>('/deals').then(setDeals).finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  useSocketEvent('deal:updated', () => load());
  useSocketEvent('deal:completed', () => load());
  useSocketEvent('deal:closed', () => load());
  useSocketEvent('deal:created', () => load());

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Мои сделки</h1>
      <Card>
        {deals.length === 0 ? (
          <Empty text="Сделок пока нет" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-200">
                  <th className="th">Код</th>
                  <th className="th">Тип</th>
                  <th className="th">Сумма</th>
                  <th className="th">Крипта</th>
                  <th className="th">Цена</th>
                  <th className="th">Статус</th>
                  <th className="th">Дата</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {deals.map((d) => (
                  <tr key={d.id} className="border-b border-surface-200/50">
                    <td className="td font-mono">{d.code}</td>
                    <td className="td">
                      <Badge className="bg-surface-200 text-gray-300">
                        {d.buyer.id ? '' : ''}
                        {d.status}
                      </Badge>
                    </td>
                    <td className="td">{fmtFiat(d.fiatAmount)} {d.fiat}</td>
                    <td className="td">{fmtCrypto(d.assetAmount)} {d.asset}</td>
                    <td className="td">{fmtFiat(d.price)}</td>
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
