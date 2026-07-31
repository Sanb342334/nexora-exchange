import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { REFERENCE_PRICES } from '../../common/trading-pairs';
import { BINARY_PAIRS, findBinaryPair, normalizePairId } from './binary.constants';

export type PriceTick = { pairId: string; price: number; ts: number };
export type Candle = { t: number; o: number; h: number; l: number; c: number };

const FX_SEED: Record<string, number> = {
  EURUSD: 1.0852,
  GBPUSD: 1.2735,
  USDJPY: 156.85,
  AUDUSD: 0.6618,
};

const HISTORY = 96;

function pairHash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type SteerState = { target: number; until: number; strength: number };

/**
 * Per-pair mean-reverting random walk.
 * Open trades steer the *real* price (no display-only bias jump on close).
 */
@Injectable()
export class BinaryPriceService implements OnModuleInit, OnModuleDestroy {
  private readonly prices = new Map<string, number>();
  private readonly candles = new Map<string, Candle[]>();
  private readonly volatility = new Map<string, number>();
  private readonly mean = new Map<string, number>();
  private readonly momentum = new Map<string, number>();
  private readonly phase = new Map<string, number>();
  private readonly steer = new Map<string, SteerState>();
  /** After settle — hold price near exit so chart doesn't bounce back */
  private readonly freezeUntil = new Map<string, number>();
  private timer?: NodeJS.Timeout;

  onModuleInit() {
    for (const p of BINARY_PAIRS) {
      const seed = p.kind === 'crypto' ? REFERENCE_PRICES[p.base] ?? 100 : FX_SEED[p.id] ?? 1;
      const h = pairHash(p.id);
      const rnd = mulberry32(h);
      this.volatility.set(p.id, p.kind === 'fx' ? 0.000045 + rnd() * 0.00008 : 0.00008 + rnd() * 0.00035);
      this.mean.set(p.id, seed);
      this.momentum.set(p.id, (rnd() - 0.5) * 0.0002);
      this.phase.set(p.id, rnd() * Math.PI * 2);
      const series = this.seedCandles(p.id, seed, h);
      this.prices.set(p.id, series[series.length - 1]?.c ?? seed);
      this.candles.set(p.id, series);
    }
    this.timer = setInterval(() => this.tickAll(), 350);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private nid(pairId: string) {
    return findBinaryPair(pairId)?.id ?? normalizePairId(pairId);
  }

  get(pairId: string): number {
    return this.prices.get(this.nid(pairId)) ?? 1;
  }

  list() {
    return BINARY_PAIRS.map((p) => ({ ...p, price: this.get(p.id) }));
  }

  tick(pairId: string): PriceTick {
    const id = this.nid(pairId);
    return { pairId: id, price: this.get(id), ts: Date.now() / 1000 };
  }

  history(pairId: string): Candle[] {
    return [...(this.candles.get(this.nid(pairId)) ?? [])];
  }

  /**
   * Soft-pull live market toward target while a trade is open.
   * Strength 0..1 — how hard we pull each tick window.
   */
  steerTo(pairId: string, target: number, strength = 0.35, holdMs = 2500) {
    const id = this.nid(pairId);
    if (!Number.isFinite(target) || target <= 0) return;
    const prev = this.steer.get(id);
    const s = Math.min(0.85, Math.max(0.08, strength));
    this.steer.set(id, {
      target,
      until: Date.now() + holdMs,
      strength: prev ? Math.max(prev.strength * 0.6, s) : s,
    });
  }

  /** Hard-set market after settle + freeze — no bounce back. */
  commitPrice(pairId: string, price: number) {
    const id = this.nid(pairId);
    if (!Number.isFinite(price) || price <= 0) return;
    this.prices.set(id, price);
    this.mean.set(id, price);
    this.momentum.set(id, 0);
    this.steer.delete(id);
    this.freezeUntil.set(id, Date.now() + 18_000);

    const series = this.candles.get(id) ?? [];
    if (series.length === 0) {
      const now = Math.floor(Date.now() / 1000);
      this.candles.set(id, [{ t: now, o: price, h: price, l: price, c: price }]);
      return;
    }
    const last = series[series.length - 1];
    const wick = Math.abs(last.c - price) * 0.35 + price * (this.volatility.get(id) ?? 0.0005) * 0.4;
    last.c = price;
    last.h = Math.max(last.o, last.h, price + wick);
    last.l = Math.min(last.o, last.l, price - wick);
    this.candles.set(id, series);
  }

  priceForOutcome(
    pairId: string,
    entry: number,
    direction: 'UP' | 'DOWN',
    shouldWin: boolean,
    leverage = 10,
  ): number {
    const id = this.nid(pairId);
    const vol = this.volatility.get(id) ?? 0.0006;
    const lev = Math.min(125, Math.max(1, leverage));
    // Higher leverage → larger price path (notional), so PnL swings harder both ways
    const pct = Math.min(0.14, Math.max(0.0012, vol * 5.5 + 0.0018 * Math.sqrt(lev)));
    const step = Math.max(
      entry * pct,
      id.includes('JPY') ? 0.12 * Math.sqrt(lev / 10) : entry < 1 ? 0.0012 * Math.sqrt(lev) : entry * pct,
    );
    const winUp = direction === 'UP';
    if (shouldWin) return winUp ? entry + step : entry - step;
    return winUp ? entry - step : entry + step;
  }

  biasedPrice(opts: {
    pairId: string;
    entry: number;
    direction: 'UP' | 'DOWN';
    shouldWin: boolean;
    createdAt: Date;
    durationSec: number;
    leverage?: number;
  }): { price: number; target: number; progress: number; inProfit: boolean } {
    const id = this.nid(opts.pairId);
    const entry = opts.entry;
    const lev = Math.min(125, Math.max(1, opts.leverage ?? 10));
    const target = this.priceForOutcome(id, entry, opts.direction, opts.shouldWin, lev);
    const elapsed = (Date.now() - opts.createdAt.getTime()) / 1000;
    // Higher leverage → PnL / path reaches extremes much faster
    const speed = 2.4 + Math.log10(lev) * 2.2; // ~2.4 at 1x, ~4.6 at 10x, ~6.8 at 100x
    const rawProgress = (elapsed / Math.max(1, opts.durationSec)) * speed;
    const progress = Math.min(0.99, Math.max(0.06, rawProgress));
    const eased = 1 - Math.pow(1 - Math.min(1, progress), 1.15);
    const vol = this.volatility.get(id) ?? 0.0006;
    const amp = Math.max(Math.abs(target - entry), entry * vol * Math.sqrt(lev) * 2.2);
    const wobble = Math.sin(Date.now() / (700 / Math.sqrt(Math.min(lev, 25))) + (this.phase.get(id) ?? 0)) * amp * 0.12;
    const price = entry + (target - entry) * eased + wobble;
    this.prices.set(id, price);
    this.steerTo(id, price, Math.min(0.92, 0.55 + lev / 200), 2800);

    const rawProfit = opts.direction === 'UP' ? price >= entry : price <= entry;
    const inProfit = progress > 0.08 ? opts.shouldWin : rawProfit;
    return { price, target, progress, inProfit };
  }

  /** Keep natural candle bodies; only adjust recent closes toward display price. */
  historyWithBias(pairId: string, biasedClose: number | null): Candle[] {
    const hist = this.history(pairId);
    if (biasedClose == null || hist.length === 0) return hist;
    const copy = hist.map((c) => ({ ...c }));
    const last = copy[copy.length - 1];
    const body = Math.abs(last.c - last.o) || Math.abs(biasedClose - last.o) * 0.4;
    const wickPad = Math.max(body * 0.35, Math.abs(biasedClose - last.o) * 0.15);
    last.c = biasedClose;
    last.h = Math.max(last.o, last.h, biasedClose) + wickPad * 0.25;
    last.l = Math.min(last.o, last.l, biasedClose) - wickPad * 0.25;
    // Gentle blend on 1–2 previous candles only (preserve size)
    for (let i = 1; i <= 2 && copy.length - 1 - i >= 0; i++) {
      const idx = copy.length - 1 - i;
      const blend = 0.2 / i;
      const mid = copy[idx].c * (1 - blend) + biasedClose * blend;
      const half = Math.max(Math.abs(copy[idx].c - copy[idx].o), Math.abs(mid - copy[idx].o) * 0.5);
      copy[idx] = {
        ...copy[idx],
        c: mid,
        h: Math.max(copy[idx].o, copy[idx].h, mid + half * 0.2),
        l: Math.min(copy[idx].o, copy[idx].l, mid - half * 0.2),
      };
    }
    return copy;
  }

  private seedCandles(pairId: string, price: number, hash: number): Candle[] {
    const rnd = mulberry32(hash ^ 0x9e3779b9);
    const vol = this.volatility.get(pairId) ?? 0.0006;
    const ph = this.phase.get(pairId) ?? 0;
    const out: Candle[] = [];
    let p = price * (0.985 + rnd() * 0.03);
    let mom = 0;
    const now = Math.floor(Date.now() / 1000);
    for (let i = HISTORY; i > 0; i--) {
      const o = p;
      // Regime flips: quiet → impulse → mean reversion
      if (rnd() < 0.04) mom = (rnd() - 0.5) * vol * 4;
      mom *= 0.92;
      const wave = Math.sin(i / (5 + (hash % 9)) + ph) * vol * 0.35;
      const meanPull = (price - p) / price * vol * 0.4;
      const noise = (rnd() - 0.5) * vol * 1.1;
      const ret = mom + wave + meanPull + noise;
      const c = Math.max(price * 0.00001, p * (1 + ret));
      const wick = Math.abs(c - o) * (0.25 + rnd() * 0.85) + price * vol * rnd() * 0.15;
      out.push({
        t: now - i * 3,
        o,
        h: Math.max(o, c) + wick * rnd(),
        l: Math.max(price * 0.00001, Math.min(o, c) - wick * rnd()),
        c,
      });
      p = c;
    }
    return out;
  }

  private tickAll() {
    const now = Math.floor(Date.now() / 1000);
    const tms = Date.now();
    for (const [pairId, price] of this.prices) {
      const pair = findBinaryPair(pairId);
      const vol = this.volatility.get(pairId) ?? (pair?.kind === 'fx' ? 0.00012 : 0.00035);
      const mean = this.mean.get(pairId) ?? price;
      let mom = this.momentum.get(pairId) ?? 0;
      const ph = this.phase.get(pairId) ?? 0;

      const frozen = (this.freezeUntil.get(pairId) ?? 0) > tms;
      let next: number;

      if (frozen) {
        const micro = (Math.random() - 0.5) * vol * 0.2;
        next = Math.max(0.00001, price * (1 + micro));
        this.momentum.set(pairId, 0);
      } else {
        this.freezeUntil.delete(pairId);
        if (Math.random() < 0.015) {
          mom = (Math.random() - 0.5) * vol * 1.8;
        }
        mom *= 0.96;

        const wave = Math.sin(now / (18 + (pairHash(pairId) % 22)) + ph) * vol * 0.22;
        const meanPull = ((mean - price) / Math.max(price, 1e-9)) * vol * 1.15;
        const noise = (Math.random() - 0.5) * vol * 0.65;
        let ret = mom + wave + meanPull + noise;

        const st = this.steer.get(pairId);
        if (st && tms < st.until) {
          const gap = (st.target - price) / Math.max(price, 1e-9);
          // Keep residual noise so candles keep body/wicks while drifting
          ret = ret * (1 - st.strength * 0.85) + gap * st.strength + noise * 0.25;
        } else if (st) {
          this.steer.delete(pairId);
        }

        const maxRet = vol * 1.8;
        ret = Math.max(-maxRet, Math.min(maxRet, ret));
        next = Math.max(0.00001, price * (1 + ret));
        this.momentum.set(pairId, mom);
      }

      this.prices.set(pairId, next);

      const series = this.candles.get(pairId) ?? [];
      const last = series[series.length - 1];
      const wickJitter = next * vol * (0.35 + Math.random() * 0.9);
      if (!last || now - last.t >= 3) {
        const o = last?.c ?? next;
        series.push({
          t: now,
          o,
          h: Math.max(o, next) + wickJitter * Math.random(),
          l: Math.min(o, next) - wickJitter * Math.random(),
          c: next,
        });
        if (series.length > HISTORY) series.shift();
      } else {
        last.c = next;
        last.h = Math.max(last.h, next, last.o) + wickJitter * 0.15 * Math.random();
        last.l = Math.min(last.l, next, last.o) - wickJitter * 0.15 * Math.random();
      }
      this.candles.set(pairId, series);
    }
  }
}
