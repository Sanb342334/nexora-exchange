'use client';

import { useMemo } from 'react';
import { useLocale } from '@/lib/i18n/locale-context';
import { fmtCrypto, fmtDate, fmtFiat, fmtNum, intlFromAppLocale, timeLeft } from './format';

export function useFormat() {
  const { locale, t, intlLocale } = useLocale();

  return useMemo(
    () => ({
      locale,
      intlLocale,
      fmtNum: (value: string | number, decimals = 2) => fmtNum(value, decimals, intlLocale),
      fmtCrypto: (value: string | number) => fmtCrypto(value, intlLocale),
      fmtFiat: (value: string | number) => fmtFiat(value, intlLocale),
      fmtDate: (iso?: string | null) => fmtDate(iso, intlLocale),
      timeLeft: (iso?: string | null) => timeLeft(iso, t.app.common.expired),
      dealStatusLabel: (status: string) =>
        t.app.dealStatus[status as keyof typeof t.app.dealStatus] ?? status,
    }),
    [locale, intlLocale, t],
  );
}

export { intlFromAppLocale };
