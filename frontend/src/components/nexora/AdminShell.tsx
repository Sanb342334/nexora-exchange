'use client';

import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Handshake,
  Landmark,
  TrendingUp,
  DollarSign,
  Settings,
  Bell,
  LogOut,
  Megaphone,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { NexoraLogo } from './Logo';
import { Spinner } from '../ui';

const adminNav = [
  { href: '/admin', label: 'Дашборд', icon: LayoutDashboard },
  { href: '/admin/queue', label: 'Очередь P2P', icon: Handshake },
  { href: '/admin/users', label: 'Сотрудники', icon: Users },
  { href: '/admin/ads', label: 'Объявления', icon: Megaphone },
  { href: '/admin/deals', label: 'Сделки и споры', icon: AlertTriangle },
  { href: '/admin/treasury', label: 'Финансы', icon: Landmark },
  { href: '/admin/hedge', label: 'Хедж Bybit', icon: TrendingUp },
  { href: '/admin/rates', label: 'Курсы', icon: DollarSign },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
    if (!loading && user && user.role !== 'ADMIN') router.replace('/trade');
  }, [loading, user, router]);

  if (loading || !user) return <Spinner />;

  const isActive = (href: string) =>
    href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 shrink-0 border-r border-white/[0.06] bg-nexora-card/50 flex flex-col p-4">
        <div className="mb-6">
          <NexoraLogo />
          <div className="mt-2 text-[10px] font-bold uppercase tracking-widest text-nexora-accent">
            Admin Panel
          </div>
        </div>

        <nav className="flex-1 space-y-0.5">
          {adminNav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={isActive(href) ? 'nav-link-active' : 'nav-link'}
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto pt-4 border-t border-white/[0.06]">
          <div className="flex items-center gap-3 mb-3 px-2">
            <div className="h-9 w-9 rounded-full bg-nexora-gradient flex items-center justify-center text-sm font-bold text-white">
              A
            </div>
            <div>
              <div className="text-sm font-semibold text-white">{user.displayName ?? user.username}</div>
              <div className="text-[10px] text-nexora-accent">Администратор</div>
            </div>
          </div>
          <button onClick={logout} className="nav-link w-full text-nexora-error/80">
            <LogOut size={18} />
            Выйти
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-white/[0.06] flex items-center justify-between px-6 glass">
          <div className="flex items-center gap-2 text-sm text-nexora-muted">
            <AlertTriangle size={14} className="text-nexora-accent" />
            Панель управления платформой
          </div>
          <div className="flex items-center gap-2">
            <button className="h-9 w-9 flex items-center justify-center rounded-[14px] bg-white/[0.04] text-nexora-muted">
              <Bell size={16} />
            </button>
            <button className="h-9 w-9 flex items-center justify-center rounded-[14px] bg-white/[0.04] text-nexora-muted">
              <Settings size={16} />
            </button>
          </div>
        </header>
        <main className="flex-1 p-6 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
