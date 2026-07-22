'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, Clock } from 'lucide-react';
import { Modal, Field } from '@/components/ui';
import { fmtCrypto, fmtFiat } from '@/lib/format';
import { TraderRow } from './TraderAvatar';
import { PaymentMethodRow } from './PaymentMethodIcon';
import type { Advertisement, PaymentMethod } from '@/lib/types';

interface TradeModalProps {
  ad: Advertisement;
  methods: PaymentMethod[];
  tab: 'buy' | 'sell';
  open: boolean;
  onClose: () => void;
  onSubmit: (fiatAmount: number, paymentMethodId?: string) => Promise<void>;
  loading?: boolean;
  error?: string;
}

export function TradeModal({ ad, methods, tab, open, onClose, onSubmit, loading, error }: TradeModalProps) {
  const [fiatAmount, setFiatAmount] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const takerIsSeller = ad.side === 'BUY';
  const asset = fiatAmount ? parseFloat(fiatAmount) / ad.effectivePrice : 0;
  const name = ad.user.displayName ?? ad.user.username;

  const handleSubmit = () => {
    onSubmit(parseFloat(fiatAmount), paymentMethodId || undefined);
  };

  return (
    <Modal open={open} onClose={onClose} wide title={tab === 'buy' ? 'Купить USDT' : 'Продать USDT'}>
      <div className="-mt-2 -mx-1">
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-nexora-neon mb-1">
              {tab === 'buy' ? 'Покупка USDT' : 'Продажа USDT'}
            </div>
            <h3 className="font-display text-xl font-bold text-white">Подтвердите сделку</h3>
          </div>
        </div>

        <div className="rounded-[14px] border border-white/[0.06] bg-[#0B0E14] p-4 mb-5">
          <TraderRow name={name} trustScore={ad.user.trustScore} completedDeals={ad.user.completedDeals} />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <div className="text-[11px] text-nexora-muted">Цена</div>
              <div className="price-neon text-lg tabular-nums">{fmtFiat(ad.effectivePrice)}</div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-nexora-muted">Лимиты</div>
              <div className="text-sm font-semibold text-white tabular-nums">
                {fmtFiat(ad.minFiat)} – {fmtFiat(ad.maxFiat)}
              </div>
            </div>
          </div>
          <div className="mt-3 flex gap-1.5">
            <PaymentMethodRow methods={ad.paymentMethods} />
          </div>
        </div>

        <Field label={`Сумма в ${ad.fiat}`}>
          <input
            className="input text-lg font-semibold tabular-nums"
            type="number"
            value={fiatAmount}
            onChange={(e) => setFiatAmount(e.target.value)}
            placeholder="50000"
            autoFocus
          />
        </Field>

        <motion.div
          layout
          className="mt-3 rounded-[12px] bg-nexora-neon/10 border border-nexora-neon/20 px-4 py-3 flex justify-between items-center"
        >
          <span className="text-sm text-nexora-muted">Вы получите</span>
          <span className="font-display text-lg font-bold text-nexora-neon tabular-nums">
            {fmtCrypto(asset)} {ad.asset}
          </span>
        </motion.div>

        {takerIsSeller && (
          <div className="mt-4">
            <Field label="Реквизит для получения оплаты">
              <select className="select" value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)}>
                <option value="">Выберите реквизит</option>
                {methods.filter((m) => m.isActive).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.type} · {m.bankName ?? m.details}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}

        <div className="mt-4 flex items-center gap-4 text-[11px] text-nexora-muted">
          <span className="flex items-center gap-1">
            <Shield size={12} className="text-nexora-neon" /> Эскроу-защита
          </span>
          <span className="flex items-center gap-1">
            <Clock size={12} /> {ad.paymentWindowMin} мин на оплату
          </span>
        </div>

        {error && (
          <div className="mt-3 rounded-[10px] bg-nexora-error/10 border border-nexora-error/30 px-3 py-2 text-sm text-nexora-error">
            {error}
          </div>
        )}

        <button
          type="button"
          disabled={loading || !fiatAmount}
          onClick={handleSubmit}
          className="mt-5 w-full btn-buy-neon py-3.5 text-base disabled:opacity-50"
        >
          {loading ? 'Создание сделки...' : tab === 'buy' ? 'Купить USDT' : 'Продать USDT'}
        </button>
      </div>
    </Modal>
  );
}
