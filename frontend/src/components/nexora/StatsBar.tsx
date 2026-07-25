'use client';

import { useEffect, useState } from 'react';
import { TrendingUp, Users, Activity, BarChart3 } from 'lucide-react';
import { getSimulatedMarketStats, type SimulatedMarketStats } from '@/lib/simulated-stats';
import { useLocale } from '@/lib/i18n/locale-context';
import { CountUp } from './CountUp';

export function StatsBar() {
  const { t } = useLocale();
  const m = t.app.market;
  const [stats, setStats] = useState<SimulatedMarketStats | null>(null);

  useEffect(() => {
    setStats(getSimulatedMarketStats());
    const tick = setInterval(() => {
      setStats(getSimulatedMarketStats(Math.floor(Math.random() * 24 - 12)));
    }, 9000);
    return () => clearInterval(tick);
  }, []);

  const items = [
    { label: m.activeAds, val: stats?.activeAds ?? 0, trend: '+12.5%', icon: BarChart3, color: 'text-nexora-accent' },
    { label: `${m.deals} (24h)`, val: stats?.deals24h ?? 0, trend: stats?.dealsTrend ?? '+14%', icon: Activity, color: 'text-blue-400' },
    {
      label: `${m.volume} (24h)`,
      val: stats ? Math.round(parseFloat(stats.volume24h)) : 0,
      trend: stats?.volumeTrend ?? '+18%',
      suffix: '',
      icon: TrendingUp,
      color: 'text-nexora-neon',
    },
    { label: m.users, val: stats?.users ?? 0, trend: '+8.7%', icon: Users, color: 'text-orange-400' },
    { label: m.online, val: stats?.online ?? 0, trend: '', icon: null, color: 'text-nexora-neon', live: true },
  ];

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
      {items.map((s) => {
        const Icon = s.icon;
        return (
          <div
            key={s.label}
            className="flex min-h-[96px] flex-col justify-between rounded-[14px] border border-white/[0.06] bg-[#10131C] p-3.5 sm:rounded-[16px] sm:p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-[9px] font-semibold uppercase leading-tight tracking-wide text-nexora-muted sm:text-[10px]">
                {s.label}
              </div>
              {s.live ? (
                <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-nexora-neon shadow-neon-sm" />
              ) : Icon ? (
                <Icon size={14} className={`shrink-0 ${s.color}`} />
              ) : null}
            </div>
            <div>
              <div className="font-display text-lg font-bold tabular-nums text-white sm:text-xl">
                <CountUp end={s.val} suffix={s.suffix ?? ''} />
              </div>
              {s.trend && (
                <div className="mt-0.5 text-[10px] font-semibold text-nexora-neon sm:text-[11px]">{s.trend}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
