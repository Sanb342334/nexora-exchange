'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Menu, X } from 'lucide-react';

const TOP = [
  { href: '/trade', label: 'Торговля' },
  { href: '/cabinet', label: 'Кабинет' },
  { href: '/deposit', label: 'Пополнение' },
  { href: '/cabinet?tab=withdraw', label: 'Вывод' },
  { href: '/verify', label: 'Верификация' },
  { href: '/faq', label: 'FAQ' },
  { href: '/support', label: 'Поддержка' },
];

export function MegaMenu({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const search = useSearchParams();
  const isWithdrawTab = search.get('tab') === 'withdraw';

  const isActive = (href: string) => {
    const path = href.split('?')[0];
    if (path === '/trade') return pathname.startsWith('/trade') || pathname.startsWith('/binary');
    if (href.includes('tab=withdraw')) return pathname.startsWith('/cabinet') && isWithdrawTab;
    if (path === '/cabinet') return pathname.startsWith('/cabinet') && !isWithdrawTab;
    return pathname === path || pathname.startsWith(path + '/');
  };

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  const drawer =
    mounted &&
    open &&
    createPortal(
      <div className="fixed inset-0 z-[200] lg:hidden" role="dialog" aria-modal="true">
        <button
          type="button"
          className="absolute inset-0 bg-black/65"
          aria-label="Закрыть меню"
          onClick={close}
        />
        <div className="absolute top-[max(12px,env(safe-area-inset-top))] left-3 right-3 rounded-[14px] border border-white/[0.08] bg-[#10131C] p-2 pt-2 shadow-2xl">
          <div className="flex items-center justify-between px-2 pb-2 mb-1 border-b border-white/[0.06]">
            <span className="text-xs font-bold uppercase tracking-wider text-nexora-muted">Меню</span>
            <button
              type="button"
              aria-label="Закрыть"
              onClick={close}
              className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-white/[0.08] text-white touch-manipulation active:bg-white/[0.14]"
            >
              <X size={22} />
            </button>
          </div>
          {TOP.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              onClick={close}
              className={`flex items-center min-h-[48px] px-4 rounded-[10px] text-sm font-semibold touch-manipulation ${
                isActive(item.href)
                  ? 'bg-nexora-accent/15 text-nexora-accent'
                  : 'text-white active:bg-white/[0.06]'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>,
      document.body,
    );

  return (
    <>
      <nav className="hidden lg:flex flex-1 items-center justify-center gap-0.5 relative">
        {TOP.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`relative px-4 py-4 text-sm font-medium transition touch-manipulation ${
              isActive(item.href) ? 'top-nav-active text-nexora-accent' : 'text-nexora-muted hover:text-white'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <button
        type="button"
        aria-label="Открыть меню"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="lg:hidden relative z-[50] flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-white/[0.06] text-white touch-manipulation active:opacity-70"
      >
        <Menu size={20} />
      </button>

      {drawer}
    </>
  );
}
