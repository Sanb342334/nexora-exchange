'use client';

const DAY_MS = 86_400_000;
const STORAGE_KEY = 'nexora_sim_stats_v1';

interface DayState {
  dayKey: number;
  baseVolume: number;
  baseDeals: number;
  baseUsers: number;
}

function dayKey() {
  return Math.floor(Date.now() / DAY_MS);
}

function loadDayState(): DayState {
  if (typeof window === 'undefined') {
    return { dayKey: dayKey(), baseVolume: 720_000, baseDeals: 890, baseUsers: 968 };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DayState;
      if (parsed.dayKey === dayKey()) return parsed;
    }
  } catch {
    /* ignore */
  }
  const fresh: DayState = {
    dayKey: dayKey(),
    baseVolume: 640_000 + Math.random() * 180_000,
    baseDeals: 780 + Math.floor(Math.random() * 180),
    baseUsers: 920 + Math.floor(Math.random() * 80),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  return fresh;
}

/** Demo stats that feel like a live exchange (~1000 users, drifting volume/deals, random online). */
export function getSimulatedMarketStats(onlineJitter = 0) {
  const state = loadDayState();
  const progress = (Date.now() % DAY_MS) / DAY_MS;
  const wave = Math.sin(progress * Math.PI * 2) * 0.04;
  const trend = 0.78 + progress * 0.28 + wave;

  const volume = Math.round(state.baseVolume * trend * (1 + (Math.random() - 0.5) * 0.015));
  const deals24h = Math.max(650, Math.round(state.baseDeals * trend * (1 + (Math.random() - 0.5) * 0.02)));
  const users = Math.min(1000, Math.max(900, Math.round(state.baseUsers + progress * 25)));
  const onlineBase = 140 + Math.sin(progress * Math.PI * 6) * 35;
  const online = Math.max(98, Math.min(420, Math.round(onlineBase + onlineJitter + (Math.random() - 0.5) * 18)));
  const activeAds = 42 + Math.floor(Math.random() * 16);

  const volumeTrend = progress > 0.5 ? '+' + (12 + progress * 14).toFixed(1) : '+' + (8 + progress * 10).toFixed(1);
  const dealsTrend = progress > 0.45 ? '+' + (10 + progress * 12).toFixed(1) : '+' + (6 + progress * 8).toFixed(1);

  return {
    activeAds,
    deals24h,
    volume24h: String(volume),
    users,
    online,
    volumeTrend: `${volumeTrend}%`,
    dealsTrend: `${dealsTrend}%`,
  };
}

export interface SimulatedMarketStats {
  activeAds: number;
  deals24h: number;
  volume24h: string;
  users: number;
  online: number;
  volumeTrend: string;
  dealsTrend: string;
}
