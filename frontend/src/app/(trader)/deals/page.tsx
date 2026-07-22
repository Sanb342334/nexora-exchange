'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { apiGet } from '@/lib/api';
import { useSocketEvent } from '@/lib/socket';
import { Card, Spinner, Empty, Badge, PageHeader } from '@/components/ui';
import { fmtCrypto, fmtFiat, fmtDate, dealStatusLabel, dealStatusColor } from '@/lib/format';
import { PageMotion } from '@/components/nexora/PageMotion';
import { RippleButton } from '@/components/nexora/RippleButton';
import { staggerContainer, tableRow } from '@/lib/motion';
import type { Deal } from '@/lib/types';

export default function DealsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'done'>('all');

  const load = () => apiGet<Deal[]>('/deals').then(setDeals).finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  useSocketEvent('deal:updated', () => load());
  useSocketEvent('deal:completed', () => load());
  useSocketEvent('deal:closed', () => load());
  useSocketEvent('deal:created', () => load());

  if (loading) return <Spinner />;

  const activeStatuses = ['CREATED', 'PAID', 'DISPUTED'];
  const filtered = deals.filter((d) => {
    if (filter === 'active') return activeStatuses.includes(d.status);
    if (filter === 'done') return !activeStatuses.includes(d.status);
    return true;
  });

  return (
    <PageMotion className="space-y-6">
      <PageHeader title="Мои сделки" subtitle="История и активные P2P-сделки с эскроу-защитой" />
      <div className="flex gap-2">
        {(['all', 'active', 'done'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              filter === f ? 'bg-nexora-accent/15 text-nexora-accent border border-nexora-accent/30' : 'text-nexora-muted hover:text-white bg-white/[0.03]'
            }`}
          >
            {f === 'all' ? 'Все' : f === 'active' ? 'Активные' : 'Завершённые'}
          </button>
        ))}
      </div>
      <Card noPadding>
        {filtered.length === 0 ? (
          <Empty text="Сделок пока нет" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Код</th>
                  <th className="th">Сумма</th>
                  <th className="th">Крипта</th>
                  <th className="th">Цена</th>
                  <th className="th">Статус</th>
                  <th className="th">Дата</th>
                  <th className="th text-right pr-6">Действие</th>
                </tr>
              </thead>
              <motion.tbody variants={staggerContainer} initial="hidden" animate="visible">
                {filtered.map((d) => (
                  <motion.tr
                    key={d.id}
                    variants={tableRow}
                    whileHover={{ backgroundColor: 'rgba(123,97,255,0.04)' }}
                  >
                    <td className="td font-mono text-nexora-accent">{d.code}</td>
                    <td className="td font-semibold text-white">
                      {fmtFiat(d.fiatAmount)} {d.fiat}
                    </td>
                    <td className="td">{fmtCrypto(d.assetAmount)} {d.asset}</td>
                    <td className="td text-[#4CAF50] font-bold">{fmtFiat(d.price)}</td>
                    <td className="td">
                      <Badge className={dealStatusColor[d.status]}>{dealStatusLabel[d.status]}</Badge>
                    </td>
                    <td className="td text-nexora-muted">{fmtDate(d.createdAt)}</td>
                    <td className="td text-right pr-6">
                      <Link href={`/deals/${d.id}`}>
                        <RippleButton variant="outline">Открыть</RippleButton>
                      </Link>
                    </td>
                  </motion.tr>
                ))}
              </motion.tbody>
            </table>
          </div>
        )}
      </Card>
    </PageMotion>
  );
}
