'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiPost, tokenStore } from './api';
import type { User } from './types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string, totpCode?: string) => Promise<void>;
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
    router.push(res.user.role === 'ADMIN' ? '/admin' : '/market');
  };

  const logout = () => {
    const refresh = tokenStore.refresh;
    if (refresh) apiPost('/auth/logout', { refreshToken: refresh }).catch(() => undefined);
    tokenStore.clear();
    setUser(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
