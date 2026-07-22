'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { apiGet, apiPost, apiPatch, ApiError } from '@/lib/api';
import { Card, Spinner, Empty, Field, Badge, Modal, PageHeader } from '@/components/ui';
import { fmtFiat } from '@/lib/format';
import { PageMotion } from '@/components/nexora/PageMotion';
import { RippleButton } from '@/components/nexora/RippleButton';
import { staggerContainer, tableRow } from '@/lib/motion';
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
    <PageMotion className="space-y-6">
      <PageHeader
        title="Мои объявления"
        subtitle="Создавайте и управляйте P2P-объявлениями"
        action={
          <RippleButton variant="primary" onClick={() => setOpen(true)}>
            + Создать объявление
          </RippleButton>
        }
      />

      <Card noPadding>
        {ads.length === 0 ? (
          <Empty text="Объявлений нет" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Тип</th>
                  <th className="th">Цена</th>
                  <th className="th">Доступно</th>
                  <th className="th">Лимиты</th>
                  <th className="th">Статус</th>
                  <th className="th text-right pr-6">Действие</th>
                </tr>
              </thead>
              <motion.tbody variants={staggerContainer} initial="hidden" animate="visible">
                {ads.map((ad) => (
                  <motion.tr
                    key={ad.id}
                    variants={tableRow}
                    whileHover={{ backgroundColor: 'rgba(123,97,255,0.04)' }}
                  >
                    <td className="td">
                      <Badge className={ad.side === 'SELL' ? 'bg-nexora-error/15 text-nexora-error border border-nexora-error/20' : 'bg-[#4CAF50]/15 text-[#4CAF50] border border-[#4CAF50]/20'}>
                        {ad.side === 'SELL' ? 'Продажа' : 'Покупка'}
                      </Badge>
                    </td>
                    <td className="td font-bold text-[#4CAF50]">
                      {fmtFiat(ad.effectivePrice)} {ad.fiat}{ad.isFloating && ' (плав.)'}
                    </td>
                    <td className="td">{fmtFiat(ad.availableAmount)}</td>
                    <td className="td text-nexora-muted">{fmtFiat(ad.minFiat)} – {fmtFiat(ad.maxFiat)}</td>
                    <td className="td">
                      <Badge className={ad.status === 'ACTIVE' ? 'bg-[#4CAF50]/15 text-[#4CAF50] border border-[#4CAF50]/20' : 'bg-white/[0.06] text-nexora-muted border border-white/[0.08]'}>
                        {ad.status}
                      </Badge>
                    </td>
                    <td className="td text-right pr-6">
                      <RippleButton variant="outline" onClick={() => toggle(ad)}>
                        {ad.status === 'ACTIVE' ? 'Пауза' : 'Активировать'}
                      </RippleButton>
                    </td>
                  </motion.tr>
                ))}
              </motion.tbody>
            </table>
          </div>
        )}
      </Card>

      {open && <CreateAdModal methods={methods} onClose={() => setOpen(false)} onDone={() => { setOpen(false); load(); }} />}
    </PageMotion>
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
  const [city, setCity] = useState('Алматы');
  const [bankName, setBankName] = useState('Kaspi Bank');
  const [fiat] = useState('KZT');
  const [pmIds, setPmIds] = useState<string[]>([]);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    try {
      await apiPost('/advertisements', {
        side,
        fiat,
        isFloating,
        price: isFloating ? undefined : parseFloat(price),
        floatingMargin: isFloating ? parseFloat(floatingMargin) : undefined,
        totalAmount: parseFloat(totalAmount),
        minFiat: parseFloat(minFiat),
        maxFiat: parseFloat(maxFiat),
        terms,
        city,
        bankName,
        paymentMethodIds: pmIds.length ? pmIds : undefined,
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ошибка');
    }
  };

  return (
    <Modal open onClose={onClose} title="OTC-заявка">
      <div className="space-y-3">
        <p className="text-xs text-nexora-muted">Заявка попадёт к оператору NEXORA. Контрагент увидит случайный ник.</p>
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
          <Field label={`Фиксированная цена (${fiat} за 1 USDT)`}>
            <input className="input" type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="480" />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Город">
            <input className="input" value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
          <Field label="Банк">
            <input className="input" value={bankName} onChange={(e) => setBankName(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Field label={`Объём (${fiat})`}>
            <input className="input" type="number" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} />
          </Field>
          <Field label={`Мин (${fiat})`}>
            <input className="input" type="number" value={minFiat} onChange={(e) => setMinFiat(e.target.value)} />
          </Field>
          <Field label={`Макс (${fiat})`}>
            <input className="input" type="number" value={maxFiat} onChange={(e) => setMaxFiat(e.target.value)} />
          </Field>
        </div>
        <Field label="Условия">
          <textarea className="input" value={terms} onChange={(e) => setTerms(e.target.value)} />
        </Field>
        <Field label={side === 'SELL' ? 'Реквизиты (обязательно для продажи)' : 'Реквизиты (опционально)'}>
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
            {methods.length === 0 && <div className="text-xs text-nexora-muted">Сначала добавьте реквизиты</div>}
          </div>
        </Field>
        {error && <div className="text-sm text-nexora-error">{error}</div>}
        <RippleButton variant="primary" onClick={submit} className="w-full">
          Опубликовать
        </RippleButton>
      </div>
    </Modal>
  );
}
