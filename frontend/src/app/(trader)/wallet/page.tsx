'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiPost, ApiError } from '@/lib/api';
import { useSocketEvent } from '@/lib/socket';
import { Card, Stat, Spinner, Empty, Field } from '@/components/ui';
import { fmtCrypto, fmtFiat, fmtDate } from '@/lib/format';
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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Кошелёк</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {balances.map((b) => (
          <Stat
            key={b.currency}
            label={b.currency}
            value={b.currency === 'USDT' ? fmtCrypto(b.available) : fmtFiat(b.available)}
            hint={`Заморожено: ${b.currency === 'USDT' ? fmtCrypto(b.frozen) : fmtFiat(b.frozen)}`}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <div className="flex gap-2 mb-4">
            <button onClick={() => setTab('deposit')} className={tab === 'deposit' ? 'btn-success' : 'btn-secondary'}>
              Пополнить
            </button>
            <button onClick={() => setTab('withdraw')} className={tab === 'withdraw' ? 'btn-danger' : 'btn-secondary'}>
              Вывести
            </button>
          </div>
          {tab === 'deposit' ? <DepositForm onDone={load} /> : <WithdrawForm onDone={load} balances={balances} />}
        </Card>

        <Card title="История операций">
          {ledger.length === 0 ? (
            <Empty text="Операций нет" />
          ) : (
            <div className="max-h-96 overflow-y-auto space-y-2">
              {ledger.map((l) => {
                const delta = parseFloat(l.availableDelta) + parseFloat(l.frozenDelta);
                const positive = delta >= 0;
                return (
                  <div key={l.id} className="flex justify-between border-b border-surface-200/50 py-2">
                    <div>
                      <div className="text-sm">{l.transaction.type}</div>
                      <div className="text-xs text-gray-500">{fmtDate(l.createdAt)}</div>
                    </div>
                    <div className={`text-sm font-medium ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
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
    </div>
  );
}

function DepositForm({ onDone }: { onDone: () => void }) {
  const [currency, setCurrency] = useState('USDT');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    setMsg('');
    try {
      await apiPost('/treasury/deposits', {
        currency,
        amount: parseFloat(amount),
        method,
      });
      setMsg('Заявка на пополнение отправлена. Ожидайте подтверждения администратора.');
      setAmount('');
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка');
    }
  };

  return (
    <div className="space-y-3">
      <Field label="Валюта">
        <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
          <option value="USDT">USDT</option>
          <option value="RUB">RUB</option>
        </select>
      </Field>
      <Field label="Сумма">
        <input className="input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label="Способ пополнения (комментарий)">
        <input className="input" value={method} onChange={(e) => setMethod(e.target.value)} placeholder="Перевод / TxHash" />
      </Field>
      {error && <div className="text-sm text-red-400">{error}</div>}
      {msg && <div className="text-sm text-emerald-400">{msg}</div>}
      <button onClick={submit} className="btn-success w-full">Отправить заявку</button>
    </div>
  );
}

function WithdrawForm({ onDone, balances }: { onDone: () => void; balances: Balance[] }) {
  const [currency, setCurrency] = useState('USDT');
  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    setMsg('');
    try {
      await apiPost('/treasury/withdrawals', {
        currency,
        amount: parseFloat(amount),
        destination,
      });
      setMsg('Заявка на вывод отправлена. Средства зарезервированы.');
      setAmount('');
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка');
    }
  };

  const bal = balances.find((b) => b.currency === currency);

  return (
    <div className="space-y-3">
      <Field label="Валюта">
        <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
          <option value="USDT">USDT</option>
          <option value="RUB">RUB</option>
        </select>
      </Field>
      <Field label={`Сумма (доступно: ${bal ? fmtCrypto(bal.available) : 0})`}>
        <input className="input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label="Реквизиты для вывода">
        <input className="input" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Карта / кошелёк" />
      </Field>
      {error && <div className="text-sm text-red-400">{error}</div>}
      {msg && <div className="text-sm text-emerald-400">{msg}</div>}
      <button onClick={submit} className="btn-danger w-full">Отправить заявку</button>
    </div>
  );
}
