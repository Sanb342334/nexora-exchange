'use client';

import { ReactNode, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  LayoutGrid,
  Megaphone,
  Handshake,
  Wallet,
  Star,
  MessageCircle,
  ShieldCheck,
  Settings,
  LogOut,
  Bell,
  Sun,
  Moon,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { reconnectSocket, useSocketEvent } from '@/lib/socket';
import { apiGet, apiPost } from '@/lib/api';
import type { Notification } from '@/lib/types';
import { NexoraLogo } from './Logo';
import { Spinner } from '../ui';
import { MarketRightPanel } from './RightPanel';
import { LiveTicker } from './LiveTicker';
import { MobileNav } from './MobileNav';

const topNav = [
  { href: '/market', label: 'P2P Торговля' },
  { href: '/deals', label: 'Мои сделки' },
  { href: '/wallet', label: 'Кошелёк' },
  { href: '/messages', label: 'Сообщения', badge: true },
  { href: '/support', label: 'Поддержка' },
];

const sidePanel = [
  { href: '/ads', label: 'Мои объявления', icon: Megaphone },
  { href: '/deals', label: 'Мои сделки', icon: Handshake },
  { href: '/wallet', label: 'Кошелёк', icon: Wallet },
  { href: '/favorites', label: 'Избранное', icon: Star },
];

const sideAccount = [
  { href: '/messages', label: 'Сообщения', icon: MessageCircle },
  { href: '/payment-methods', label: 'Верификация', icon: ShieldCheck },
  { href: '/support', label: 'Настройки', icon: Settings },
];

export function NexoraShell({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotif, setShowNotif] = useState(false);
  const [dark, setDark] = useState(true);
  const showRightPanel = pathname === '/market' || pathname === '/dashboard';

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
    if (!loading && user && user.role === 'ADMIN') router.replace('/admin');
  }, [loading, user, router]);

  useEffect(() => {
    if (user) {
      reconnectSocket();
      apiGet<Notification[]>('/notifications?unread=true').then(setNotifications).catch(() => {});
    }
  }, [user]);

  useSocketEvent('notification', (n: Notification) => {
    setNotifications((prev) => [n, ...prev]);
  });

  if (loading || !user) return <Spinner />;

  const isActive = (href: string) =>
    href === '/market' ? pathname === '/market' || pathname === '/dashboard' : pathname.startsWith(href);

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0E14]">
      <LiveTicker />
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#0B0E14]/95 backdrop-blur-xl">
        <div className="flex h-[56px] sm:h-[60px] items-center gap-3 sm:gap-4 px-3 sm:px-4 lg:px-6 max-w-[1920px] mx-auto w-full">
          <div className="shrink-0 xl:hidden">
            <NexoraLogo compact />
          </div>

          <nav className="hidden lg:flex flex-1 items-center justify-center gap-0.5">
            {topNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`relative px-4 py-4 text-sm font-medium transition ${
                  isActive(item.href) ? 'top-nav-active text-nexora-accent' : 'text-nexora-muted hover:text-white'
                }`}
              >
                {item.label}
                {item.badge && notifications.length > 0 && (
                  <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-nexora-accent text-[10px] text-white font-bold">
                    {notifications.length}
                  </span>
                )}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => setShowNotif((v) => !v)}
              className="relative flex h-9 w-9 items-center justify-center rounded-[10px] bg-white/[0.04] text-nexora-muted hover:text-white transition"
            >
              <Bell size={17} />
              {notifications.length > 0 && (
                <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-nexora-error ring-2 ring-nexora-bg" />
              )}
            </button>
            {showNotif && (
              <div className="absolute right-4 top-14 w-80 glass-card shadow-glow z-50">
                <div className="p-3 border-b border-white/[0.06] flex justify-between">
                  <span className="text-sm font-semibold">Уведомления</span>
                  <button className="text-xs text-nexora-accent" onClick={() => { apiPost('/notifications/read-all'); setNotifications([]); }}>
                    Прочитать все
                  </button>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <p className="p-4 text-sm text-nexora-muted">Нет уведомлений</p>
                  ) : notifications.map((n) => (
                    <div key={n.id} className="p-3 border-b border-white/[0.04] hover:bg-white/[0.02]">
                      <div className="text-sm font-medium">{n.title}</div>
                      {n.body && <div className="text-xs text-nexora-muted mt-0.5">{n.body}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <button className="hidden sm:flex h-9 w-9 items-center justify-center rounded-[10px] bg-white/[0.04] text-nexora-muted hover:text-white">
              <Settings size={17} />
            </button>
            <button
              onClick={() => setDark((d) => !d)}
              className="hidden sm:flex h-9 w-9 items-center justify-center rounded-[10px] bg-white/[0.04] text-nexora-muted hover:text-white"
            >
              {dark ? <Moon size={17} /> : <Sun size={17} />}
            </button>
            <div className="flex items-center gap-2.5 pl-3 border-l border-white/[0.07]">
              <div className="hidden sm:block text-right">
                <div className="text-sm font-semibold text-white leading-tight">{user.displayName ?? user.username}</div>
                <div className="text-[10px] text-nexora-accent font-semibold">● Верифицирован</div>
              </div>
              <div className="h-9 w-9 rounded-full bg-nexora-gradient p-[2px] shadow-glow-sm">
                <div className="h-full w-full rounded-full bg-nexora-card flex items-center justify-center text-sm font-bold text-white">
                  {(user.displayName ?? user.username).charAt(0).toUpperCase()}
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className="hidden xl:flex w-[240px] shrink-0 flex-col border-r border-white/[0.06] bg-[#0E1118] p-4">
          <div className="mb-5 px-1"><NexoraLogo /></div>

          <Link
            href="/market"
            className="mb-6 flex items-center gap-3 rounded-[14px] bg-nexora-gradient px-4 py-3 text-sm font-bold text-white shadow-[0_4px_24px_rgba(123,97,255,0.35)] hover:brightness-110 transition"
          >
            <LayoutGrid size={18} />
            P2P Маркет
          </Link>

          <div className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-[0.15em] text-nexora-muted">Панель</div>
          <nav className="space-y-0.5 mb-5">
            {sidePanel.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className={isActive(href) ? 'nav-link-active' : 'nav-link'}>
                <Icon size={17} strokeWidth={1.75} />
                {label}
              </Link>
            ))}
          </nav>

          <div className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-[0.15em] text-nexora-muted">Аккаунт</div>
          <nav className="space-y-0.5 mb-5">
            {sideAccount.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className={isActive(href) ? 'nav-link-active' : 'nav-link'}>
                <Icon size={17} strokeWidth={1.75} />
                {label}
              </Link>
            ))}
            <button onClick={logout} className="nav-link w-full text-left text-nexora-error/70 hover:text-nexora-error">
              <LogOut size={17} />
              Выйти
            </button>
          </nav>

          <motion.div
            whileHover={{ scale: 1.01 }}
            className="mt-auto relative overflow-hidden rounded-[16px] border border-white/[0.06] bg-gradient-to-br from-[#161B28] to-[#10131C] p-4"
          >
            <div className="relative z-10 pr-20">
              <div className="text-[15px] font-bold text-white leading-snug">Приглашай друзей</div>
              <div className="text-[11px] text-nexora-muted mt-1 leading-snug">
                Зарабатывай до 10% с каждой сделки
              </div>
              <button className="mt-3 rounded-full bg-nexora-gradient px-4 py-2 text-[12px] font-bold text-white shadow-glow-sm hover:brightness-110 transition">
                Пригласить
              </button>
            </div>
            <div className="absolute -right-2 bottom-0 h-[90px] w-[90px]">
              <Image src="/assets/nexora-gift-box.png" alt="Gift" fill className="object-contain object-bottom" />
            </div>
          </motion.div>

          <div className="mt-4 flex items-center border-t border-white/[0.06] pt-3">
            <div className="flex flex-1 items-center gap-2 px-1">
              <span className="text-[11px] text-nexora-muted">Тема</span>
              <button className="text-nexora-muted/40"><Sun size={14} /></button>
              <button className="text-white"><Moon size={14} /></button>
            </div>
            <div className="h-4 w-px bg-white/[0.08]" />
            <div className="flex flex-1 items-center justify-end gap-2 px-1">
              <span className="text-[11px] text-nexora-muted">Язык</span>
              <span className="text-[11px] font-bold text-white">RU</span>
            </div>
          </div>
        </aside>

        <div className="flex flex-1 min-w-0">
          <main className="flex-1 p-3 sm:p-4 lg:p-5 pb-20 xl:pb-5 overflow-y-auto overflow-x-hidden">{children}</main>
          {showRightPanel && (
            <aside className="hidden xl:block w-[268px] shrink-0 border-l border-white/[0.06] bg-[#0E1118]/80 p-4 overflow-y-auto">
              <MarketRightPanel />
            </aside>
          )}
        </div>
      </div>

      <MobileNav />
      <footer className="hidden xl:flex border-t border-white/[0.07] px-6 py-3 flex-wrap items-center justify-between gap-3 text-[11px] text-nexora-muted bg-nexora-sidebar/80">
        <span>NEXORA © 2024</span>
        <div className="flex gap-4">
          {['О нас', 'Правила', 'Безопасность', 'API', 'Поддержка'].map((l) => (
            <Link key={l} href="/support" className="hover:text-white transition">{l}</Link>
          ))}
        </div>
        <div className="flex gap-3 text-nexora-muted">
          <span className="hover:text-nexora-accent cursor-pointer">TG</span>
          <span className="hover:text-nexora-accent cursor-pointer">X</span>
          <span className="hover:text-nexora-accent cursor-pointer">IG</span>
        </div>
      </footer>
    </div>
  );
}
