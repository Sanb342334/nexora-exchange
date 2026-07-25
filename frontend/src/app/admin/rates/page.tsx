'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiPost, apiDelete, ApiError } from '@/lib/api';
import { Card, Spinner, Empty, Field } from '@/components/ui';
import { fmtFiat, fmtDate } from '@/lib/format';

interface Snapshot {
  id: string;
  asset: string;
  fiat: string;
  price: string;
  source: string;
  createdAt: string;
}

export default function AdminRatesPage() {
  const [market, setMarket] = useState<{ price: number; source: string } | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [price, setPrice] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [m, h] = await Promise.all([
      apiGet<{ price: number; source: string }>('/rates/market'),
      apiGet<Snapshot[]>('/rates/history'),
    ]);
    setMarket(m);
    setHistory(h);
    setLoading(false);
  };

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, []);

  const setManual = async () => {
    setError('');
    setMsg('');
    try {
      await apiPost('/rates/manual', { asset: 'USDT', fiat: 'KZT', price: parseFloat(price) });
      setMsg('Курс зафиксирован вручную');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка');
    }
  };

  const clearManual = async () => {
    await apiDelete('/rates/manual?asset=USDT&fiat=KZT').catch(() => {});
    setMsg('Ручной курс сброшен (используется биржа/статик)');
    load();
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Курсы</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Текущий курс USDT/KZT">
          <div className="text-4xl font-bold text-nexora-accent">{market ? fmtFiat(market.price) : '—'}</div>
          <div className="text-sm text-gray-400 mt-1">Источник: {market?.source ?? '—'}</div>

          <div className="mt-6 space-y-3">
            <Field label="Установить ручной курс (KZT за 1 USDT)">
              <input className="input" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
            </Field>
            <div className="flex gap-2">
              <button onClick={setManual} className="btn-primary flex-1">Зафиксировать</button>
              <button onClick={clearManual} className="btn-secondary flex-1">Сбросить на авто</button>
            </div>
            {error && <div className="text-sm text-red-400">{error}</div>}
            {msg && <div className="text-sm text-emerald-400">{msg}</div>}
          </div>
        </Card>

        <Card title="История курса">
          {history.length === 0 ? (
            <Empty text="История пуста" />
          ) : (
            <div className="max-h-96 overflow-y-auto space-y-1">
              {history.map((s) => (
                <div key={s.id} className="flex justify-between text-sm border-b border-white/[0.07] py-1.5">
                  <span className="text-gray-400">{fmtDate(s.createdAt)}</span>
                  <span>{fmtFiat(s.price)} <span className="text-gray-500 text-xs">({s.source})</span></span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
