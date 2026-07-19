'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiPost, ApiError } from '@/lib/api';
import { Card, Spinner, Empty, Field, Badge } from '@/components/ui';
import { fmtCrypto, fmtDate } from '@/lib/format';

interface Hedge {
  id: string;
  exchange: string;
  side: string;
  symbol: string;
  qty: string;
  price?: string | null;
  status: string;
  filledQty: string;
  externalOrderId?: string | null;
  payoutRequisite?: string | null;
  note?: string | null;
  dealId?: string | null;
  createdAt: string;
}

const statusColor: Record<string, string> = {
  PENDING: 'bg-yellow-500/20 text-yellow-400',
  SUBMITTED: 'bg-blue-500/20 text-blue-400',
  FILLED: 'bg-emerald-500/20 text-emerald-400',
  PARTIALLY_FILLED: 'bg-blue-500/20 text-blue-400',
  FAILED: 'bg-red-500/20 text-red-400',
  CANCELLED: 'bg-gray-500/20 text-gray-400',
};

export default function AdminHedgePage() {
  const [hedges, setHedges] = useState<Hedge[]>([]);
  const [adapter, setAdapter] = useState('');
  const [ticker, setTicker] = useState<{ price: number; source: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => apiGet<Hedge[]>('/admin/hedge').then(setHedges).finally(() => setLoading(false));

  useEffect(() => {
    load();
    apiGet<{ adapter: string }>('/admin/hedge/adapter').then((d) => setAdapter(d.adapter)).catch(() => {});
    apiGet<{ price: number; source: string }>('/admin/hedge/ticker?symbol=USDTUSDT').then(setTicker).catch(() => {});
  }, []);

  const act = async (id: string, action: 'submit' | 'sync' | 'cancel') => {
    await apiPost(`/admin/hedge/${id}/${action}`, {}).catch(() => {});
    load();
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Хеджирование (Bybit)</h1>
        <div className="text-sm text-gray-400">
          Адаптер: <Badge className="bg-surface-200 text-gray-200">{adapter || '—'}</Badge>
          {ticker && <span className="ml-3">Тикер: {ticker.price} ({ticker.source})</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <Card title="Новый хедж-ордер">
            <CreateHedge onDone={load} />
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card title="Хедж-ордера">
            {hedges.length === 0 ? (
              <Empty text="Ордеров нет" />
            ) : (
              <div className="space-y-2">
                {hedges.map((h) => (
                  <div key={h.id} className="border border-surface-200 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-semibold">{h.side} {h.symbol}</span>
                        <span className="text-gray-400 text-sm ml-2">{fmtCrypto(h.qty)} @ {h.price ?? 'market'}</span>
                      </div>
                      <Badge className={statusColor[h.status]}>{h.status}</Badge>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {h.payoutRequisite && <>Реквизит выплаты: {h.payoutRequisite} · </>}
                      {h.externalOrderId && <>ID: {h.externalOrderId} · </>}
                      {fmtDate(h.createdAt)}
                    </div>
                    {h.note && <div className="text-xs text-red-400 mt-1">{h.note}</div>}
                    <div className="flex gap-2 mt-2">
                      {h.status === 'PENDING' && (
                        <button onClick={() => act(h.id, 'submit')} className="btn-primary text-xs px-3 py-1">Отправить на биржу</button>
                      )}
                      {['SUBMITTED', 'PARTIALLY_FILLED'].includes(h.status) && (
                        <>
                          <button onClick={() => act(h.id, 'sync')} className="btn-secondary text-xs px-3 py-1">Обновить</button>
                          <button onClick={() => act(h.id, 'cancel')} className="btn-danger text-xs px-3 py-1">Отменить</button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function CreateHedge({ onDone }: { onDone: () => void }) {
  const [side, setSide] = useState('BUY');
  const [symbol, setSymbol] = useState('USDTUSDT');
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [payoutRequisite, setPayoutRequisite] = useState('');
  const [dealId, setDealId] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    try {
      await apiPost('/admin/hedge', {
        side,
        symbol,
        qty: parseFloat(qty),
        price: price ? parseFloat(price) : undefined,
        payoutRequisite: payoutRequisite || undefined,
        dealId: dealId || undefined,
        note: note || undefined,
      });
      setQty('');
      setPrice('');
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка');
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Сторона">
          <select className="input" value={side} onChange={(e) => setSide(e.target.value)}>
            <option value="BUY">BUY</option>
            <option value="SELL">SELL</option>
          </select>
        </Field>
        <Field label="Символ"><input className="input" value={symbol} onChange={(e) => setSymbol(e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Количество"><input className="input" type="number" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
        <Field label="Цена (пусто = market)"><input className="input" type="number" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
      </div>
      <Field label="Реквизит для выплаты сотруднику"><input className="input" value={payoutRequisite} onChange={(e) => setPayoutRequisite(e.target.value)} /></Field>
      <Field label="ID сделки (опционально)"><input className="input" value={dealId} onChange={(e) => setDealId(e.target.value)} /></Field>
      <Field label="Заметка"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      {error && <div className="text-sm text-red-400">{error}</div>}
      <button onClick={submit} className="btn-primary w-full">Создать ордер</button>
    </div>
  );
}
