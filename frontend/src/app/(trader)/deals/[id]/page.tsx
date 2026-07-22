'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiGet, apiPost, ApiError } from '@/lib/api';
import { getSocket, useSocketEvent } from '@/lib/socket';
import { useAuth } from '@/lib/auth';
import { Card, Spinner, Badge, Field, Modal, PageHeader } from '@/components/ui';
import { PageMotion } from '@/components/nexora/PageMotion';
import { RippleButton } from '@/components/nexora/RippleButton';
import { DealTimeline } from '@/components/nexora/DealTimeline';
import { TraderRow } from '@/components/nexora/TraderAvatar';
import { useToast } from '@/components/nexora/ToastProvider';
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
  const toast = useToast();
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
      toast('success', 'Статус обновлён');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Ошибка';
      setError(msg);
      toast('error', msg);
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

  const counterparty = isBuyer ? deal.seller : deal.buyer;

  return (
    <PageMotion className="space-y-6">
      <DealTimeline status={deal.status} />

      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <PageHeader
            title={`Сделка ${deal.code}`}
            subtitle={`Вы — ${isBuyer ? 'покупатель' : 'продавец'}`}
          />
          <div className="text-sm text-nexora-muted -mt-4">{fmtDate(deal.createdAt)}</div>
        </div>
        <Badge className={dealStatusColor[deal.status]}>{dealStatusLabel[deal.status]}</Badge>
      </div>

      <div className="rounded-[14px] border border-white/[0.06] bg-[#10131C] p-4">
        <div className="text-[11px] font-bold uppercase tracking-wider text-nexora-muted mb-3">
          Контрагент
        </div>
        <TraderRow
          name={counterparty.displayName ?? counterparty.username}
        />
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
            {error && <div className="text-sm text-nexora-error mb-3">{error}</div>}
            <div className="space-y-2">
              {canPay && (
                <RippleButton variant="primary" onClick={() => action('paid')} className="w-full">
                  Я оплатил
                </RippleButton>
              )}
              {canRelease && (
                <RippleButton variant="success" onClick={() => action('release')} className="w-full">
                  Подтвердить и отпустить крипту
                </RippleButton>
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
                <div className="text-sm text-nexora-muted text-center py-2">Сделка закрыта</div>
              )}
            </div>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card title="Чат сделки" className="flex flex-col h-[min(600px,70vh)]">
            <div className="flex-1 overflow-y-auto space-y-3 pr-2 scroll-smooth">
              {messages.map((m) => (
                <ChatBubble key={m.id} m={m} isMine={m.senderId === user.id} />
              ))}
              <div ref={bottomRef} />
            </div>
            <div className="mt-3 flex gap-2 border-t border-white/[0.06] pt-3">
              <input
                className="input flex-1"
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
                placeholder="Введите сообщение..."
              />
              <RippleButton variant="primary" onClick={send}>
                Отправить
              </RippleButton>
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
    </PageMotion>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-nexora-muted">{k}</dt>
      <dd className="font-medium text-white">{v}</dd>
    </div>
  );
}

function ChatBubble({ m, isMine }: { m: ChatMessage; isMine: boolean }) {
  if (m.isSystem) {
    return (
      <div className="text-center">
        <span className="inline-block rounded-full bg-white/[0.06] px-3 py-1 text-xs text-nexora-muted">
          {m.body}
        </span>
      </div>
    );
  }
  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[75%] ${isMine ? 'chat-bubble-mine' : 'chat-bubble-theirs'}`}>
        <div>{m.body}</div>
        <div className={`text-[10px] mt-1.5 ${isMine ? 'text-white/50' : 'text-nexora-muted'}`}>
          {fmtDate(m.createdAt)}
        </div>
      </div>
    </div>
  );
}
