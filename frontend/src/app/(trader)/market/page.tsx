'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost, ApiError } from '@/lib/api';
import { useSocketEvent } from '@/lib/socket';
import { Card, Spinner, Empty, Modal, Field } from '@/components/ui';
import { fmtCrypto, fmtFiat } from '@/lib/format';
import type { Advertisement, PaymentMethod } from '@/lib/types';

export default function MarketPage() {
  const router = useRouter();
  // tab "buy" -> user wants to buy USDT -> show SELL ads
  const [tab, setTab] = useState<'buy' | 'sell'>('buy');
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Advertisement | null>(null);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);

  const load = async () => {
    setLoading(true);
    const side = tab === 'buy' ? 'SELL' : 'BUY';
    const data = await apiGet<Advertisement[]>(`/advertisements?side=${side}&status=ACTIVE`);
    setAds(data);
    setLoading(false);
  };

  useEffect(() => {
    load().catch(() => setLoading(false));
    apiGet<PaymentMethod[]>('/payment-methods').then(setMethods).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useSocketEvent('orderbook:update', () => load());

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Рынок P2P</h1>

      <div className="flex gap-2">
        <button
          onClick={() => setTab('buy')}
          className={tab === 'buy' ? 'btn-success' : 'btn-secondary'}
        >
          Купить USDT
        </button>
        <button
          onClick={() => setTab('sell')}
          className={tab === 'sell' ? 'btn-danger' : 'btn-secondary'}
        >
          Продать USDT
        </button>
      </div>

      <Card>
        {loading ? (
          <Spinner />
        ) : ads.length === 0 ? (
          <Empty text="Нет активных объявлений" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-200">
                  <th className="th">Трейдер</th>
                  <th className="th">Цена</th>
                  <th className="th">Доступно</th>
                  <th className="th">Лимиты</th>
                  <th className="th">Оплата</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {ads.map((ad) => (
                  <tr key={ad.id} className="border-b border-surface-200/50">
                    <td className="td">{ad.user.displayName ?? ad.user.username}</td>
                    <td className="td font-semibold text-brand">
                      {fmtFiat(ad.effectivePrice)} {ad.fiat}
                      {ad.isFloating && <span className="text-xs text-gray-500 ml-1">(плав.)</span>}
                    </td>
                    <td className="td">{fmtFiat(ad.availableAmount)} {ad.fiat}</td>
                    <td className="td text-gray-400">
                      {fmtFiat(ad.minFiat)} – {fmtFiat(ad.maxFiat)}
                    </td>
                    <td className="td text-gray-400">
                      {ad.paymentMethods.map((p) => p.paymentMethod.type).join(', ')}
                    </td>
                    <td className="td">
                      <button
                        onClick={() => setSelected(ad)}
                        className={tab === 'buy' ? 'btn-success' : 'btn-danger'}
                      >
                        {tab === 'buy' ? 'Купить' : 'Продать'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selected && (
        <TakeAdModal
          ad={selected}
          methods={methods}
          onClose={() => setSelected(null)}
          onCreated={(id) => router.push(`/deals/${id}`)}
        />
      )}
    </div>
  );
}

function TakeAdModal({
  ad,
  methods,
  onClose,
  onCreated,
}: {
  ad: Advertisement;
  methods: PaymentMethod[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [fiatAmount, setFiatAmount] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // taker is seller when ad.side === 'BUY' -> taker must supply own requisites
  const takerIsSeller = ad.side === 'BUY';
  const asset = fiatAmount ? parseFloat(fiatAmount) / ad.effectivePrice : 0;

  const submit = async () => {
    setError('');
    setLoading(true);
    try {
      const deal = await apiPost<{ id: string }>('/deals', {
        advertisementId: ad.id,
        fiatAmount: parseFloat(fiatAmount),
        paymentMethodId: paymentMethodId || undefined,
      });
      onCreated(deal.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={ad.side === 'SELL' ? 'Купить USDT' : 'Продать USDT'}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="text-gray-400">Цена</div>
          <div className="text-right font-semibold">{fmtFiat(ad.effectivePrice)} {ad.fiat}</div>
          <div className="text-gray-400">Лимиты</div>
          <div className="text-right">{fmtFiat(ad.minFiat)} – {fmtFiat(ad.maxFiat)} {ad.fiat}</div>
        </div>

        <Field label={`Сумма в ${ad.fiat}`}>
          <input
            className="input"
            type="number"
            value={fiatAmount}
            onChange={(e) => setFiatAmount(e.target.value)}
            placeholder="10000"
          />
        </Field>

        <div className="text-sm text-gray-400">
          Вы {ad.side === 'SELL' ? 'получите' : 'отдадите'}:{' '}
          <span className="text-brand font-semibold">{fmtCrypto(asset)} {ad.asset}</span>
        </div>

        {takerIsSeller && (
          <Field label="Ваш реквизит для получения оплаты">
            <select
              className="input"
              value={paymentMethodId}
              onChange={(e) => setPaymentMethodId(e.target.value)}
            >
              <option value="">Выберите реквизит</option>
              {methods.filter((m) => m.isActive).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.type} · {m.bankName ?? ''} · {m.details}
                </option>
              ))}
            </select>
          </Field>
        )}

        {error && <div className="text-sm text-red-400">{error}</div>}
        <button onClick={submit} disabled={loading} className="btn-primary w-full">
          {loading ? 'Создание...' : 'Создать сделку'}
        </button>
      </div>
    </Modal>
  );
}
