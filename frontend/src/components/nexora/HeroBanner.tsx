'use client';

import Link from 'next/link';
import { Sparkles, ArrowUpRight } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useLocale } from '@/lib/i18n/locale-context';
import { HeroIllustration } from './HeroIllustration';

export function HeroBanner() {
  const { user } = useAuth();
  const { t } = useLocale();
  const h = t.app.hero;
  const tradeHref = user ? '/trade/BTC_USDT' : '/login?next=/trade/BTC_USDT';

  return (
    <section className="hero-banner relative overflow-visible pb-2 lg:min-h-[320px] lg:pb-0">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_78%_52%,rgba(123,97,255,0.1),transparent_58%)]" />
      <HeroIllustration priority className="hidden lg:block" />

      <div className="relative z-10 flex flex-col lg:min-h-[320px] lg:max-w-[52%] lg:justify-center lg:py-4">
        <div className="mb-3 inline-flex w-fit items-center gap-2 rounded-full border border-nexora-accent/25 bg-nexora-accent/10 px-3 py-1 text-[11px] font-bold text-nexora-accent">
          <Sparkles size={12} />
          {h.badge}
        </div>

        <h1 className="max-w-lg font-display text-[22px] font-bold leading-[1.15] text-white sm:text-[26px] lg:text-[30px] xl:text-[32px]">
          {h.title}
        </h1>

        <p className="mt-3 max-w-md text-[13px] leading-relaxed text-white/65 sm:text-sm">{h.subtitle}</p>
        <ul className="mt-3 space-y-1 text-[12px] text-white/55 sm:text-[13px]">
          <li>• {h.line1}</li>
          <li>• {h.line2}</li>
          <li>• {h.line3}</li>
        </ul>

        <div className="mt-5 flex flex-wrap gap-2.5 sm:mt-6 sm:gap-3">
          <Link href={tradeHref} prefetch className="btn-primary px-5 py-2.5 text-sm sm:px-6 sm:py-3">
            {h.createAd}
          </Link>
          <Link href="/support" prefetch className="btn-outline gap-1.5 px-5 py-2.5 text-sm sm:px-6 sm:py-3">
            {h.moreInfo}
            <ArrowUpRight size={15} />
          </Link>
        </div>
      </div>

      <div className="relative z-0 mt-4 h-[220px] sm:h-[260px] lg:hidden">
        <HeroIllustration variant="login" lite priority className="mx-auto h-full max-w-[400px]" />
      </div>
    </section>
  );
}
