'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Sparkles, ArrowUpRight } from 'lucide-react';
import { fadeScale } from '@/lib/motion';
import { CoinScene } from './CoinScene';

export function HeroBanner() {
  return (
    <motion.section
      variants={fadeScale}
      initial="hidden"
      animate="visible"
      transition={{ duration: 0.5 }}
      className="hero-banner relative overflow-hidden rounded-[16px] border border-white/[0.06] bg-[#10131C] min-h-[280px] sm:min-h-[260px] lg:min-h-[280px]"
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_75%_50%,rgba(123,97,255,0.16),transparent_55%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_85%_60%,rgba(247,147,26,0.08),transparent_45%)] pointer-events-none" />

      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[1fr_auto] items-center gap-2 lg:gap-4">
        <div className="order-2 lg:order-1 p-5 sm:p-6 lg:p-8 flex flex-col justify-center">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-3 inline-flex w-fit items-center gap-2 rounded-full border border-nexora-accent/25 bg-nexora-accent/10 px-3 py-1 text-[11px] font-bold text-nexora-accent"
          >
            <Sparkles size={12} />
            Premium P2P · KZT / USDT
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="font-display text-[22px] sm:text-[26px] lg:text-[30px] xl:text-[32px] font-bold text-white leading-[1.15] max-w-lg"
          >
            NEXORA — Локальная биржа без границ
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="mt-3 text-[13px] sm:text-sm text-nexora-muted leading-relaxed max-w-md"
          >
            Низкие комиссии, быстрые сделки и эскроу-защита. Торгуй USDT с верифицированными контрагентами — безопасно и удобно.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-5 sm:mt-6 flex flex-wrap gap-2.5 sm:gap-3"
          >
            <Link href="/ads" className="btn-primary px-5 sm:px-6 py-2.5 sm:py-3 text-sm">
              Создать объявление
            </Link>
            <Link href="/support" className="btn-outline px-5 sm:px-6 py-2.5 sm:py-3 text-sm gap-1.5">
              Подробнее
              <ArrowUpRight size={15} />
            </Link>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15, duration: 0.55 }}
          className="order-1 lg:order-2 relative flex items-center justify-center py-4 lg:py-0 lg:pr-4 xl:pr-8 overflow-hidden"
        >
          <div className="scale-[0.78] sm:scale-90 lg:scale-100 origin-center">
            <CoinScene />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-[#10131C] via-transparent to-transparent lg:bg-gradient-to-l lg:from-[#10131C]/50 lg:via-transparent lg:to-transparent pointer-events-none" />
        </motion.div>
      </div>
    </motion.section>
  );
}
