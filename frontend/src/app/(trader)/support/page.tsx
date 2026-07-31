'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { apiGet, apiPost, ApiError } from '@/lib/api';
import { reconnectSocket, useSocketEvent } from '@/lib/socket';
import { useToast } from '@/components/nexora/ToastProvider';
import { useAuth } from '@/lib/auth';

type Msg = {
  id: string;
  body: string;
  isStaff: boolean;
  createdAt: string;
  sender: { id: string; username: string; displayName?: string | null };
};

type Ticket = {
  id: string;
  status: string;
  messages: Msg[];
};

export default function SupportPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const t = await apiGet<Ticket>('/support/ticket');
    setTicket(t);
    return t;
  }, []);

  const mergeMessage = useCallback((incoming: Msg) => {
    setTicket((prev) => {
      if (!prev) return prev;
      if (prev.messages.some((m) => m.id === incoming.id)) return prev;
      return { ...prev, messages: [...prev.messages, incoming] };
    });
  }, []);

  useEffect(() => {
    reconnectSocket();
    load().catch(() => {});
  }, [load]);

  // Polling fallback — Mini App / ngrok sockets are flaky
  useEffect(() => {
    const t = setInterval(() => {
      load().catch(() => {});
    }, 2500);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [ticket?.messages?.length]);

  useSocketEvent('support:message', (payload: { ticketId?: string; message?: Msg }) => {
    if (payload?.message?.id) {
      mergeMessage(payload.message);
    } else {
      load().catch(() => {});
    }
  });

  useSocketEvent('support:reply', (payload: { message?: Msg }) => {
    if (payload?.message?.id) mergeMessage(payload.message);
    else load().catch(() => {});
  });

  useSocketEvent('support:cleared', () => {
    setTicket(null);
    load().catch(() => {});
  });

  useSocketEvent('notification', (n: { type?: string; title?: string }) => {
    if (n?.type === 'SYSTEM' || /поддержк/i.test(n?.title || '')) {
      load().catch(() => {});
    }
  });

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      const msg = await apiPost<Msg>('/support/messages', { body: text.trim() });
      setText('');
      if (msg?.id) mergeMessage(msg);
      await load();
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Не удалось отправить');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto flex flex-col h-[calc(100dvh-140px)] min-h-[480px]">
      <div className="mb-3">
        <h1 className="font-display text-2xl font-bold text-white">Техподдержка</h1>
        <p className="text-sm text-nexora-muted">Чат с операторами платформы</p>
      </div>

      <div className="flex-1 glass-card flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {!ticket?.messages?.length && (
            <p className="text-sm text-nexora-muted text-center py-10">
              Напишите сообщение — оператор ответит в этом чате
            </p>
          )}
          {ticket?.messages?.map((m) => {
            const mine = m.sender.id === user?.id && !m.isStaff;
            const staffLabel = m.isStaff
              ? (m.sender.displayName || m.sender.username || 'Оператор').trim().split(/\s+/)[0]
              : null;
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm ${
                    mine
                      ? 'bg-nexora-accent/25 text-white rounded-br-md'
                      : 'bg-white/[0.06] text-nexora-text rounded-bl-md'
                  }`}
                >
                  {staffLabel && !mine && (
                    <div className="text-[11px] font-semibold text-nexora-neon mb-1">{staffLabel}</div>
                  )}
                  <div className="whitespace-pre-wrap break-words">{m.body}</div>
                  <div className="text-[10px] text-nexora-muted mt-1">
                    {new Date(m.createdAt).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-white/[0.06] p-3 flex gap-2">
          <input
            className="input flex-1"
            placeholder="Ваше сообщение…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button type="button" className="btn-primary px-4" disabled={sending} onClick={send}>
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
