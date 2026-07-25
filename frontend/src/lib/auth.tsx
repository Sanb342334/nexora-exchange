'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost, tokenStore } from './api';
import type { User } from './types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string, totpCode?: string) => Promise<User>;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refreshUser = async () => {
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
  };

  useEffect(() => {
    refreshUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (username: string, password: string, totpCode?: string) => {
    const res = await apiPost<{ accessToken: string; refreshToken: string; user: User }>(
      '/auth/login',
      { username, password, totpCode },
    );
    tokenStore.set(res.accessToken, res.refreshToken);
    setUser(res.user);
    if (res.user.locale) {
      try { localStorage.setItem('nexora-locale', res.user.locale); } catch { /* ignore */ }
    }
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
      payload,
    );
    tokenStore.set(res.accessToken, res.refreshToken);
    setUser(res.user);
    if (res.user.locale) {
      try { localStorage.setItem('nexora-locale', res.user.locale); } catch { /* ignore */ }
    }
    return res.user;
  };

  const logout = () => {
    const refresh = tokenStore.refresh;
    if (refresh) apiPost('/auth/logout', { refreshToken: refresh }).catch(() => undefined);
    tokenStore.clear();
    setUser(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
