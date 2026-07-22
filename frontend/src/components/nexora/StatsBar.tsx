'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Users, Activity, BarChart3 } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { CountUp } from './CountUp';
import { staggerContainer, staggerItem } from '@/lib/motion';

interface MarketStats {
  activeAds: number;
  deals24h: number;
  volume24h: string;
  users: number;
  online: number;
}

export function StatsBar() {
  const [stats, setStats] = useState<MarketStats | null>(null);

  useEffect(() => {
    apiGet<MarketStats>('/advertisements/stats/market').then(setStats).catch(() => {});
  }, []);

  const items = [
    { label: 'Активных объявлений', val: stats?.activeAds ?? 0, trend: '+12.5%', icon: BarChart3, color: 'text-nexora-accent' },
    { label: 'Сделок (24ч)', val: stats?.deals24h ?? 0, trend: '+18.2%', icon: Activity, color: 'text-blue-400' },
    {
      label: 'Объём (24ч)',
      val: stats ? Math.round(parseFloat(stats.volume24h)) : 0,
      trend: '+24.1%',
      suffix: ' ₸',
      icon: TrendingUp,
      color: 'text-nexora-neon',
    },
    { label: 'Пользователей', val: stats?.users ?? 0, trend: '+8.7%', icon: Users, color: 'text-orange-400' },
    {
      label: 'Онлайн',
      val: stats?.online ?? 0,
      trend: '',
      icon: null,
      color: 'text-nexora-neon',
      live: true,
    },
  ];

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2.5 sm:gap-3"
    >
      {items.map((s) => {
        const Icon = s.icon;
        return (
          <motion.div
            key={s.label}
            variants={staggerItem}
            whileHover={{ scale: 1.02, boxShadow: '0 0 24px rgba(123,97,255,0.12)' }}
            className="rounded-[14px] sm:rounded-[16px] border border-white/[0.06] bg-[#10131C] p-3.5 sm:p-4 min-h-[96px] flex flex-col justify-between"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wide text-nexora-muted leading-tight">
                {s.label}
              </div>
              {s.live ? (
                <span className="h-2 w-2 shrink-0 rounded-full bg-nexora-neon animate-pulse shadow-neon-sm" />
              ) : Icon ? (
                <Icon size={14} className={`shrink-0 ${s.color}`} />
              ) : null}
            </div>
            <div>
              <div className="font-display text-lg sm:text-xl font-bold text-white tabular-nums">
                <CountUp end={s.val} suffix={s.suffix ?? ''} />
              </div>
              {s.trend && (
                <div className="mt-0.5 text-[10px] sm:text-[11px] font-semibold text-nexora-neon">{s.trend}</div>
              )}
            </div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
