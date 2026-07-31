'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CreditCard, Coins, Copy, Timer, Upload, X } from 'lucide-react';
import { apiGet, apiPost, apiPatch, apiUpload, ApiError } from '@/lib/api';
import { useSocketEvent } from '@/lib/socket';
import { useToast } from '@/components/nexora/ToastProvider';
import { AmountInput } from '@/components/ui/AmountInput';

type Me = { balance: string; currency: string; symbol: string };

type Deposit = {
  id: string;
  amount: string;
  currency: string;
  status: string;
  stage: string;
  method?: string | null;
  requisites?: string | null;
  proofUrl?: string | null;
  paymentExpiresAt?: string | null;
  requisitesAssignedAt?: string | null;
  paymentWindowSec?: number;
  createdAt: string;
};

type CryptoNet = { id: string; asset: string; network: string; address: string };

export default function DepositPage() {
  const toast = useToast();
  const [me, setMe] = useState<Me | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'CARD_P2P' | 'CRYPTO'>('CARD_P2P');
  const [networks, setNetworks] = useState<CryptoNet[]>([]);
  const [networkId, setNetworkId] = useState('');
  const [active, setActive] = useState<Deposit | null>(null);
  const [history, setHistory] = useState<Deposit[]>([]);
  const [uploading, setUploading] = useState(false);
  const [now, setNow] = useState(Date.now());

  const reload = useCallback(async () => {
    const [m, a, list, methods] = await Promise.all([
      apiGet<Me>('/binary/me'),
      apiGet<Deposit | null>('/treasury/deposits/active'),
      apiGet<Deposit[]>('/treasury/deposits'),
      apiGet<{ cryptoNetworks: CryptoNet[] }>('/treasury/deposit-methods'),
    ]);
    setMe(m);
    setActive(a);
    setHistory(list);
    setNetworks(methods.cryptoNetworks);
    if (!networkId && methods.cryptoNetworks[0]) setNetworkId(methods.cryptoNetworks[0].id);
  }, [networkId]);

  useEffect(() => {
    reload().catch(() => {});
  }, [reload]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Poll while waiting for requisites — socket can lag in Mini App / ngrok
  useEffect(() => {
    if (!active || active.status !== 'PENDING') return;
    if (active.requisites) return;
    const t = setInterval(() => {
      apiGet<Deposit | null>('/treasury/deposits/active')
        .then((a) => {
          if (a?.requisites) {
            setActive(a);
            toast('success', 'Реквизиты получены');
          }
        })
        .catch(() => {});
    }, 2000);
    return () => clearInterval(t);
  }, [active, toast]);

  useSocketEvent('deposit:requisites', (d: Deposit) => {
    setActive(d);
    toast('success', 'Реквизиты получены');
    reload().catch(() => {});
  });
  useSocketEvent('deposit:updated', (d: Deposit) => {
    if (d?.id && (!active || d.id === active.id)) {
      setActive(d);
      reload().catch(() => {});
    }
  });
  useSocketEvent('notification', (n: { type?: string; title?: string }) => {
    if (n?.type === 'DEPOSIT' || /реквизит/i.test(n?.title || '')) {
      reload().catch(() => {});
    }
  });
  useSocketEvent('deposit:approved', () => {
    toast('success', 'Средства зачислены');
    reload().catch(() => {});
  });
  useSocketEvent('deposit:rejected', () => {
    toast('error', 'Заявка отклонена');
    reload().catch(() => {});
  });

  const leftSec = useMemo(() => {
    if (!active || (active.method || '').toUpperCase() === 'CRYPTO') return null;
    // P2P timer starts when requisites are issued
    if (!active.requisites) return null;
    let expires = active.paymentExpiresAt ? new Date(active.paymentExpiresAt).getTime() : NaN;
    if (!Number.isFinite(expires)) {
      // fallback 15 min from assignment / now
      const base = active.requisitesAssignedAt
        ? new Date(active.requisitesAssignedAt).getTime()
        : now;
      expires = base + 15 * 60 * 1000;
    }
    return Math.max(0, Math.floor((expires - now) / 1000));
  }, [active, now]);

  const start = async () => {
    const val = parseFloat(amount);
    if (!val || val <= 0) {
      toast('error', 'Укажите сумму');
      return;
    }
    try {
      const req = await apiPost<Deposit>('/treasury/deposits', {
        currency: method === 'CRYPTO' ? networks.find((n) => n.id === networkId)?.asset ?? 'USDT' : me?.currency ?? 'KZT',
        amount: val,
        method,
        cryptoNetwork: method === 'CRYPTO' ? networkId : undefined,
      });
      setActive(req);
      setAmount('');
      toast(
        'success',
        method === 'CRYPTO' ? 'Переведите на адрес ниже' : 'Заявка создана — ждите реквизиты',
      );
      await reload();
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Ошибка');
    }
  };

  const cancel = async () => {
    if (!active) return;
    try {
      await apiPost(`/treasury/deposits/${active.id}/cancel`);
      toast('success', 'Заявка отменена');
      setActive(null);
      await reload();
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Не удалось отменить');
    }
  };

  const upload = async (file: File | null) => {
    if (!file || !active) return;
    setUploading(true);
    try {
      const { url } = await apiUpload(file);
      const updated = await apiPatch<Deposit>(`/treasury/deposits/${active.id}/proof`, { proofUrl: url });
      setActive(updated);
      toast('success', 'Ваш платёж в обработке');
      await reload();
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : 'Ошибка загрузки');
    } finally {
      setUploading(false);
    }
  };

  const mm = leftSec != null ? String(Math.floor(leftSec / 60)).padStart(2, '0') : '--';
  const ss = leftSec != null ? String(leftSec % 60).padStart(2, '0') : '--';
  const isCrypto = (active?.method || '').toUpperCase() === 'CRYPTO';

  return (
    <div className="max-w-xl mx-auto space-y-4 pb-10">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Пополнение</h1>
          <p className="text-sm text-nexora-muted">Карта P2P или криптовалюта</p>
        </div>
        <Link href="/cabinet" className="text-xs text-nexora-accent hover:underline">
          ← Кабинет
        </Link>
      </div>

      <div className="glass-card p-4">
        <div className="text-[11px] uppercase text-nexora-muted">Баланс</div>
        <div className="text-2xl font-bold text-nexora-neon mt-1">
          {me ? `${Number(me.balance).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${me.symbol}` : '—'}
        </div>
      </div>

      {!active || active.status !== 'PENDING' ? (
        <div className="glass-card p-5 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMethod('CARD_P2P')}
              className={`flex flex-col items-center gap-2 rounded-[14px] border px-3 py-4 transition ${
                method === 'CARD_P2P'
                  ? 'border-nexora-accent bg-nexora-accent/15 text-white'
                  : 'border-white/10 text-nexora-muted hover:border-white/20'
              }`}
            >
              <CreditCard size={22} className={method === 'CARD_P2P' ? 'text-nexora-accent' : ''} />
              <span className="text-xs font-semibold text-center">P2P карта</span>
            </button>
            <button
              type="button"
              onClick={() => setMethod('CRYPTO')}
              className={`flex flex-col items-center gap-2 rounded-[14px] border px-3 py-4 transition ${
                method === 'CRYPTO'
                  ? 'border-nexora-accent bg-nexora-accent/15 text-white'
                  : 'border-white/10 text-nexora-muted hover:border-white/20'
              }`}
            >
              <Coins size={22} className={method === 'CRYPTO' ? 'text-nexora-accent' : ''} />
              <span className="text-xs font-semibold text-center">Криптовалюта</span>
            </button>
          </div>

          {method === 'CRYPTO' && (
            <div>
              <label className="label">Сеть</label>
              {networks.length === 0 ? (
                <p className="text-xs text-nexora-error mt-1">Адреса не настроены. Обратитесь в поддержку.</p>
              ) : (
                <select className="select mt-1 w-full" value={networkId} onChange={(e) => setNetworkId(e.target.value)}>
                  {networks.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.asset} · {n.network}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div>
            <label className="label">Сумма ({method === 'CRYPTO' ? networks.find((n) => n.id === networkId)?.asset ?? 'USDT' : me?.currency ?? 'KZT'})</label>
            <AmountInput className="input mt-1" value={amount} onChange={setAmount} placeholder="10000" />
          </div>

          <button type="button" className="btn-primary w-full" onClick={start} disabled={method === 'CRYPTO' && networks.length === 0}>
            Создать заявку
          </button>
        </div>
      ) : (
        <div className="glass-card p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white">
                {Number(active.amount).toLocaleString()} {active.currency}
              </div>
              <div className="text-xs text-nexora-muted mt-1">
                {isCrypto
                  ? 'Переведите на адрес — зачисление после проверки платежной системой'
                  : active.stage === 'WAITING_REQUISITES'
                    ? 'Ожидание реквизитов…'
                    : active.stage === 'AWAITING_REVIEW'
                      ? 'Ваш платёж в обработке'
                      : 'Оплатите и загрузите чек'}
              </div>
            </div>
            <button type="button" className="btn-secondary text-xs inline-flex items-center gap-1" onClick={cancel}>
              <X size={14} /> Отменить
            </button>
          </div>

          {active.stage === 'WAITING_REQUISITES' && !isCrypto && (
            <div className="rounded-[14px] border border-nexora-accent/30 bg-nexora-accent/10 px-4 py-6 text-center">
              <div className="h-2 w-2 rounded-full bg-nexora-accent animate-pulse mx-auto mb-2" />
              <p className="text-sm text-white font-semibold">Ожидание получения реквизитов</p>
              <p className="text-xs text-nexora-muted mt-1">Платёжная система готовит данные для перевода</p>
            </div>
          )}

          {active.requisites && (
            <>
              {!isCrypto && leftSec != null && (
                <div
                  className={`rounded-[14px] border px-4 py-3 text-center ${
                    leftSec > 0 ? 'border-nexora-accent/40 bg-nexora-accent/10' : 'border-nexora-error/40 bg-nexora-error/10'
                  }`}
                >
                  <div className="text-[11px] uppercase text-nexora-muted inline-flex items-center gap-1 justify-center w-full">
                    <Timer size={12} /> Таймер оплаты P2P
                  </div>
                  <div className={`text-3xl font-bold tabular-nums mt-1 ${leftSec > 0 ? 'text-nexora-accent' : 'text-nexora-error'}`}>
                    {mm}:{ss}
                  </div>
                  <p className="text-[11px] text-nexora-muted mt-1">
                    {leftSec > 0 ? 'Успейте перевести и загрузить чек' : 'Время истекло — создайте новую заявку'}
                  </p>
                </div>
              )}
              <div>
                <div className="text-xs font-semibold text-white mb-2">{isCrypto ? 'Адрес для перевода' : 'Реквизиты'}</div>
                <div className="rounded-[12px] border border-white/[0.06] bg-black/30 p-4 space-y-2">
                  {active.requisites.split('\n').map((line, i) => {
                    const trimmed = line.trim();
                    if (!trimmed) return null;
                    const isComment = /^комментарий/i.test(trimmed);
                    const cardLike =
                      !isCrypto &&
                      !isComment &&
                      (/\d[\d\s-]{10,}\d/.test(trimmed) || i === 0);
                    const copyValue = (trimmed.match(/\d[\d\s-]{10,}\d/)?.[0] || trimmed).replace(/\s+/g, ' ').trim();
                    return (
                      <div key={i} className="flex items-start gap-2">
                        <pre className="flex-1 whitespace-pre-wrap text-sm break-all text-white m-0 font-sans">
                          {line}
                        </pre>
                        {cardLike && (
                          <button
                            type="button"
                            className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-[11px] font-semibold text-nexora-accent touch-manipulation active:bg-white/10"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(copyValue);
                                toast('success', 'Скопировано');
                              } catch {
                                toast('error', 'Не удалось скопировать');
                              }
                            }}
                          >
                            <Copy size={12} />
                            Копировать
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {!isCrypto && active.requisites && !active.proofUrl && leftSec !== 0 && (
            <label className="flex flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-white/20 bg-white/[0.03] px-4 py-8 cursor-pointer hover:border-nexora-accent/50">
              <Upload size={22} className="text-nexora-accent" />
              <span className="text-sm text-white font-semibold">{uploading ? 'Загрузка…' : 'Загрузить чек'}</span>
              <span className="text-[11px] text-nexora-muted">JPG / PNG / PDF — уйдёт админу в Telegram</span>
              <input
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                disabled={uploading}
                onChange={(e) => upload(e.target.files?.[0] ?? null)}
              />
            </label>
          )}

          {active.proofUrl && (
            <div className="rounded-[14px] border border-nexora-neon/30 bg-nexora-neon/10 px-4 py-3 text-sm text-nexora-neon">
              Ваш платёж в обработке. Средства будут зачислены после проверки платежной системой.
            </div>
          )}

          {isCrypto && (
            <p className="text-xs text-nexora-muted">
              Чек загружать не нужно. После перевода средств на адрес баланс будет зачислен после проверки платежной системой.
            </p>
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className="glass-card p-4">
          <div className="text-xs font-semibold mb-3">История заявок</div>
          <div className="space-y-2 text-xs">
            {history.slice(0, 12).map((d) => (
              <div key={d.id} className="flex justify-between border-b border-white/[0.04] py-2">
                <span>
                  {Number(d.amount).toLocaleString()} {d.currency}
                  <span className="text-nexora-muted ml-2">{d.method}</span>
                </span>
                <span
                  className={
                    d.status === 'APPROVED'
                      ? 'text-nexora-neon'
                      : d.status === 'REJECTED' || d.status === 'CANCELLED'
                        ? 'text-nexora-error'
                        : 'text-nexora-accent'
                  }
                >
                  {d.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
