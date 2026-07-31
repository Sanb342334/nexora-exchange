'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { apiGet, apiPost, ApiError } from '@/lib/api';
import { useSocketEvent } from '@/lib/socket';
import { PageHeader, Card, Stat, Spinner } from '@/components/ui';
import { fmtCrypto, fmtFiat } from '@/lib/format';
import { Wallet, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/components/nexora/ToastProvider';

interface Dashboard {
  traders: { total: number; active: number };
  deals: { open: number; disputed: number; completed: number };
  pending: { deposits: number; withdrawals: number };
  volume: { completedFiat: string; feesCollectedAsset: string };
  house: { currency: string; available: string; frozen: string }[];
  userBalances: { currency: string; available: string; frozen: string }[];
}

export default function AdminDashboard() {
  const toast = useToast();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');
  const [seeding, setSeeding] = useState(false);

  const load = () =>
    apiGet<Dashboard>('/admin/dashboard')
      .then((d) => {
        setData(d);
        setError('');
      })
      .catch((e) => {
        setError(e instanceof ApiError ? e.message : 'Не удалось загрузить дашборд');
      });

  const seedHistory = async () => {
    if (seeding) return;
    if (!confirm('Набить себе историю за ~полгода (сделки, пополнения, выводы 50–700к)? Предыдущий фейк-пакет будет перезаписан.')) {
      return;
    }
    setSeeding(true);
    try {
      const r = await apiPost<{ deposits: number; withdrawals: number; trades: number; currency: string }>(
        '/binary/admin/seed-history',
        {},
      );
      toast(
        'success',
        `Готово: ${r.deposits} пополнений · ${r.withdrawals} выводов · ${r.trades} сделок (${r.currency})`,
      );
      load();
    } catch (e) {
      toast('error', e instanceof ApiError ? e.message : 'Не удалось накрутить стату');
    } finally {
      setSeeding(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useSocketEvent('deal:completed', load);
  useSocketEvent('deposit:requested', load);
  useSocketEvent('withdrawal:requested', load);
  useSocketEvent('dispute:opened', load);

  if (error && !data) {
    return (
      <div className="space-y-4">
        <PageHeader title="Дашборд" subtitle="Панель управления NEXORA" />
        <Card>
          <p className="text-nexora-error text-sm mb-3">{error}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary text-sm" onClick={() => load()}>
              Повторить
            </button>
            <Link href="/admin/binary" className="btn-secondary text-sm">
              Binary Ops
            </Link>
            <Link href="/admin/treasury" className="btn-secondary text-sm">
              Пополнения
            </Link>
            <Link href="/admin/support" className="btn-secondary text-sm">
              Поддержка
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  if (!data) return <Spinner />;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
        <PageHeader title="Дашборд" subtitle="Обзор платформы NEXORA" />
        <button
          type="button"
          onClick={seedHistory}
          disabled={seeding}
          className="btn-primary text-sm inline-flex items-center gap-2 shrink-0"
        >
          <Sparkles size={16} />
          {seeding ? 'Накрутка…' : 'Накрутить стату себе'}
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat label="Пользователи" value={data.traders.total} trend={`${data.traders.active} активных`} />
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
        <Card title="Балансы пользователей">
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
                  <td className="td">{b.currency}</td>
                  <td className="td text-right font-semibold">{fmtCrypto(b.available)}</td>
                  <td className="td text-right text-nexora-muted text-xs">замор. {fmtCrypto(b.frozen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
