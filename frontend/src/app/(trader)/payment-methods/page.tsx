'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiPost, apiDelete, ApiError } from '@/lib/api';
import { Card, Spinner, Empty, Field, Badge } from '@/components/ui';
import type { PaymentMethod } from '@/lib/types';

export default function PaymentMethodsPage() {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState('CARD');
  const [bankName, setBankName] = useState('');
  const [holderName, setHolderName] = useState('');
  const [details, setDetails] = useState('');
  const [error, setError] = useState('');

  const load = () => apiGet<PaymentMethod[]>('/payment-methods').then(setMethods).finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    setError('');
    try {
      await apiPost('/payment-methods', { type, bankName, holderName, details });
      setBankName('');
      setHolderName('');
      setDetails('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка');
    }
  };

  const remove = async (id: string) => {
    await apiDelete(`/payment-methods/${id}`);
    load();
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Реквизиты</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Добавить реквизит">
          <div className="space-y-3">
            <Field label="Тип">
              <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="CARD">Банковская карта</option>
                <option value="SBP">СБП</option>
                <option value="BANK_ACCOUNT">Банковский счёт</option>
                <option value="CRYPTO_WALLET">Крипто-кошелёк</option>
              </select>
            </Field>
            <Field label="Банк / провайдер">
              <input className="input" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Сбербанк" />
            </Field>
            <Field label="Владелец">
              <input className="input" value={holderName} onChange={(e) => setHolderName(e.target.value)} placeholder="Иван Иванов" />
            </Field>
            <Field label="Номер / реквизит">
              <input className="input" value={details} onChange={(e) => setDetails(e.target.value)} placeholder="2202 ..." />
            </Field>
            {error && <div className="text-sm text-red-400">{error}</div>}
            <button onClick={create} className="btn-primary w-full">Добавить</button>
          </div>
        </Card>

        <Card title="Мои реквизиты">
          {methods.length === 0 ? (
            <Empty text="Реквизитов нет" />
          ) : (
            <div className="space-y-3">
              {methods.map((m) => (
                <div key={m.id} className="flex items-center justify-between border border-surface-200 rounded-lg p-3">
                  <div>
                    <div className="text-sm font-medium">
                      {m.type} {m.bankName && `· ${m.bankName}`}
                      {!m.isActive && <Badge className="ml-2 bg-gray-500/20 text-gray-400">неактивен</Badge>}
                    </div>
                    <div className="text-xs text-gray-400">{m.holderName} · {m.details}</div>
                  </div>
                  {m.isActive && (
                    <button onClick={() => remove(m.id)} className="text-red-400 text-xs hover:underline">
                      Удалить
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
