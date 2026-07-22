'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';
import { PageHeader, Card, Spinner, Empty, Badge } from '@/components/ui';
import { fmtFiat } from '@/lib/format';
import type { Advertisement } from '@/lib/types';
import { Megaphone, UserCheck } from 'lucide-react';

export default function AdminAdsPage() {
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<Advertisement[]>('/advertisements?status=ACTIVE')
      .then(setAds)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Объявления"
        subtitle="Все активные объявления платформы — берите в работу"
      />

      <Card noPadding>
        {ads.length === 0 ? (
          <Empty text="Нет активных объявлений" icon={<Megaphone size={48} />} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="th">Трейдер</th>
                  <th className="th">Тип</th>
                  <th className="th">Цена</th>
                  <th className="th">Объём</th>
                  <th className="th">Статус</th>
                  <th className="th text-right">Действие</th>
                </tr>
              </thead>
              <tbody>
                {ads.map((ad) => (
                  <tr key={ad.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                    <td className="td font-semibold">{ad.user.displayName ?? ad.user.username}</td>
                    <td className="td">
                      <Badge className={ad.side === 'SELL' ? 'bg-nexora-error/15 text-nexora-error' : 'bg-nexora-success/15 text-nexora-success'}>
                        {ad.side === 'SELL' ? 'Продажа' : 'Покупка'}
                      </Badge>
                    </td>
                    <td className="td font-display font-bold">{fmtFiat(ad.effectivePrice)} {ad.fiat}</td>
                    <td className="td">{fmtFiat(ad.availableAmount)}</td>
                    <td className="td">
                      <Badge className="bg-nexora-accent/15 text-nexora-accent">{ad.status}</Badge>
                    </td>
                    <td className="td text-right">
                      <button className="btn-primary text-xs">
                        <UserCheck size={14} />
                        Взять в работу
                      </button>
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
