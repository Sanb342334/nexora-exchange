'use client';

import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  CandlestickChart,
  Wallet,
  MessageCircle,
  ShieldCheck,
  LifeBuoy,
  LogOut,
  Bell,
  Sun,
  Moon,
  Settings,
  ArrowUpFromLine,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { reconnectSocket, useSocketEvent } from '@/lib/socket';
import { apiGet, apiPost } from '@/lib/api';
import type { Notification } from '@/lib/types';
import { NexoraLogo } from './Logo';
import { Spinner } from '../ui';
import { LiveTicker } from './LiveTicker';
import { MobileNav } from './MobileNav';
import { MegaMenu } from './MegaMenu';
import { CurrencyOnboardingModal } from './CurrencyOnboardingModal';
import { useToast } from './ToastProvider';

const sidePanel = [
  { href: '/trade', label: 'Торговля', icon: CandlestickChart },
  { href: '/cabinet', label: 'Личный кабинет', icon: Wallet },
  { href: '/deposit', label: 'Пополнение', icon: Wallet },
  { href: '/cabinet?tab=withdraw', label: 'Вывод', icon: ArrowUpFromLine },
];

const sideAccount = [
  { href: '/verify', label: 'Верификация', icon: ShieldCheck },
  { href: '/faq', label: 'FAQ', icon: MessageCircle },
  { href: '/licenses', label: 'Лицензии', icon: LifeBuoy },
  { href: '/support', label: 'Техподдержка', icon: LifeBuoy },
];

export function NexoraShell({ children }: { children: ReactNode }) {
  const { user, loading, logout, isTelegram, loginWithTelegram, refreshUser } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const toast = useToast();
  const isWithdrawTab = search.get('tab') === 'withdraw';
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotif, setShowNotif] = useState(false);
  const [dark, setDark] = useState(true);
  const [balance, setBalance] = useState<{ amount: string; symbol: string } | null>(null);
  const [needsCurrency, setNeedsCurrency] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      if (isTelegram) {
        loginWithTelegram().catch(() => undefined);
        return;
      }
      // Outside Telegram: still send to trade; auth happens via stored session if any
      router.replace('/trade');
      return;
    }
  }, [loading, user, router, isTelegram, loginWithTelegram]);

  useEffect(() => {
    if (!user) {
      setNeedsCurrency(false);
      return;
    }
    if (user.needsCurrency) {
      setNeedsCurrency(true);
      return;
    }
    apiGet<{ needsCurrency?: boolean; balance: string; symbol: string }>('/binary/me')
      .then((m) => {
        if (m.needsCurrency) setNeedsCurrency(true);
        setBalance({ amount: m.balance, symbol: m.symbol });
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (user) {
      reconnectSocket();
      apiGet<Notification[]>('/notifications?unread=true').then(setNotifications).catch(() => {});
      const loadBal = () =>
        apiGet<{ balance: string; symbol: string; needsCurrency?: boolean }>('/binary/me')
          .then((m) => {
            setBalance({ amount: m.balance, symbol: m.symbol });
            if (m.needsCurrency) setNeedsCurrency(true);
          })
          .catch(() => {});
      loadBal();
      const t = setInterval(loadBal, 8000);
      return () => clearInterval(t);
    }
  }, [user]);

  useSocketEvent('binary:settled', (payload: { balance?: string; symbol?: string }) => {
    if (payload?.balance != null) {
      setBalance({ amount: payload.balance, symbol: payload.symbol ?? '—' });
      return;
    }
    apiGet<{ balance: string; symbol: string }>('/binary/me')
      .then((m) => setBalance({ amount: m.balance, symbol: m.symbol }))
      .catch(() => {});
  });
  useSocketEvent('balance:updated', (payload: { balance?: string; symbol?: string }) => {
    if (payload?.balance == null) return;
    setBalance({ amount: payload.balance, symbol: payload.symbol ?? '—' });
  });
  useSocketEvent('notification', (n: Notification) => {
    setNotifications((prev) => [n, ...prev]);
    if (/ответ.*поддержк|поддержк.*ответ/i.test(`${n.title || ''} ${n.body || ''}`)) {
      toast('success', n.title || 'Поступил ответ от поддержки');
    }
  });

  if (loading || !user) return <Spinner />;

  const isActive = (href: string) => {
    const path = href.split('?')[0];
    if (path === '/trade') return pathname.startsWith('/trade') || pathname.startsWith('/binary');
    if (href.includes('tab=withdraw')) return pathname.startsWith('/cabinet') && isWithdrawTab;
    if (path === '/cabinet') return pathname.startsWith('/cabinet') && !isWithdrawTab;
    return pathname === path || pathname.startsWith(path + '/');
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#07090F] tg-shell">
      {needsCurrency ? (
        <CurrencyOnboardingModal
          onDone={async () => {
            setNeedsCurrency(false);
            await refreshUser();
            apiGet<{ balance: string; symbol: string }>('/binary/me')
              .then((m) => setBalance({ amount: m.balance, symbol: m.symbol }))
              .catch(() => {});
          }}
        />
      ) : null}
      {!isTelegram && <LiveTicker />}
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#07090F]/95 backdrop-blur-xl shrink-0">
        <div className="flex h-[56px] sm:h-[60px] items-center gap-3 sm:gap-4 px-3 sm:px-4 lg:px-6 max-w-[1920px] mx-auto w-full">
          <div className="shrink-0 xl:hidden">
            <NexoraLogo compact />
          </div>

          <MegaMenu pathname={pathname} />

          <div className="flex items-center gap-1.5 sm:gap-2 ml-auto relative z-[45]">
            <Link
              href="/deposit"
              className="tg-balance-chip relative z-[45] flex items-center gap-1.5 rounded-[10px] border border-nexora-neon/30 bg-nexora-neon/10 px-2 py-1 sm:px-3 sm:py-1.5 hover:bg-nexora-neon/15 transition touch-manipulation"
            >
              <span className="text-[9px] uppercase text-nexora-muted leading-none">Баланс</span>
              <span className="text-xs sm:text-sm font-bold text-nexora-neon tabular-nums">
                {balance
                  ? `${Number(balance.amount).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${balance.symbol}`
                  : '—'}
              </span>
              <span className="text-[10px] font-semibold text-nexora-accent">+</span>
            </Link>
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
                  <button
                    className="text-xs text-nexora-accent"
                    onClick={() => {
                      apiPost('/notifications/read-all');
                      setNotifications([]);
                    }}
                  >
                    Прочитать все
                  </button>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <p className="p-4 text-sm text-nexora-muted">Нет уведомлений</p>
                  ) : (
                    notifications.map((n) => (
                      <div key={n.id} className="p-3 border-b border-white/[0.04] hover:bg-white/[0.02]">
                        <div className="text-sm font-medium">{n.title}</div>
                        {n.body && <div className="text-xs text-nexora-muted mt-0.5">{n.body}</div>}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
            <Link
              href="/cabinet"
              className="hidden sm:flex h-9 w-9 items-center justify-center rounded-[10px] bg-white/[0.04] text-nexora-muted hover:text-white"
            >
              <Settings size={17} />
            </Link>
            <button
              onClick={() => setDark((d) => !d)}
              className="hidden sm:flex h-9 w-9 items-center justify-center rounded-[10px] bg-white/[0.04] text-nexora-muted hover:text-white"
            >
              {dark ? <Moon size={17} /> : <Sun size={17} />}
            </button>
            <div className="flex items-center gap-2.5 pl-3 border-l border-white/[0.07]">
              <div className="hidden sm:block text-right">
                <div className="text-sm font-semibold text-white leading-tight">
                  {user.displayName ?? user.username}
                </div>
                <div className="text-[10px] text-nexora-accent font-semibold">NEXORA Options</div>
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
        <aside className="hidden xl:flex w-[240px] shrink-0 flex-col border-r border-white/[0.06] bg-[#0E1118] p-4">
          <div className="mb-5 px-1">
            <NexoraLogo />
          </div>

          <Link
            href="/trade"
            className="mb-6 flex items-center gap-3 rounded-[14px] bg-nexora-gradient px-4 py-3 text-sm font-bold text-white shadow-[0_4px_24px_rgba(123,92,255,0.35)] hover:brightness-110 transition"
          >
            <CandlestickChart size={18} />
            Открыть торговлю
          </Link>

          <div className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-[0.15em] text-nexora-muted">
            Меню
          </div>
          <nav className="space-y-0.5 mb-5">
            {sidePanel.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className={isActive(href) ? 'nav-link-active' : 'nav-link'}>
                <Icon size={17} strokeWidth={1.75} />
                {label}
              </Link>
            ))}
          </nav>

          <div className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-[0.15em] text-nexora-muted">
            Аккаунт
          </div>
          <nav className="space-y-0.5 mb-5">
            {sideAccount.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className={isActive(href) ? 'nav-link-active' : 'nav-link'}>
                <Icon size={17} strokeWidth={1.75} />
                {label}
              </Link>
            ))}
            {!isTelegram && (
              <button onClick={logout} className="nav-link w-full text-left text-nexora-error/70 hover:text-nexora-error">
                <LogOut size={17} />
                Выйти
              </button>
            )}
          </nav>
        </aside>

        <main className="flex-1 p-3 sm:p-4 lg:p-5 pb-[calc(5rem+env(safe-area-inset-bottom))] xl:pb-5 overflow-y-auto overflow-x-hidden">
          {children}
        </main>
      </div>

      <MobileNav />
      <footer className="hidden xl:flex border-t border-white/[0.07] px-6 py-3 flex-wrap items-center justify-between gap-3 text-[11px] text-nexora-muted bg-nexora-sidebar/80">
        <span>NEXORA Options © 2026</span>
        <div className="flex gap-4">
          <Link href="/faq" className="hover:text-white transition">FAQ</Link>
          <Link href="/licenses" className="hover:text-white transition">Лицензии</Link>
          <Link href="/verify" className="hover:text-white transition">Верификация</Link>
          <Link href="/deposit" className="hover:text-white transition">Пополнение</Link>
          <Link href="/support" className="hover:text-white transition">Поддержка</Link>
        </div>
      </footer>
    </div>
  );
}
