'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '@/lib/api';
import { useSocketEvent } from '@/lib/socket';
import { Card, Spinner, Empty } from '@/components/ui';
import { fmtCrypto, fmtDate } from '@/lib/format';
import { useToast } from '@/components/nexora/ToastProvider';
import { resolveUploadUrl } from '@/lib/api';

type Deposit = {
  id: string;
  currency: string;
  amount: string;
  status: string;
  stage: string;
  method?: string | null;
  proofUrl?: string | null;
  requisites?: string | null;
  createdAt: string;
  user: { username: string; displayName?: string | null };
};

type Withdrawal = {
  id: string;
  currency: string;
  amount: string;
  status: string;
  destination?: string;
  createdAt: string;
  user: { username: string; displayName?: string | null };
};

export default function AdminTreasuryPage() {
  const toast = useToast();
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [reqText, setReqText] = useState<Record<string, string>>({});
  const [reqComment, setReqComment] = useState<Record<string, string>>({});

  const load = async () => {
    const [d, w] = await Promise.all([
      apiGet<Deposit[]>('/admin/treasury/deposits?status=PENDING'),
      apiGet<Withdrawal[]>('/admin/treasury/withdrawals?status=PENDING'),
    ]);
    setDeposits(d);
    setWithdrawals(w);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  useSocketEvent('deposit:requested', load);
  useSocketEvent('deposit:proof', () => {
    toast('success', 'Пришёл чек пополнения');
    load();
  });
  useSocketEvent('deposit:updated', load);
  useSocketEvent('deposit:cancelled', load);
  useSocketEvent('withdrawal:requested', load);

  const assign = async (id: string) => {
    const text = reqText[id]?.trim();
    if (!text) {
      toast('error', 'Введите реквизиты для этой заявки');
      return;
    }
    await apiPost(`/admin/treasury/deposits/${id}/requisites`, {
      requisites: text,
      comment: reqComment[id]?.trim() || undefined,
    });
    toast('success', 'Реквизиты отправлены пользователю');
    load();
  };

  const act = async (kind: 'deposits' | 'withdrawals', id: string, action: 'approve' | 'reject') => {
    let note: string | undefined;
    if (action === 'reject' && kind === 'withdrawals') {
      const reason = window.prompt('Причина отказа (увидит пользователь):');
      if (!reason?.trim()) {
        toast('error', 'Укажите причину отказа');
        return;
      }
      note = reason.trim();
    }
    await apiPost(`/admin/treasury/${kind}/${id}/${action}`, note ? { note } : {});
    toast('success', action === 'approve' ? 'Подтверждено' : 'Отклонено');
    load();
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Финансы · Пополнения</h1>
        <p className="text-sm text-nexora-muted mt-1">
          На каждую заявку выдайте свои реквизиты. Чек приходит сюда и в Telegram-админку (если настроен бот).
        </p>
      </div>

      <Card title={`Очередь пополнений (${deposits.length})`}>
        {deposits.length === 0 ? (
          <Empty text="Нет активных заявок" />
        ) : (
          <div className="space-y-4">
            {deposits.map((r) => (
              <div key={r.id} className="border border-white/[0.07] rounded-xl p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">
                      @{r.user.username} ·{' '}
                      <span className="text-emerald-400">
                        +{fmtCrypto(r.amount)} {r.currency}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {r.stage} · {fmtDate(r.createdAt)}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {r.proofUrl && (
                      <>
                        <button onClick={() => act('deposits', r.id, 'approve')} className="btn-success text-xs px-3 py-1">
                          Зачислить
                        </button>
                        <button onClick={() => act('deposits', r.id, 'reject')} className="btn-danger text-xs px-3 py-1">
                          Отклонить
                        </button>
                      </>
                    )}
                    {!r.proofUrl && r.requisites && (
                      <button onClick={() => act('deposits', r.id, 'reject')} className="btn-danger text-xs px-3 py-1">
                        Отклонить
                      </button>
                    )}
                  </div>
                </div>

                {!r.requisites ? (
                  <div className="space-y-2 rounded-xl border border-nexora-accent/25 bg-nexora-accent/5 p-3">
                    <div className="text-xs font-semibold text-nexora-accent">Форма выдачи реквизитов</div>
                    <label className="text-xs text-nexora-muted">Реквизиты карты / счёта</label>
                    <textarea
                      className="input min-h-[90px] text-sm"
                      placeholder="Номер карты, банк, ФИО…"
                      value={reqText[r.id] ?? ''}
                      onChange={(e) => setReqText((s) => ({ ...s, [r.id]: e.target.value }))}
                    />
                    <label className="text-xs text-nexora-muted">Комментарий для пользователя</label>
                    <input
                      className="input text-sm"
                      placeholder="Напр.: перевод только с карты того же банка"
                      value={reqComment[r.id] ?? ''}
                      onChange={(e) => setReqComment((s) => ({ ...s, [r.id]: e.target.value }))}
                    />
                    <button type="button" className="btn-primary text-xs" onClick={() => assign(r.id)}>
                      Выдать реквизиты пользователю
                    </button>
                  </div>
                ) : (
                  <div className="text-xs">
                    <div className="text-nexora-muted mb-1">Выданные реквизиты:</div>
                    <pre className="whitespace-pre-wrap bg-black/30 rounded-lg p-3 border border-white/[0.06]">{r.requisites}</pre>
                  </div>
                )}

                {r.proofUrl && (
                  <a
                    href={resolveUploadUrl(r.proofUrl)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex text-xs font-semibold text-nexora-accent hover:underline"
                  >
                    Открыть чек →
                  </a>
                )}
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
              <div key={r.id} className="flex items-center justify-between border border-white/[0.07] rounded-lg p-3">
                <div>
                  <div className="text-sm font-medium">
                    @{r.user.username} · {fmtCrypto(r.amount)} {r.currency}
                  </div>
                  <div className="text-xs text-gray-400">
                    {r.destination} · {fmtDate(r.createdAt)}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => act('withdrawals', r.id, 'approve')} className="btn-success text-xs px-3 py-1">
                    Подтвердить
                  </button>
                  <button onClick={() => act('withdrawals', r.id, 'reject')} className="btn-danger text-xs px-3 py-1">
                    Отклонить
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
