'use client';

import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { reconnectSocket, useSocketEvent } from '@/lib/socket';
import { apiGet, apiPost } from '@/lib/api';
import type { Notification } from '@/lib/types';
import { Spinner } from './ui';

const traderNav = [
  { href: '/dashboard', label: 'Обзор', icon: '📊' },
  { href: '/market', label: 'Рынок P2P', icon: '💱' },
  { href: '/deals', label: 'Мои сделки', icon: '🤝' },
  { href: '/ads', label: 'Мои объявления', icon: '📢' },
  { href: '/wallet', label: 'Кошелёк', icon: '👛' },
  { href: '/payment-methods', label: 'Реквизиты', icon: '💳' },
];

const adminNav = [
  { href: '/admin', label: 'Дашборд', icon: '📊' },
  { href: '/admin/users', label: 'Сотрудники', icon: '👥' },
  { href: '/admin/deals', label: 'Сделки и споры', icon: '⚖️' },
  { href: '/admin/treasury', label: 'Депозиты/Выводы', icon: '🏦' },
  { href: '/admin/hedge', label: 'Хедж (Bybit)', icon: '📈' },
  { href: '/admin/rates', label: 'Курсы', icon: '💹' },
];

export function AppShell({ children, role }: { children: ReactNode; role: 'ADMIN' | 'TRADER' }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotif, setShowNotif] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
    if (!loading && user && user.role !== role) {
      router.replace(user.role === 'ADMIN' ? '/admin' : '/dashboard');
    }
  }, [loading, user, role, router]);

  useEffect(() => {
    if (user) {
      reconnectSocket();
      apiGet<Notification[]>('/notifications?unread=true').then(setNotifications).catch(() => {});
    }
  }, [user]);

  useSocketEvent('notification', (n: Notification) => {
    setNotifications((prev) => [n, ...prev]);
  });

  const markAllRead = async () => {
    await apiPost('/notifications/read-all').catch(() => {});
    setNotifications([]);
  };

  if (loading || !user) return <Spinner />;

  const nav = role === 'ADMIN' ? adminNav : traderNav;

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 shrink-0 border-r border-surface-200 bg-surface-50 flex flex-col">
        <div className="px-5 py-5 border-b border-surface-200">
          <div className="text-lg font-bold text-brand">P2P Exchange</div>
          <div className="text-xs text-gray-500">{role === 'ADMIN' ? 'Админ-панель' : 'Кабинет трейдера'}</div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                  active ? 'bg-brand text-black font-semibold' : 'text-gray-300 hover:bg-surface-200'
                }`}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-surface-200">
          <div className="text-sm text-gray-300">{user.displayName ?? user.username}</div>
          <div className="text-xs text-gray-500 mb-2">@{user.username}</div>
          <button onClick={logout} className="btn-secondary w-full">
            Выйти
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col">
        <header className="h-14 border-b border-surface-200 flex items-center justify-end px-6 gap-4">
          <div className="relative">
            <button
              onClick={() => setShowNotif((v) => !v)}
              className="relative text-gray-300 hover:text-white"
            >
              🔔
              {notifications.length > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] rounded-full px-1.5">
                  {notifications.length}
                </span>
              )}
            </button>
            {showNotif && (
              <div className="absolute right-0 mt-2 w-80 rounded-xl bg-surface-100 border border-surface-200 shadow-xl z-50">
                <div className="flex items-center justify-between p-3 border-b border-surface-200">
                  <span className="text-sm font-semibold">Уведомления</span>
                  <button onClick={markAllRead} className="text-xs text-brand">
                    Прочитать все
                  </button>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 && (
                    <div className="p-4 text-sm text-gray-500">Нет новых уведомлений</div>
                  )}
                  {notifications.map((n) => (
                    <div key={n.id} className="p-3 border-b border-surface-200/50">
                      <div className="text-sm font-medium">{n.title}</div>
                      {n.body && <div className="text-xs text-gray-400">{n.body}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </header>
        <main className="flex-1 p-6 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
