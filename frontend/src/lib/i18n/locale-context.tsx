'use client';

import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_LOCALE, LOCALES, type LocaleId, isLocaleId } from './locales';
import { getLoginStrings, type LoginStrings } from './login-translations';
import { getAppMessages, type AppMessages } from './app-messages';
import { localeToIntl } from './countries';

export const LOCALE_STORAGE_KEY = 'nexora-locale';

export type Messages = {
  login: LoginStrings;
  app: AppMessages;
};

type LocaleContextValue = {
  locale: LocaleId;
  setLocale: (locale: LocaleId) => void;
  t: Messages;
  locales: typeof LOCALES;
  intlLocale: string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function readStoredLocale(): LocaleId {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored && isLocaleId(stored)) return stored;
  } catch {
    /* ignore */
  }
  return DEFAULT_LOCALE;
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleId>(DEFAULT_LOCALE);

  useEffect(() => {
    const stored = readStoredLocale();
    setLocaleState(stored);
    document.documentElement.lang = stored;
  }, []);

  const setLocale = useCallback((next: LocaleId) => {
    setLocaleState(next);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = next;
  }, []);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t: {
        login: getLoginStrings(locale),
        app: getAppMessages(locale),
      },
      locales: LOCALES,
      intlLocale: localeToIntl(locale),
    }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
  return ctx;
}
