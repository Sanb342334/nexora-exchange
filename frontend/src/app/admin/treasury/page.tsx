'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '@/lib/api';
import { useSocketEvent } from '@/lib/socket';
import { Card, Spinner, Empty } from '@/components/ui';
import { fmtCrypto, fmtDate } from '@/lib/format';

interface Req {
  id: string;
  currency: string;
  amount: string;
  status: string;
  method?: string | null;
  destination?: string;
  createdAt: string;
  user: { username: string; displayName?: string | null };
}

export default function AdminTreasuryPage() {
  const [deposits, setDeposits] = useState<Req[]>([]);
  const [withdrawals, setWithdrawals] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [d, w] = await Promise.all([
      apiGet<Req[]>('/admin/treasury/deposits?status=PENDING'),
      apiGet<Req[]>('/admin/treasury/withdrawals?status=PENDING'),
    ]);
    setDeposits(d);
    setWithdrawals(w);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  useSocketEvent('deposit:requested', load);
  useSocketEvent('withdrawal:requested', load);

  const act = async (kind: 'deposits' | 'withdrawals', id: string, action: 'approve' | 'reject') => {
    await apiPost(`/admin/treasury/${kind}/${id}/${action}`, {});
    load();
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Депозиты и выводы</h1>

      <Card title={`Заявки на пополнение (${deposits.length})`}>
        {deposits.length === 0 ? (
          <Empty text="Нет заявок" />
        ) : (
          <div className="space-y-2">
            {deposits.map((r) => (
              <div key={r.id} className="flex items-center justify-between border border-surface-200 rounded-lg p-3">
                <div>
                  <div className="text-sm font-medium">
                    @{r.user.username} · <span className="text-emerald-400">+{fmtCrypto(r.amount)} {r.currency}</span>
                  </div>
                  <div className="text-xs text-gray-400">{r.method ?? ''} · {fmtDate(r.createdAt)}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => act('deposits', r.id, 'approve')} className="btn-success text-xs px-3 py-1">Подтвердить</button>
                  <button onClick={() => act('deposits', r.id, 'reject')} className="btn-danger text-xs px-3 py-1">Отклонить</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title={`Заявки на вывод (${withdrawals.length})`}>
        {withdrawals.length === 0 ? (
          <Empty text="Нет заявок" />
        ) : (
          <div className="space-y-2">
            {withdrawals.map((r) => (
              <div key={r.id} className="flex items-center justify-between border border-surface-200 rounded-lg p-3">
                <div>
                  <div className="text-sm font-medium">
                    @{r.user.username} · <span className="text-red-400">-{fmtCrypto(r.amount)} {r.currency}</span>
                  </div>
                  <div className="text-xs text-gray-400">→ {r.destination} · {fmtDate(r.createdAt)}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => act('withdrawals', r.id, 'approve')} className="btn-success text-xs px-3 py-1">Выплатить</button>
                  <button onClick={() => act('withdrawals', r.id, 'reject')} className="btn-danger text-xs px-3 py-1">Отклонить</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
