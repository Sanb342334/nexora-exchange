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

export default function MessagesPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<Deal[]>('/deals')
      .then((d) => setDeals(d.filter((x) => ['CREATED', 'PAID', 'DISPUTED'].includes(x.status))))
      .finally(() => setLoading(false));
  }, []);

  return (
    <PageMotion>
      <PageHeader
        title="Сообщения"
        subtitle="Активные чаты по сделкам — общайтесь с контрагентом напрямую"
      />
      {loading ? (
        <Spinner />
      ) : deals.length === 0 ? (
        <div className="glass-card">
          <Empty
            text="Нет активных чатов. Откройте сделку на маркете или создайте заявку"
            icon={<MessageCircle size={48} className="text-nexora-muted" />}
          />
        </div>
      ) : (
        <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-3">
          {deals.map((d) => {
            const counterparty =
              d.buyer.displayName ?? d.seller.displayName ?? d.seller.username ?? 'Контрагент';
            return (
              <motion.div key={d.id} variants={staggerItem} whileHover={{ scale: 1.01 }}>
                <Link
                  href={`/deals/${d.id}`}
                  className="flex items-center justify-between gap-4 rounded-[18px] border border-white/[0.07] bg-nexora-card p-4 hover:border-nexora-accent/30 transition"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-nexora-gradient shadow-glow-sm text-lg font-bold text-white">
                      {counterparty.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-semibold text-white">{counterparty}</div>
                      <div className="text-xs text-nexora-muted mt-0.5">
                        Сделка {d.code} · {fmtDate(d.createdAt)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
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
