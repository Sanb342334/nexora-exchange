'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, Handshake, Wallet, MessageCircle, Megaphone } from 'lucide-react';

const items = [
  { href: '/market', icon: LayoutGrid, label: 'Маркет' },
  { href: '/deals', icon: Handshake, label: 'Сделки' },
  { href: '/ads', icon: Megaphone, label: 'Объявл.' },
  { href: '/wallet', icon: Wallet, label: 'Кошелёк' },
  { href: '/messages', icon: MessageCircle, label: 'Чат' },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/[0.06] bg-[#0B0E14]/95 backdrop-blur-xl xl:hidden">
      <div className="flex items-center justify-around py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {items.map(({ href, icon: Icon, label }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 min-w-[56px] ${
                active ? 'text-nexora-neon' : 'text-nexora-muted'
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 1.75} />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
