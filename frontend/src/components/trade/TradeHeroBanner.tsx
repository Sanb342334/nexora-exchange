'use client';

import Link from 'next/link';
import { Sparkles, ArrowUpRight } from 'lucide-react';
import { useLocale } from '@/lib/i18n/locale-context';

export function TradeHeroBanner() {
  const { t } = useLocale();
  const h = t.app.trade.hero;

  return (
    <section className="hero-banner relative overflow-hidden rounded-[12px] border border-white/[0.06] bg-nexora-card">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_78%_52%,rgba(123,97,255,0.1),transparent_58%)]" />

      <div className="relative z-10 flex flex-col justify-center p-3 sm:p-5 lg:py-6 lg:px-6">
        <div className="mb-1.5 inline-flex w-fit items-center gap-1.5 rounded-full border border-nexora-accent/25 bg-nexora-accent/10 px-2 py-0.5 text-[10px] font-bold text-nexora-accent">
          <Sparkles size={11} />
          {h.badge}
        </div>

        <h1 className="max-w-2xl font-display text-[18px] font-bold leading-[1.25] text-white sm:text-[26px] lg:text-[32px]">
          {h.title}
        </h1>

        <p className="mt-1.5 max-w-xl text-[11px] leading-snug text-white/65 sm:text-sm">
          {h.subtitle}
        </p>

        <ul className="mt-2 hidden space-y-1 text-[12px] text-white/55 sm:block sm:text-[13px]">
          <li>• {h.line1}</li>
          <li>• {h.line2}</li>
        </ul>

        <div className="mt-2.5 flex flex-wrap gap-2 sm:mt-5">
          <Link
            href="/trade/BTC_USDT"
            prefetch
            className="btn-primary relative z-20 px-3.5 py-2 text-xs sm:px-6 sm:py-3 sm:text-sm touch-manipulation"
          >
            {h.ctaPrimary}
          </Link>
          <Link
            href="/trade/ETH_USDT"
            prefetch
            className="btn-outline relative z-20 gap-1 px-3.5 py-2 text-xs sm:px-6 sm:py-3 sm:text-sm touch-manipulation"
          >
            ETH/USDT
            <ArrowUpRight size={14} />
          </Link>
        </div>
      </div>
    </section>
  );
}
