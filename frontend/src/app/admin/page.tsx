'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';
import { useSocketEvent } from '@/lib/socket';
import { Card, Stat, Spinner } from '@/components/ui';
import { fmtCrypto, fmtFiat } from '@/lib/format';

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
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Дашборд</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Сотрудники" value={data.traders.total} hint={`Активных: ${data.traders.active}`} />
        <Stat label="Открытые сделки" value={data.deals.open} hint={`Завершено: ${data.deals.completed}`} />
        <Stat label="Споры" value={data.deals.disputed} hint="Требуют решения" />
        <Stat
          label="Ожидают"
          value={data.pending.deposits + data.pending.withdrawals}
          hint={`Депозиты: ${data.pending.deposits} · Выводы: ${data.pending.withdrawals}`}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Stat label="Оборот (завершённые сделки)" value={`${fmtFiat(data.volume.completedFiat)} RUB`} />
        <Stat label="Комиссия собрана" value={`${fmtCrypto(data.volume.feesCollectedAsset)} USDT`} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card title="Балансы сотрудников (итого)">
          <table className="w-full">
            <tbody>
              {data.userBalances.map((b) => (
                <tr key={b.currency} className="border-b border-surface-200/50">
                  <td className="td">{b.currency}</td>
                  <td className="td text-right">{fmtCrypto(b.available)}</td>
                  <td className="td text-right text-gray-500">заморожено {fmtCrypto(b.frozen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="House / Treasury (обязательства платформы)">
          <table className="w-full">
            <tbody>
              {data.house.map((b) => (
                <tr key={b.currency} className="border-b border-surface-200/50">
                  <td className="td">{b.currency}</td>
                  <td className="td text-right">{fmtCrypto(b.available)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-gray-500 mt-3">
            Отрицательный баланс house = сумма средств, выданных сотрудникам (обязательства обменника).
          </p>
        </Card>
      </div>
    </div>
  );
}
