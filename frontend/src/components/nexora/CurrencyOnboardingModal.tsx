'use client';

import { useState } from 'react';
import { apiPatch } from '@/lib/api';

const CURRENCIES = [
  { code: 'RUB', symbol: '₽', name: 'Рубль' },
  { code: 'KZT', symbol: '₸', name: 'Тенге' },
  { code: 'USD', symbol: '$', name: 'Доллар' },
  { code: 'EUR', symbol: '€', name: 'Евро' },
] as const;

type Props = {
  onDone: (currency: string) => void;
};

export function CurrencyOnboardingModal({ onDone }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const pick = async (currency: string) => {
    setBusy(currency);
    setError('');
    try {
      await apiPatch('/binary/currency', { currency });
      onDone(currency);
    } catch {
      setError('Не удалось сохранить валюту. Попробуйте ещё раз.');
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/75 p-3 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[16px] border border-white/10 bg-[#0c1018] p-5 shadow-2xl">
        <div className="text-[11px] font-bold uppercase tracking-wide text-nexora-accent">NEXORA</div>
        <h2 className="mt-1 font-display text-xl font-bold text-white">Выберите валюту счёта</h2>
        <p className="mt-1.5 text-sm text-white/60">
          Баланс, пополнения и сделки будут в выбранной валюте. Можно сменить позже в кабинете.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {CURRENCIES.map((c) => (
            <button
              key={c.code}
              type="button"
              disabled={!!busy}
              onClick={() => pick(c.code)}
              className="rounded-[14px] border border-white/10 bg-white/[0.03] px-3 py-3.5 text-left transition hover:border-nexora-accent/50 hover:bg-nexora-accent/10 disabled:opacity-60 touch-manipulation"
            >
              <div className="text-lg font-bold text-white">
                {c.symbol} {c.code}
              </div>
              <div className="text-xs text-nexora-muted">
                {busy === c.code ? 'Сохранение…' : c.name}
              </div>
            </button>
          ))}
        </div>

        {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
      </div>
    </div>
  );
}
