'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { MessageCircle, ArrowRight } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { PageHeader, Empty, Spinner } from '@/components/ui';
import { PageMotion } from '@/components/nexora/PageMotion';
import { staggerContainer, staggerItem } from '@/lib/motion';
import { fmtDate, dealStatusLabel, dealStatusColor } from '@/lib/format';
import type { Deal } from '@/lib/types';

const ACTIVE = ['CREATED', 'PAID', 'DISPUTED'];

export default function MessagesPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'active' | 'history'>('active');

  useEffect(() => {
    apiGet<Deal[]>('/deals')
      .then(setDeals)
      .finally(() => setLoading(false));
  }, []);

  const filtered = deals.filter((d) =>
    tab === 'active' ? ACTIVE.includes(d.status) : !ACTIVE.includes(d.status),
  );

  return (
    <PageMotion>
      <PageHeader
        title="Сообщения"
        subtitle="Чаты по сделкам — активные и архивные переписки"
      />

      <div className="flex gap-2 mb-6">
        {(['active', 'history'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              tab === t
                ? 'bg-nexora-accent/15 text-nexora-accent border border-nexora-accent/30'
                : 'text-nexora-muted hover:text-white bg-white/[0.03]'
            }`}
          >
            {t === 'active' ? 'Активные' : 'История'}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <div className="glass-card">
          <Empty
            text={
              tab === 'active'
                ? 'Нет активных чатов. Откройте сделку на маркете или создайте заявку'
                : 'Архивных чатов пока нет'
            }
            icon={<MessageCircle size={48} className="text-nexora-muted" />}
          />
        </div>
      ) : (
        <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-3">
          {filtered.map((d) => {
            const counterparty =
              d.buyer.displayName ?? d.seller.displayName ?? d.seller.username ?? 'Контрагент';
            const preview = d.lastMessage?.body ?? 'Нет сообщений';
            return (
              <motion.div key={d.id} variants={staggerItem}>
                <Link
                  href={`/deals/${d.id}`}
                  className="flex items-center justify-between gap-4 rounded-[18px] border border-white/[0.07] bg-nexora-card p-4 hover:border-nexora-accent/30 hover:bg-nexora-cardHover transition-colors"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-nexora-gradient shadow-glow-sm text-lg font-bold text-white">
                      {counterparty.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-white">{counterparty}</div>
                      <div className="text-xs text-nexora-muted mt-0.5 truncate">
                        Сделка {d.code} · {fmtDate(d.createdAt)}
                      </div>
                      <div className="text-sm text-nexora-muted mt-1 truncate">{preview}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`badge ${dealStatusColor[d.status]}`}>
                      {dealStatusLabel[d.status]}
                    </span>
                    <ArrowRight size={16} className="text-nexora-accent" />
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </PageMotion>
  );
}
