'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Paperclip } from 'lucide-react';
import { apiGet, apiPost, apiUpload, resolveUploadUrl, ApiError } from '@/lib/api';
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
  const [payOpen, setPayOpen] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [, forceTick] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const chatFileRef = useRef<HTMLInputElement>(null);
  const proofFileRef = useRef<HTMLInputElement>(null);

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

  const markPaid = async () => {
    setError('');
    setUploading(true);
    try {
      let proofUrl: string | undefined;
      if (proofFile) {
        const uploaded = await apiUpload(proofFile);
        proofUrl = uploaded.url;
      }
      await apiPost(`/deals/${id}/paid`, proofUrl ? { proofUrl } : {});
      setPayOpen(false);
      setProofFile(null);
      await load();
      toast('success', 'Оплата отмечена');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Ошибка';
      setError(message);
      toast('error', message);
    } finally {
      setUploading(false);
    }
  };

  const send = async (attachmentUrl?: string) => {
    const body = msg.trim() || (attachmentUrl ? 'Вложение' : '');
    if (!body && !attachmentUrl) return;
    setMsg('');
    await apiPost(`/deals/${id}/messages`, { body, attachmentUrl }).catch(() => {});
  };

  const sendAttachment = async (file: File) => {
    try {
      const uploaded = await apiUpload(file);
      await send(uploaded.url);
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Ошибка загрузки');
    }
  };

  if (!deal || !user) return <Spinner />;

  const isBuyer = deal.buyer.id === user.id;
  const isSeller = deal.seller.id === user.id;
  const canPay = isBuyer && deal.status === 'CREATED';
  const canRelease = isSeller && deal.status === 'PAID';
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

      <div className="rounded-[14px] border border-white/[0.06] bg-nexora-card p-4">
        <div className="text-[11px] font-bold uppercase tracking-wider text-nexora-muted mb-3">
          Контрагент
        </div>
        <TraderRow name={counterparty.displayName ?? counterparty.username} />
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
                <RippleButton variant="primary" onClick={() => setPayOpen(true)} className="w-full">
                  Я оплатил
                </RippleButton>
              )}
              {canRelease && (
                <RippleButton variant="success" onClick={() => action('release')} className="w-full">
                  Подтвердить и отпустить крипту
                </RippleButton>
              )}
              {canCancel && (
                <button
                  onClick={() => action('cancel', { reason: 'Отменено покупателем' })}
                  className="btn-secondary w-full"
                >
                  Отменить
                </button>
              )}
              {canDispute && (
                <button onClick={() => setDisputeOpen(true)} className="btn-danger w-full">
                  Открыть апелляцию
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
                ref={chatFileRef}
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) sendAttachment(f);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => chatFileRef.current?.click()}
                className="btn-ghost px-3"
                aria-label="Прикрепить файл"
              >
                <Paperclip size={18} />
              </button>
              <input
                className="input flex-1"
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
                placeholder="Введите сообщение..."
              />
              <RippleButton variant="primary" onClick={() => send()}>
                Отправить
              </RippleButton>
            </div>
          </Card>
        </div>
      </div>

      <Modal open={payOpen} onClose={() => setPayOpen(false)} title="Подтверждение оплаты">
        <div className="space-y-4">
          <p className="text-sm text-nexora-muted">
            Переведите {fmtFiat(deal.fiatAmount)} {deal.fiat} по реквизитам и приложите чек об оплате.
          </p>
          <Field label="Чек / скриншот оплаты">
            <input
              ref={proofFileRef}
              type="file"
              accept="image/*,.pdf"
              className="input"
              onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
            />
          </Field>
          <RippleButton
            variant="primary"
            onClick={markPaid}
            disabled={uploading}
            className="w-full py-3"
          >
            {uploading ? 'Загрузка...' : 'Подтвердить оплату'}
          </RippleButton>
        </div>
      </Modal>

      <Modal open={disputeOpen} onClose={() => setDisputeOpen(false)} title="Открыть апелляцию">
        <div className="space-y-4">
          <Field label="Причина апелляции">
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
            Отправить апелляцию
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
          {m.attachmentUrl && (
            <AttachmentPreview url={m.attachmentUrl} className="mt-2" />
          )}
        </span>
      </div>
    );
  }
  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[75%] ${isMine ? 'chat-bubble-mine' : 'chat-bubble-theirs'}`}>
        <div>{m.body}</div>
        {m.attachmentUrl && <AttachmentPreview url={m.attachmentUrl} className="mt-2" />}
        <div className={`text-[10px] mt-1.5 ${isMine ? 'text-white/50' : 'text-nexora-muted'}`}>
          {fmtDate(m.createdAt)}
        </div>
      </div>
    </div>
  );
}

function AttachmentPreview({ url, className = '' }: { url: string; className?: string }) {
  const full = resolveUploadUrl(url);
  const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(url);
  if (isImage) {
    return (
      <a href={full} target="_blank" rel="noopener noreferrer" className={`block ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={full} alt="Вложение" className="max-h-40 rounded-lg border border-white/10" />
      </a>
    );
  }
  return (
    <a
      href={full}
      target="_blank"
      rel="noopener noreferrer"
      className={`text-xs text-nexora-accent underline ${className}`}
    >
      Открыть вложение
    </a>
  );
}
