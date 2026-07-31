'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { apiGet, apiPatch, apiPost, ApiError } from '@/lib/api';
import { Card, Empty } from '@/components/ui';
import { AmountInput } from '@/components/ui/AmountInput';
import { useToast } from '@/components/nexora/ToastProvider';

type Me = {
  balance: string;
  currency: string;
  symbol: string;
  pendingWithdraw: string;
};

type Trade = {
  id: string;
  pairId: string;
  direction: string;
  stake: string;
  fee?: string;
  payout: string;
  status: string;
  durationSec: number;
  createdAt: string;
  settledAt?: string | null;
  inProfit?: boolean | null;
  live?: boolean;
};

type Withdrawal = {
  id: string;
  amount: string;
  currency: string;
  destination: string;
  status: string;
  reviewNote?: string | null;
  createdAt: string;
};

type WithdrawEligibility = {
  allowed: boolean;
  required: boolean;
  hasCardDeposit: boolean;
  message: string | null;
};

const CURRENCIES = ['KZT', 'USD', 'RUB', 'EUR'];

const LINKS = [
  { href: '/deposit', label: 'Пополнить', desc: 'Карта P2P или крипто' },
  { href: '/trade', label: 'Торговля', desc: 'Терминал и график' },
  { href: '/verify', label: 'Верификация', desc: 'KYC · паспорт и селфи' },
  { href: '/faq', label: 'FAQ', desc: 'Частые вопросы' },
  { href: '/licenses', label: 'Лицензии', desc: 'Документы платформы' },
  { href: '/support', label: 'Поддержка', desc: 'Чат с оператором' },
];

export default function CabinetPage() {
  const toast = useToast();
  const search = useSearchParams();
  const [me, setMe] = useState<Me | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [tab, setTab] = useState<'home' | 'history' | 'wdHistory' | 'currency' | 'withdraw'>('home');
  const [wMethod, setWMethod] = useState<'CARD' | 'CRYPTO'>('CARD');
  const [wAmount, setWAmount] = useState('');
  const [wDest, setWDest] = useState('');
  const [wName, setWName] = useState('');
  const [wComment, setWComment] = useState('');
  const [wBusy, setWBusy] = useState(false);
  const [wdGate, setWdGate] = useState<WithdrawEligibility | null>(null);
  const [showWdGateModal, setShowWdGateModal] = useState(false);

  const reload = async () => {
    const [m, h, w, el] = await Promise.all([
      apiGet<Me>('/binary/me'),
      apiGet<{ items: Trade[] }>('/binary/feed?limit=40'),
      apiGet<Withdrawal[]>('/treasury/withdrawals').catch(() => []),
      apiGet<WithdrawEligibility>('/treasury/withdrawals/eligibility').catch(() => null),
    ]);
    setMe(m);
    setTrades(h.items);
    setWithdrawals(w);
    setWdGate(el);
  };

  useEffect(() => {
    reload().catch(() => {});
  }, []);

  useEffect(() => {
    const t = search.get('tab');
    if (t === 'withdraw' || t === 'history' || t === 'wdHistory' || t === 'currency' || t === 'home') {
      setTab(t);
    }
  }, [search]);

  const setCurrency = async (currency: string) => {
    await apiPatch('/binary/currency', { currency });
    toast('success', `Валюта: ${currency} · баланс конвертирован`);
    await reload();
  };

  const openWithdrawTab = () => {
    setTab('withdraw');
  };

  const WD_GATE_TEXT =
    'Вывод доступен после успешного пополнения через P2P (банковская карта). Средства выводятся на ту же карту, с которой был депозит. Одного крипто-пополнения недостаточно.';

  const submitWithdraw = async () => {
    if (wdGate && !wdGate.allowed) {
      setShowWdGateModal(true);
      return;
    }
    const amount = parseFloat(wAmount);
    if (!amount || amount <= 0) {
      toast('error', 'Укажите сумму');
      return;
    }
    if (!wDest.trim()) {
      toast('error', wMethod === 'CRYPTO' ? 'Укажите адрес кошелька' : 'Укажите реквизиты карты');
      return;
    }
    if (wMethod === 'CARD' && !wName.trim()) {
      toast('error', 'Укажите ФИО получателя');
      return;
    }
    setWBusy(true);
    try {
      await apiPost('/treasury/withdrawals', {
        currency: me?.currency ?? 'KZT',
        amount,
        method: wMethod,
        destination: wDest.trim(),
        holderName: wMethod === 'CARD' ? wName.trim() : undefined,
        comment: wComment.trim() || undefined,
      });
      toast('success', 'Заявка на вывод создана');
      setWAmount('');
      setWDest('');
      setWName('');
      setWComment('');
      await reload();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Ошибка вывода';
      if (msg.toLowerCase().includes('p2p') || msg.toLowerCase().includes('пополнен')) {
        setShowWdGateModal(true);
      } else {
        toast('error', msg);
      }
    } finally {
      setWBusy(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Личный кабинет</h1>
          <p className="text-sm text-nexora-muted">Баланс, пополнение, история, верификация</p>
        </div>
        <Link href="/trade" className="btn-primary text-sm">
          К торговле
        </Link>
      </div>

      <div className="glass-card p-5">
        <div className="text-[11px] uppercase text-nexora-muted">Баланс</div>
        <div className="text-3xl font-bold text-nexora-neon mt-1">
          {me ? `${Number(me.balance).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${me.symbol}` : '—'}
        </div>
        <div className="text-xs text-nexora-muted mt-2">
          {me?.currency} · На выводе: {me?.pendingWithdraw ?? '0'}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/deposit" className="btn-primary text-sm">
            Пополнить
          </Link>
          <button type="button" className="btn-secondary text-sm" onClick={openWithdrawTab}>
            Вывести
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          ['home', 'Меню'],
          ['history', 'Сделки'],
          ['wdHistory', 'Выводы'],
          ['currency', 'Валюта'],
          ['withdraw', 'Вывести'],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => (id === 'withdraw' ? openWithdrawTab() : setTab(id as typeof tab))}
            className={`px-3 py-2 rounded-[12px] text-xs font-semibold border ${
              tab === id ? 'border-nexora-accent bg-nexora-accent/15 text-white' : 'border-white/10 text-nexora-muted'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'home' && (
        <div className="grid sm:grid-cols-2 gap-3">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="glass-card p-4 hover:border-nexora-accent/40 border border-transparent transition">
              <div className="font-semibold text-white text-sm">{l.label}</div>
              <div className="text-xs text-nexora-muted mt-1">{l.desc}</div>
            </Link>
          ))}
        </div>
      )}

      {tab === 'withdraw' && (
        <Card title="Вывод средств">
          <div className="flex gap-2 mb-4">
            {(
              [
                ['CARD', 'На карту'],
                ['CRYPTO', 'Криптовалюта'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setWMethod(id)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border ${
                  wMethod === id ? 'border-nexora-accent bg-nexora-accent/15 text-white' : 'border-white/10 text-nexora-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="space-y-3">
            <label className="label">
              Сумма ({me?.currency ?? '—'})
              <AmountInput className="input mt-1" value={wAmount} onChange={setWAmount} />
            </label>
            {wMethod === 'CARD' ? (
              <>
                <label className="label">
                  Реквизиты карты
                  <input className="input mt-1" value={wDest} onChange={(e) => setWDest(e.target.value)} placeholder="XXXX XXXX XXXX XXXX" />
                </label>
                <label className="label">
                  ФИО получателя
                  <input className="input mt-1" value={wName} onChange={(e) => setWName(e.target.value)} />
                </label>
                <label className="label">
                  Комментарий
                  <input className="input mt-1" value={wComment} onChange={(e) => setWComment(e.target.value)} placeholder="Необязательно" />
                </label>
              </>
            ) : (
              <label className="label">
                Адрес кошелька
                <input className="input mt-1" value={wDest} onChange={(e) => setWDest(e.target.value)} placeholder="TRC20 / ERC20 / BTC…" />
              </label>
            )}
            <button type="button" className="btn-primary w-full" disabled={wBusy} onClick={submitWithdraw}>
              {wBusy ? 'Отправка…' : 'Создать заявку на вывод'}
            </button>
          </div>
        </Card>
      )}

      {showWdGateModal ? (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/70 p-3 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[16px] border border-white/10 bg-[#0c1018] p-5 shadow-2xl">
            <h3 className="font-display text-lg font-bold text-white">Вывод пока недоступен</h3>
            <p className="mt-2 text-sm leading-relaxed text-white/70">{WD_GATE_TEXT}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/deposit" className="btn-primary text-sm" onClick={() => setShowWdGateModal(false)}>
                Пополнить через P2P
              </Link>
              <button type="button" className="btn-secondary text-sm" onClick={() => setShowWdGateModal(false)}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {tab === 'currency' && (
        <Card title="Валюта счёта">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {CURRENCIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCurrency(c)}
                className={`rounded-[14px] py-3 font-bold border ${
                  me?.currency === c ? 'border-nexora-accent bg-nexora-accent/20 text-white' : 'border-white/10 text-nexora-muted'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </Card>
      )}

      {tab === 'history' && (
        <Card title="История сделок" noPadding>
          {trades.length === 0 ? (
            <Empty text="Пока нет сделок" />
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {trades.map((t) => {
                const live = t.live || t.status === 'OPEN';
                const won = t.status === 'WON';
                const profit = won ? Number(t.payout) - Number(t.stake) : live ? null : -Number(t.stake);
                return (
                  <div
                    key={t.id}
                    className={`px-4 py-3 flex items-center justify-between gap-3 text-sm ${
                      live ? (t.inProfit ? 'bg-nexora-neon/10' : 'bg-nexora-error/10') : ''
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-white">
                        {t.pairId} {t.direction === 'UP' ? '▲' : '▼'} · {t.durationSec}s
                        {live && (
                          <span className={`ml-2 text-[10px] font-bold ${t.inProfit ? 'text-nexora-neon' : 'text-nexora-error'}`}>
                            В процессе
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-nexora-muted">
                        {new Date(t.settledAt || t.createdAt).toLocaleString()}
                        {Number(t.fee ?? 0) > 0 ? ` · комиссия 1%: ${Number(t.fee).toFixed(2)}` : ''}
                      </div>
                    </div>
                    <div className={live ? (t.inProfit ? 'text-nexora-neon font-bold' : 'text-nexora-error font-bold') : won ? 'text-nexora-neon font-bold' : 'text-nexora-error font-bold'}>
                      {live ? t.stake : `${profit != null && profit > 0 ? '+' : ''}${profit?.toFixed(2) ?? ''}`}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {tab === 'wdHistory' && (
        <Card title="История выводов" noPadding>
          {withdrawals.length === 0 ? (
            <Empty text="Пока нет заявок на вывод" />
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {withdrawals.map((w) => {
                const rejected = w.status === 'REJECTED';
                const open = detailId === w.id;
                return (
                  <div key={w.id} className="px-4 py-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-white">
                          {Number(w.amount).toLocaleString()} {w.currency}
                        </div>
                        <div className="text-xs text-nexora-muted">{new Date(w.createdAt).toLocaleString()}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={
                            w.status === 'APPROVED'
                              ? 'text-nexora-neon font-bold'
                              : rejected
                                ? 'text-nexora-error font-bold'
                                : 'text-nexora-accent font-bold'
                          }
                        >
                          {w.status === 'APPROVED' ? 'Выполнен' : rejected ? 'Отклонён' : 'В обработке'}
                        </span>
                        {rejected && (
                          <button
                            type="button"
                            className="text-[11px] font-semibold text-nexora-accent underline"
                            onClick={() => setDetailId(open ? null : w.id)}
                          >
                            Подробнее
                          </button>
                        )}
                      </div>
                    </div>
                    {open && rejected && (
                      <div className="mt-2 rounded-xl border border-nexora-error/30 bg-nexora-error/10 px-3 py-2 text-xs text-white/90">
                        <div className="font-semibold text-nexora-error mb-1">Причина отказа</div>
                        {w.reviewNote?.trim() || 'Причина не указана'}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
