'use client';

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost, tokenStore } from './api';
import type { User } from './types';
import {
  getTelegramInitData,
  isTelegramMiniApp,
  setupTelegramUi,
  waitForTelegramWebApp,
} from './telegram';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isTelegram: boolean;
  login: (username: string, password: string, totpCode?: string) => Promise<User>;
  loginWithTelegram: () => Promise<User | null>;
  register: (payload: {
    username: string;
    password: string;
    email?: string;
    countryCode: string;
    preferredFiat: string;
    locale?: string;
    displayName?: string;
  }) => Promise<User>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function applyUserLocale(user: User) {
  if (user.locale) {
    try {
      localStorage.setItem('nexora-locale', user.locale);
    } catch {
      /* ignore */
    }
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isTelegram, setIsTelegram] = useState(false);
  const router = useRouter();

  const refreshUser = useCallback(async () => {
    if (!tokenStore.access) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await apiGet<User>('/auth/me');
      setUser(me);
    } catch {
      tokenStore.clear();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loginWithTelegram = useCallback(async (): Promise<User | null> => {
    await waitForTelegramWebApp();
    setupTelegramUi();
    const initData = getTelegramInitData();
    if (!initData) return null;
    setIsTelegram(true);
    const res = await apiPost<{ accessToken: string; refreshToken: string; user: User }>(
      '/auth/telegram',
      { initData },
    );
    tokenStore.set(res.accessToken, res.refreshToken);
    setUser(res.user);
    applyUserLocale(res.user);
    return res.user;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await waitForTelegramWebApp();
        if (cancelled) return;
        const inTg = setupTelegramUi() || isTelegramMiniApp();
        setIsTelegram(inTg);
        if (inTg && getTelegramInitData()) {
          try {
            await loginWithTelegram();
            if (!cancelled) setLoading(false);
            return;
          } catch {
            /* fall through to stored session */
          }
        }
        if (!cancelled) await refreshUser();
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loginWithTelegram, refreshUser]);

  const login = async (username: string, password: string, totpCode?: string) => {
    const res = await apiPost<{ accessToken: string; refreshToken: string; user: User }>(
      '/auth/login',
      { username, password, totpCode },
    );
    tokenStore.set(res.accessToken, res.refreshToken);
    setUser(res.user);
    applyUserLocale(res.user);
    return res.user;
  };

  const register = async (payload: {
    username: string;
    password: string;
    email?: string;
    countryCode: string;
    preferredFiat: string;
    locale?: string;
    displayName?: string;
  }) => {
    const res = await apiPost<{ accessToken: string; refreshToken: string; user: User }>(
      '/auth/register',
      { ...payload, locale: payload.locale ?? 'ru' },
    );
    tokenStore.set(res.accessToken, res.refreshToken);
    setUser(res.user);
    applyUserLocale(res.user);
    return res.user;
  };

  const logout = () => {
    if (isTelegram || isTelegramMiniApp()) {
      loginWithTelegram()
        .then((u) => {
          if (u) router.replace('/trade');
        })
        .catch(() => {
          tokenStore.clear();
          setUser(null);
        });
      return;
    }
    const refresh = tokenStore.refresh;
    if (refresh) apiPost('/auth/logout', { refreshToken: refresh }).catch(() => undefined);
    tokenStore.clear();
    setUser(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, isTelegram, login, loginWithTelegram, register, logout, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
