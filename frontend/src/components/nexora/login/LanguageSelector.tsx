'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Globe } from 'lucide-react';
import { useLocale } from '@/lib/i18n/locale-context';
import type { LocaleId } from '@/lib/i18n/locales';

export function LanguageSelector({ variant = 'login' }: { variant?: 'login' | 'shell' }) {
  const { t, locale, setLocale, locales } = useLocale();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = locales.find((l) => l.id === locale) ?? locales[0];

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const pick = (id: LocaleId) => {
    setLocale(id);
    setOpen(false);
  };

  const btnClass =
    variant === 'shell'
      ? 'flex w-full items-center gap-2 rounded-[10px] px-2 py-2 text-[12px] text-nexora-muted transition hover:bg-nexora-hover hover:text-nexora-text'
      : 'flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-[#d1d5db] transition hover:bg-white/[0.06] hover:text-white';

  const menuClass =
    variant === 'shell'
      ? 'absolute left-0 bottom-[calc(100%+6px)] z-50 max-h-[min(420px,50vh)] w-[min(280px,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-nexora-border bg-nexora-card py-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.55)]'
      : 'absolute right-0 top-[calc(100%+6px)] z-50 max-h-[min(420px,60vh)] w-[min(280px,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-white/[0.08] bg-[#14141f] py-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.55)]';

  return (
    <div ref={rootRef} className={`relative ${variant === 'shell' ? 'w-full' : ''}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={btnClass}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={t.login.selectLanguage}
      >
        <Globe size={variant === 'shell' ? 14 : 16} className="shrink-0 opacity-80" />
        <span className="flex-1 truncate text-left">{current.label}</span>
        <ChevronDown size={14} className={`shrink-0 opacity-70 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div role="listbox" className={menuClass}>
          {locales.map((item) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={item.id === locale}
              onClick={() => pick(item.id)}
              className={`flex w-full items-center px-4 py-2.5 text-left text-sm transition hover:bg-white/[0.06] ${
                item.id === locale ? 'bg-nexora-accent/15 text-nexora-accent font-medium' : 'text-nexora-text'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
