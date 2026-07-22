'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Star, Trash2 } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { PageHeader, Empty, Spinner } from '@/components/ui';
import { PageMotion } from '@/components/nexora/PageMotion';
import { PaymentMethodIcon } from '@/components/nexora/PaymentMethodIcon';
import { fmtFiat } from '@/lib/format';
import type { Advertisement } from '@/lib/types';

const FAV_KEY = 'nexora_favorites';

export default function FavoritesPage() {
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [favIds, setFavIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]') as string[];
    setFavIds(stored);
    apiGet<Advertisement[]>('/advertisements?status=ACTIVE')
      .then((all) => setAds(all.filter((a) => stored.includes(a.id))))
      .finally(() => setLoading(false));
  }, []);

  const remove = (id: string) => {
    const next = favIds.filter((x) => x !== id);
    setFavIds(next);
    localStorage.setItem(FAV_KEY, JSON.stringify(next));
    setAds((a) => a.filter((x) => x.id !== id));
  };

  return (
    <PageMotion>
      <PageHeader title="Избранное" subtitle="Сохранённые объявления для быстрого доступа" />
      {loading ? (
        <Spinner />
      ) : ads.length === 0 ? (
        <div className="glass-card">
          <Empty
            text="Добавляйте трейдеров в избранное на странице маркета"
            icon={<Star size={48} className="text-nexora-muted" />}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {ads.map((ad) => (
            <motion.div
              key={ad.id}
              layout
              whileHover={{ scale: 1.01 }}
              className="flex items-center justify-between gap-4 rounded-[18px] border border-white/[0.07] bg-nexora-card p-4"
            >
              <div className="flex items-center gap-4">
                <div className="h-11 w-11 rounded-full bg-nexora-gradient flex items-center justify-center font-bold text-white">
                  {(ad.user.displayName ?? ad.user.username).charAt(0)}
                </div>
                <div>
                  <div className="font-semibold text-white">{ad.user.displayName ?? ad.user.username}</div>
                  <div className="text-[#4CAF50] font-bold">{fmtFiat(ad.effectivePrice)} {ad.fiat}</div>
                  <div className="flex gap-1 mt-1">
                    {ad.paymentMethods.slice(0, 3).map((p) => (
                      <PaymentMethodIcon
                        key={p.paymentMethod.id}
                        type={p.paymentMethod.type}
                        bankName={p.paymentMethod.bankName}
                        compact
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Link href="/market" className="btn-primary text-xs py-2">
                  Торговать
                </Link>
                <button onClick={() => remove(ad.id)} className="btn-ghost p-2 text-nexora-error">
                  <Trash2 size={16} />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </PageMotion>
  );
}
