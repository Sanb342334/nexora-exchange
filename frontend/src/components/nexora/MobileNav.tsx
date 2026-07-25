'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, Handshake, Wallet, MessageCircle, Megaphone } from 'lucide-react';
import { useLocale } from '@/lib/i18n/locale-context';

const items = [
  { href: '/trade', icon: LayoutGrid, key: 'mobileMarket' as const },
  { href: '/deals', icon: Handshake, key: 'mobileDeals' as const },
  { href: '/ads', icon: Megaphone, key: 'mobileAds' as const },
  { href: '/wallet', icon: Wallet, key: 'mobileWallet' as const },
  { href: '/messages', icon: MessageCircle, key: 'mobileChat' as const },
];

export function MobileNav() {
  const pathname = usePathname();
  const { t } = useLocale();
  const shell = t.app.shell;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-nexora-border bg-nexora-surface/95 backdrop-blur-xl lg:hidden">
      <div className="flex items-center justify-around py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {items.map(({ href, icon: Icon, key }) => {
          const active = href === '/trade'
            ? pathname === '/trade' || pathname.startsWith('/trade/')
            : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 min-w-[56px] ${
                active ? 'text-nexora-neon' : 'text-nexora-muted'
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 1.75} />
              <span className="text-[10px] font-medium">{shell[key]}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
