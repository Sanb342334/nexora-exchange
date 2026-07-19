'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiPost, apiPatch, ApiError } from '@/lib/api';
import { Card, Spinner, Empty, Field, Badge, Modal } from '@/components/ui';
import { fmtFiat } from '@/lib/format';
import type { Advertisement, PaymentMethod } from '@/lib/types';

export default function AdsPage() {
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = () => apiGet<Advertisement[]>('/advertisements/mine').then(setAds).finally(() => setLoading(false));

  useEffect(() => {
    load();
    apiGet<PaymentMethod[]>('/payment-methods').then(setMethods).catch(() => {});
  }, []);

  const toggle = async (ad: Advertisement) => {
    await apiPatch(`/advertisements/${ad.id}`, {
      status: ad.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE',
    });
    load();
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Мои объявления</h1>
        <button onClick={() => setOpen(true)} className="btn-primary">+ Создать объявление</button>
      </div>

      <Card>
        {ads.length === 0 ? (
          <Empty text="Объявлений нет" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-200">
                  <th className="th">Тип</th>
                  <th className="th">Цена</th>
                  <th className="th">Доступно</th>
                  <th className="th">Лимиты</th>
                  <th className="th">Статус</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {ads.map((ad) => (
                  <tr key={ad.id} className="border-b border-surface-200/50">
                    <td className="td">
                      <Badge className={ad.side === 'SELL' ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}>
                        {ad.side === 'SELL' ? 'Продажа' : 'Покупка'}
                      </Badge>
                    </td>
                    <td className="td">{fmtFiat(ad.effectivePrice)} {ad.fiat}{ad.isFloating && ' (плав.)'}</td>
                    <td className="td">{fmtFiat(ad.availableAmount)}</td>
                    <td className="td text-gray-400">{fmtFiat(ad.minFiat)}–{fmtFiat(ad.maxFiat)}</td>
                    <td className="td">
                      <Badge className={ad.status === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'}>
                        {ad.status}
                      </Badge>
                    </td>
                    <td className="td">
                      <button onClick={() => toggle(ad)} className="text-brand text-xs">
                        {ad.status === 'ACTIVE' ? 'Пауза' : 'Активировать'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {open && <CreateAdModal methods={methods} onClose={() => setOpen(false)} onDone={() => { setOpen(false); load(); }} />}
    </div>
  );
}

function CreateAdModal({
  methods,
  onClose,
  onDone,
}: {
  methods: PaymentMethod[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [side, setSide] = useState('SELL');
  const [isFloating, setIsFloating] = useState(false);
  const [price, setPrice] = useState('');
  const [floatingMargin, setFloatingMargin] = useState('0.01');
  const [totalAmount, setTotalAmount] = useState('');
  const [minFiat, setMinFiat] = useState('');
  const [maxFiat, setMaxFiat] = useState('');
  const [terms, setTerms] = useState('');
  const [pmIds, setPmIds] = useState<string[]>([]);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    try {
      await apiPost('/advertisements', {
        side,
        isFloating,
        price: isFloating ? undefined : parseFloat(price),
        floatingMargin: isFloating ? parseFloat(floatingMargin) : undefined,
        totalAmount: parseFloat(totalAmount),
        minFiat: parseFloat(minFiat),
        maxFiat: parseFloat(maxFiat),
        terms,
        paymentMethodIds: pmIds,
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка');
    }
  };

  return (
    <Modal open onClose={onClose} title="Новое объявление">
      <div className="space-y-3">
        <Field label="Тип">
          <select className="input" value={side} onChange={(e) => setSide(e.target.value)}>
            <option value="SELL">Продажа USDT</option>
            <option value="BUY">Покупка USDT</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isFloating} onChange={(e) => setIsFloating(e.target.checked)} />
          Плавающая цена (маржа к рынку)
        </label>
        {isFloating ? (
          <Field label="Маржа (доля, напр. 0.02 = +2%)">
            <input className="input" type="number" step="0.001" value={floatingMargin} onChange={(e) => setFloatingMargin(e.target.value)} />
          </Field>
        ) : (
          <Field label="Фиксированная цена (RUB за 1 USDT)">
            <input className="input" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
        )}
        <div className="grid grid-cols-3 gap-2">
          <Field label="Объём (RUB)">
            <input className="input" type="number" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} />
          </Field>
          <Field label="Мин (RUB)">
            <input className="input" type="number" value={minFiat} onChange={(e) => setMinFiat(e.target.value)} />
          </Field>
          <Field label="Макс (RUB)">
            <input className="input" type="number" value={maxFiat} onChange={(e) => setMaxFiat(e.target.value)} />
          </Field>
        </div>
        <Field label="Условия">
          <textarea className="input" value={terms} onChange={(e) => setTerms(e.target.value)} />
        </Field>
        <Field label="Реквизиты">
          <div className="space-y-1">
            {methods.filter((m) => m.isActive).map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={pmIds.includes(m.id)}
                  onChange={(e) =>
                    setPmIds((prev) => (e.target.checked ? [...prev, m.id] : prev.filter((x) => x !== m.id)))
                  }
                />
                {m.type} · {m.bankName} · {m.details}
              </label>
            ))}
            {methods.length === 0 && <div className="text-xs text-gray-500">Сначала добавьте реквизиты</div>}
          </div>
        </Field>
        {error && <div className="text-sm text-red-400">{error}</div>}
        <button onClick={submit} className="btn-primary w-full">Опубликовать</button>
      </div>
    </Modal>
  );
}
