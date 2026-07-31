'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '@/lib/api';
import { Card, Empty, Spinner } from '@/components/ui';
import { useSocketEvent } from '@/lib/socket';
import { useToast } from '@/components/nexora/ToastProvider';

type TicketRow = {
  id: string;
  updatedAt: string;
  user: { id: string; username: string; displayName?: string | null };
  messages: { body: string; createdAt: string }[];
};

type TicketDetail = {
  id: string;
  status: string;
  user: { id: string; username: string; displayName?: string | null };
  messages: {
    id: string;
    body: string;
    isStaff: boolean;
    createdAt: string;
    sender: { username: string; displayName?: string | null };
  }[];
};

export default function AdminSupportPage() {
  const toast = useToast();
  const [list, setList] = useState<TicketRow[]>([]);
  const [selected, setSelected] = useState<TicketDetail | null>(null);
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(true);

  const loadList = async () => {
    const rows = await apiGet<TicketRow[]>('/admin/support/tickets');
    setList(rows);
    setLoading(false);
  };

  const open = async (id: string) => {
    const t = await apiGet<TicketDetail>(`/admin/support/tickets/${id}`);
    setSelected(t);
  };

  useEffect(() => {
    loadList().catch(() => setLoading(false));
  }, []);

  useSocketEvent('support:message', () => {
    loadList().catch(() => {});
    if (selected) open(selected.id).catch(() => {});
  });

  const send = async () => {
    if (!selected || !reply.trim()) return;
    await apiPost(`/admin/support/tickets/${selected.id}/messages`, { body: reply.trim() });
    setReply('');
    toast('success', 'Ответ отправлен');
    await open(selected.id);
    await loadList();
  };

  if (loading) return <Spinner />;

  return (
    <div className="grid lg:grid-cols-[280px_1fr] gap-4 min-h-[560px]">
      <Card title="Тикеты" noPadding>
        <div className="max-h-[640px] overflow-y-auto divide-y divide-white/[0.04]">
          {list.length === 0 ? (
            <Empty text="Нет открытых обращений" />
          ) : (
            list.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => open(t.id)}
                className={`w-full text-left px-4 py-3 hover:bg-white/[0.03] ${
                  selected?.id === t.id ? 'bg-nexora-accent/10' : ''
                }`}
              >
                <div className="font-semibold text-white text-sm">@{t.user.username}</div>
                <div className="text-[11px] text-nexora-muted truncate mt-0.5">
                  {t.messages[0]?.body ?? '—'}
                </div>
              </button>
            ))
          )}
        </div>
      </Card>

      <Card title={selected ? `Чат · @${selected.user.username}` : 'Выберите тикет'}>
        {!selected ? (
          <Empty text="Выберите обращение слева" />
        ) : (
          <div className="flex flex-col h-[520px]">
            <div className="flex-1 overflow-y-auto space-y-2 mb-3">
              {selected.messages.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-xl px-3 py-2 text-sm max-w-[85%] ${
                    m.isStaff ? 'ml-auto bg-nexora-accent/20 text-white' : 'bg-white/[0.05] text-nexora-text'
                  }`}
                >
                  <div className="text-[10px] text-nexora-muted mb-0.5">
                    {m.isStaff ? 'Вы' : m.sender.displayName ?? m.sender.username}
                  </div>
                  {m.body}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Ответ…"
                onKeyDown={(e) => e.key === 'Enter' && send()}
              />
              <button type="button" className="btn-primary" onClick={send}>
                Отправить
              </button>
              <button
                type="button"
                className="btn-secondary text-xs"
                onClick={async () => {
                  await apiPost(`/admin/support/tickets/${selected.id}/close`);
                  setSelected(null);
                  loadList();
                }}
              >
                Закрыть
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
