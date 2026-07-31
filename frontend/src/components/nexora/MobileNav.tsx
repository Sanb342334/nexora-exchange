'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { CandlestickChart, Wallet, LifeBuoy, Landmark, ArrowUpFromLine } from 'lucide-react';

const items = [
  { href: '/trade', icon: CandlestickChart, label: 'Торговля' },
  { href: '/deposit', icon: Landmark, label: 'Депозит' },
  { href: '/cabinet?tab=withdraw', icon: ArrowUpFromLine, label: 'Вывод' },
  { href: '/cabinet', icon: Wallet, label: 'Кабинет' },
  { href: '/support', icon: LifeBuoy, label: 'Чат' },
];

export function MobileNav() {
  const pathname = usePathname();
  const search = useSearchParams();
  const isWithdrawTab = search.get('tab') === 'withdraw';

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[60] border-t border-nexora-border bg-[#0c1018]/98 backdrop-blur-xl lg:hidden pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around py-1.5">
        {items.map(({ href, icon: Icon, label }) => {
          const path = href.split('?')[0];
          const active =
            path === '/trade'
              ? pathname.startsWith('/trade') || pathname.startsWith('/binary')
              : href.includes('tab=withdraw')
                ? pathname.startsWith('/cabinet') && isWithdrawTab
                : path === '/cabinet'
                  ? pathname.startsWith('/cabinet') && !isWithdrawTab
                  : pathname === path || pathname.startsWith(path + '/');
          return (
            <Link
              key={href}
              href={href}
              prefetch
              className={`flex flex-col items-center gap-0.5 px-1.5 py-1.5 min-w-[56px] min-h-[44px] justify-center touch-manipulation active:opacity-70 ${
                active ? 'text-nexora-neon' : 'text-nexora-muted'
              }`}
            >
              <Icon size={18} strokeWidth={active ? 2.5 : 1.75} />
              <span className="text-[9px] font-medium leading-none">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
