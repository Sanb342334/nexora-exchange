'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiGet, apiPost, ApiError } from '@/lib/api';
import { getSocket, useSocketEvent } from '@/lib/socket';
import { useAuth } from '@/lib/auth';
import { Card, Spinner, Badge, Field, Modal } from '@/components/ui';
import {
  fmtCrypto,
  fmtFiat,
  fmtDate,
  timeLeft,
  dealStatusLabel,
  dealStatusColor,
} from '@/lib/format';
import type { ChatMessage, Deal } from '@/lib/types';

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [, forceTick] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    const d = await apiGet<Deal>(`/deals/${id}`);
    setDeal(d);
    setMessages(d.chatMessages ?? []);
  };

  useEffect(() => {
    load().catch(() => {});
    const s = getSocket();
    s.emit('deal:join', id);
    return () => {
      s.emit('deal:leave', id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // countdown ticker
  useEffect(() => {
    const t = setInterval(() => forceTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useSocketEvent('chat:message', (m: ChatMessage) => {
    if (m.dealId === id) setMessages((prev) => [...prev, m]);
  });
  useSocketEvent('deal:updated', (d: Deal) => d.id === id && setDeal(d));
  useSocketEvent('deal:completed', (d: Deal) => d.id === id && setDeal(d));
  useSocketEvent('deal:closed', (d: Deal) => d.id === id && setDeal(d));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const action = async (path: string, body?: unknown) => {
    setError('');
    try {
      await apiPost(`/deals/${id}/${path}`, body);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка');
    }
  };

  const send = async () => {
    if (!msg.trim()) return;
    const body = msg;
    setMsg('');
    await apiPost(`/deals/${id}/messages`, { body }).catch(() => {});
  };

  if (!deal || !user) return <Spinner />;

  const isBuyer = deal.buyer.id === user.id;
  const isSeller = deal.seller.id === user.id;
  const canPay = isBuyer && deal.status === 'CREATED';
  const canRelease = isSeller && (deal.status === 'PAID' || deal.status === 'CREATED');
  const canCancel = isBuyer && deal.status === 'CREATED';
  const canDispute = (isBuyer || isSeller) && ['CREATED', 'PAID'].includes(deal.status);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Сделка {deal.code}</h1>
          <div className="text-sm text-gray-400">
            Вы — {isBuyer ? 'покупатель' : 'продавец'} · {fmtDate(deal.createdAt)}
          </div>
        </div>
        <Badge className={dealStatusColor[deal.status]}>{dealStatusLabel[deal.status]}</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <Card title="Детали">
            <dl className="space-y-2 text-sm">
              <Row k="Сумма к оплате" v={`${fmtFiat(deal.fiatAmount)} ${deal.fiat}`} />
              <Row k="Объём крипты" v={`${fmtCrypto(deal.assetAmount)} ${deal.asset}`} />
              <Row k="Цена" v={`${fmtFiat(deal.price)} ${deal.fiat}`} />
              <Row k="Комиссия" v={`${fmtCrypto(deal.feeAmount)} ${deal.asset}`} />
              <Row k="Покупатель получит" v={`${fmtCrypto(deal.netAmount)} ${deal.asset}`} />
              {deal.status === 'CREATED' && deal.paymentDeadline && (
                <Row k="Оплатить до" v={timeLeft(deal.paymentDeadline)} />
              )}
            </dl>
          </Card>

          {deal.paymentMethod && (
            <Card title="Реквизиты для оплаты">
              <dl className="space-y-2 text-sm">
                <Row k="Тип" v={deal.paymentMethod.type} />
                {deal.paymentMethod.bankName && <Row k="Банк" v={deal.paymentMethod.bankName} />}
                <Row k="Получатель" v={deal.paymentMethod.holderName} />
                <Row k="Реквизит" v={deal.paymentMethod.details} />
              </dl>
            </Card>
          )}

          <Card title="Действия">
            {error && <div className="text-sm text-red-400 mb-3">{error}</div>}
            <div className="space-y-2">
              {canPay && (
                <button onClick={() => action('paid')} className="btn-primary w-full">
                  Я оплатил
                </button>
              )}
              {canRelease && (
                <button onClick={() => action('release')} className="btn-success w-full">
                  Подтвердить и отпустить крипту
                </button>
              )}
              {canCancel && (
                <button onClick={() => action('cancel', { reason: 'Отменено покупателем' })} className="btn-secondary w-full">
                  Отменить
                </button>
              )}
              {canDispute && (
                <button onClick={() => setDisputeOpen(true)} className="btn-danger w-full">
                  Открыть спор
                </button>
              )}
              {['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(deal.status) && (
                <div className="text-sm text-gray-500 text-center py-2">Сделка закрыта</div>
              )}
            </div>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card title="Чат сделки" className="flex flex-col h-[600px]">
            <div className="flex-1 overflow-y-auto space-y-3 pr-2">
              {messages.map((m) => (
                <ChatBubble key={m.id} m={m} isMine={m.senderId === user.id} />
              ))}
              <div ref={bottomRef} />
            </div>
            <div className="mt-3 flex gap-2">
              <input
                className="input"
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                placeholder="Сообщение..."
              />
              <button onClick={send} className="btn-primary">Отправить</button>
            </div>
          </Card>
        </div>
      </div>

      <Modal open={disputeOpen} onClose={() => setDisputeOpen(false)} title="Открыть спор">
        <div className="space-y-4">
          <Field label="Причина спора">
            <textarea
              className="input min-h-[100px]"
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              placeholder="Опишите проблему..."
            />
          </Field>
          <button
            onClick={async () => {
              await action('dispute', { reason: disputeReason });
              setDisputeOpen(false);
            }}
            className="btn-danger w-full"
          >
            Отправить спор администратору
          </button>
        </div>
      </Modal>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-gray-400">{k}</dt>
      <dd className="font-medium text-gray-100">{v}</dd>
    </div>
  );
}

function ChatBubble({ m, isMine }: { m: ChatMessage; isMine: boolean }) {
  if (m.isSystem) {
    return (
      <div className="text-center">
        <span className="inline-block rounded-full bg-surface-200 px-3 py-1 text-xs text-gray-400">
          {m.body}
        </span>
      </div>
    );
  }
  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[70%] rounded-xl px-3 py-2 text-sm ${
          isMine ? 'bg-brand text-black' : 'bg-surface-200 text-gray-100'
        }`}
      >
        <div>{m.body}</div>
        <div className={`text-[10px] mt-1 ${isMine ? 'text-black/60' : 'text-gray-500'}`}>
          {fmtDate(m.createdAt)}
        </div>
      </div>
    </div>
  );
}
