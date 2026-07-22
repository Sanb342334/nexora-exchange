'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowDownLeft, ArrowUpRight, Eye, EyeOff } from 'lucide-react';
import { apiGet, apiPost, ApiError } from '@/lib/api';
import { useSocketEvent } from '@/lib/socket';
import { Card, Spinner, Empty, Field, PageHeader } from '@/components/ui';
import { fmtCrypto, fmtFiat, fmtDate } from '@/lib/format';
import { PageMotion } from '@/components/nexora/PageMotion';
import { RippleButton } from '@/components/nexora/RippleButton';
import { useToast } from '@/components/nexora/ToastProvider';
import { staggerContainer, staggerItem } from '@/lib/motion';
import type { Balance } from '@/lib/types';

interface LedgerRow {
  id: string;
  currency: string;
  availableDelta: string;
  frozenDelta: string;
  availableAfter: string;
  createdAt: string;
  transaction: { type: string; description?: string | null };
}

export default function WalletPage() {
  const [balances, setBalances] = useState<Balance[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [hideBalance, setHideBalance] = useState(false);

  const load = async () => {
    const [b, l] = await Promise.all([
      apiGet<Balance[]>('/wallets/balances'),
      apiGet<LedgerRow[]>('/wallets/ledger'),
    ]);
    setBalances(b);
    setLedger(l);
    setLoading(false);
  };

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, []);

  useSocketEvent('balance:update', () => load());

  if (loading) return <Spinner />;

  const usdt = balances.find((b) => b.currency === 'USDT');
  const fiat = balances.find((b) => b.currency === 'RUB' || b.currency === 'KZT');

  return (
    <PageMotion className="space-y-6">
      <PageHeader title="Кошелёк" subtitle="Управление активами и история операций" />

      <div className="wallet-hero">
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-nexora-muted">Общий баланс (USDT)</span>
            <button
              type="button"
              onClick={() => setHideBalance((v) => !v)}
              className="text-nexora-muted hover:text-white transition"
            >
              {hideBalance ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <div className="font-display text-4xl font-bold text-white tabular-nums">
            {hideBalance ? '••••••' : usdt ? `${fmtCrypto(usdt.available)} USDT` : '0 USDT'}
          </div>
          {fiat && (
            <div className="mt-2 text-sm text-nexora-muted tabular-nums">
              ≈ {hideBalance ? '••••' : fmtFiat(parseFloat(fiat.available))} {fiat.currency}
            </div>
          )}
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => setTab('deposit')}
              className="btn-success gap-2 px-5"
            >
              <ArrowDownLeft size={16} /> Пополнить
            </button>
            <button
              type="button"
              onClick={() => setTab('withdraw')}
              className="btn-outline gap-2 px-5"
            >
              <ArrowUpRight size={16} /> Вывести
            </button>
          </div>
        </div>
      </div>

      <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {balances.map((b) => (
          <motion.div key={b.currency} variants={staggerItem}>
            <div className="glass-card p-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-nexora-muted">{b.currency}</div>
              <div className="mt-2 font-display text-xl font-bold text-white tabular-nums">
                {hideBalance ? '••••' : b.currency === 'USDT' ? fmtCrypto(b.available) : fmtFiat(b.available)}
              </div>
              <div className="mt-1 text-[11px] text-nexora-muted">
                Заморожено: {hideBalance ? '••••' : b.currency === 'USDT' ? fmtCrypto(b.frozen) : fmtFiat(b.frozen)}
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title={tab === 'deposit' ? 'Пополнение' : 'Вывод'}>
          {tab === 'deposit' ? <DepositForm onDone={load} /> : <WithdrawForm onDone={load} balances={balances} />}
        </Card>

        <Card title="История операций">
          {ledger.length === 0 ? (
            <Empty text="Операций пока нет" />
          ) : (
            <div className="max-h-96 overflow-y-auto divide-y divide-white/[0.04]">
              {ledger.map((l) => {
                const delta = parseFloat(l.availableDelta) + parseFloat(l.frozenDelta);
                const positive = delta >= 0;
                return (
                  <div key={l.id} className="flex justify-between py-3 first:pt-0">
                    <div>
                      <div className="text-sm font-medium text-white">{l.transaction.type}</div>
                      <div className="text-[11px] text-nexora-muted mt-0.5">{fmtDate(l.createdAt)}</div>
                    </div>
                    <div className={`text-sm font-bold tabular-nums ${positive ? 'text-nexora-neon' : 'text-nexora-error'}`}>
                      {positive ? '+' : ''}
                      {fmtCrypto(l.availableDelta)} {l.currency}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </PageMotion>
  );
}

function DepositForm({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [currency, setCurrency] = useState('USDT');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('');
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    try {
      await apiPost('/treasury/deposits', { currency, amount: parseFloat(amount), method });
      toast('success', 'Заявка на пополнение отправлена');
      setAmount('');
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка');
    }
  };

  return (
    <div className="space-y-3">
      <Field label="Валюта">
        <select className="select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
          <option value="USDT">USDT</option>
          <option value="RUB">RUB</option>
        </select>
      </Field>
      <Field label="Сумма">
        <input className="input tabular-nums" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label="Способ пополнения">
        <input className="input" value={method} onChange={(e) => setMethod(e.target.value)} placeholder="Перевод / TxHash" />
      </Field>
      {error && <div className="text-sm text-nexora-error">{error}</div>}
      <RippleButton variant="success" onClick={submit} className="w-full py-3">
        Отправить заявку
      </RippleButton>
    </div>
  );
}

function WithdrawForm({ onDone, balances }: { onDone: () => void; balances: Balance[] }) {
  const toast = useToast();
  const [currency, setCurrency] = useState('USDT');
  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState('');
  const [error, setError] = useState('');

  const bal = balances.find((b) => b.currency === currency);

  const submit = async () => {
    setError('');
    try {
      await apiPost('/treasury/withdrawals', { currency, amount: parseFloat(amount), destination });
      toast('success', 'Заявка на вывод отправлена');
      setAmount('');
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка');
    }
  };

  return (
    <div className="space-y-3">
      <Field label="Валюта">
        <select className="select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
          <option value="USDT">USDT</option>
          <option value="RUB">RUB</option>
        </select>
      </Field>
      <Field label={`Сумма (доступно: ${bal ? fmtCrypto(bal.available) : 0})`}>
        <input className="input tabular-nums" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label="Реквизиты для вывода">
        <input className="input" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Карта / кошелёк" />
      </Field>
      {error && <div className="text-sm text-nexora-error">{error}</div>}
      <RippleButton variant="danger" onClick={submit} className="w-full py-3">
        Отправить заявку
      </RippleButton>
    </div>
  );
}
