'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { apiGet } from '@/lib/api';
import { useSocketEvent } from '@/lib/socket';
import { PageHeader, Card, Stat, Spinner } from '@/components/ui';
import { fmtCrypto, fmtFiat } from '@/lib/format';
import { Wallet, TrendingUp, AlertTriangle } from 'lucide-react';

interface Dashboard {
  traders: { total: number; active: number };
  deals: { open: number; disputed: number; completed: number };
  pending: { deposits: number; withdrawals: number };
  volume: { completedFiat: string; feesCollectedAsset: string };
  house: { currency: string; available: string; frozen: string }[];
  userBalances: { currency: string; available: string; frozen: string }[];
}

export default function AdminDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);

  const load = () => apiGet<Dashboard>('/admin/dashboard').then(setData);

  useEffect(() => {
    load();
  }, []);

  useSocketEvent('deal:completed', load);
  useSocketEvent('deposit:requested', load);
  useSocketEvent('withdrawal:requested', load);
  useSocketEvent('dispute:opened', load);

  if (!data) return <Spinner />;

  return (
    <div>
      <PageHeader title="Дашборд" subtitle="Обзор платформы NEXORA в реальном времени" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat label="Сотрудники" value={data.traders.total} trend={`${data.traders.active} активных`} />
        <Stat label="Открытые сделки" value={data.deals.open} trend={`${data.deals.completed} завершено`} />
        <Stat label="Споры" value={data.deals.disputed} trend="требуют решения" />
        <Stat
          label="Ожидают обработки"
          value={data.pending.deposits + data.pending.withdrawals}
          trend={`${data.pending.deposits} деп. · ${data.pending.withdrawals} выв.`}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Stat label="Оборот (завершённые)" value={`${fmtFiat(data.volume.completedFiat)} ₽`} />
        </motion.div>
        <Stat label="Комиссия собрана" value={`${fmtCrypto(data.volume.feesCollectedAsset)} USDT`} trend="доход платформы" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Балансы сотрудников">
          <table className="w-full">
            <tbody>
              {data.userBalances.map((b) => (
                <tr key={b.currency} className="border-b border-white/[0.04]">
                  <td className="td flex items-center gap-2">
                    <Wallet size={14} className="text-nexora-accent" />
                    {b.currency}
                  </td>
                  <td className="td text-right font-semibold">{fmtCrypto(b.available)}</td>
                  <td className="td text-right text-nexora-muted text-xs">замор. {fmtCrypto(b.frozen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="House / Treasury">
          <table className="w-full">
            <tbody>
              {data.house.map((b) => (
                <tr key={b.currency} className="border-b border-white/[0.04]">
                  <td className="td flex items-center gap-2">
                    <TrendingUp size={14} className="text-nexora-success" />
                    {b.currency}
                  </td>
                  <td className="td text-right font-semibold">{fmtCrypto(b.available)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-nexora-muted px-1">
            Отрицательный баланс house = обязательства обменника перед сотрудниками.
          </p>
        </Card>
      </div>

      {(data.deals.disputed > 0 || data.pending.deposits > 0) && (
        <div className="mt-6 rounded-nexora bg-nexora-error/10 border border-nexora-error/20 p-4 flex items-center gap-3">
          <AlertTriangle className="text-nexora-error shrink-0" size={20} />
          <div className="text-sm">
            <span className="font-semibold text-white">Требует внимания: </span>
            <span className="text-nexora-muted">
              {data.deals.disputed > 0 && `${data.deals.disputed} спор(ов)`}
              {data.deals.disputed > 0 && data.pending.deposits > 0 && ', '}
              {data.pending.deposits > 0 && `${data.pending.deposits} депозит(ов)`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
