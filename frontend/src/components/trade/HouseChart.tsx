'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';

export type ChartCandle = { t: number; o: number; h: number; l: number; c: number };
export type ChartMarker = {
  tradeId: string;
  entryPrice: number;
  direction: string;
  createdAt: string;
  inProfit: boolean;
};

type Props = {
  candles: ChartCandle[];
  markers?: ChartMarker[];
  price?: number;
  height?: number | string;
  pairLabel?: string;
  takeProfit?: number | null;
  stopLoss?: number | null;
};

const BULL = '#26a69a';
const BEAR = '#ef5350';

export function HouseChart({
  candles,
  markers = [],
  price,
  height = 'min(520px, calc(100dvh - 220px))',
  pairLabel,
  takeProfit,
  stopLoss,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(60);

  const view = useMemo(() => {
    const n = Math.max(20, Math.min(candles.length, visible));
    return candles.slice(-n);
  }, [candles, visible]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const wrap = canvas.parentElement;
    if (!wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = '#131722';
    ctx.fillRect(0, 0, w, h);

    if (view.length < 2) {
      ctx.fillStyle = '#787B86';
      ctx.font = '12px Trebuchet MS, sans-serif';
      ctx.fillText('Загрузка графика…', 16, 28);
      return;
    }

    const padL = 4;
    const padR = 64;
    const padT = 28;
    const padB = 22;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    const highs = view.map((c) => c.h);
    const lows = view.map((c) => c.l);
    for (const m of markers) {
      highs.push(m.entryPrice);
      lows.push(m.entryPrice);
    }
    const lastPx = price ?? view[view.length - 1].c;
    if (price) {
      highs.push(price);
      lows.push(price);
    }
    // TP/SL only expand scale if close to market (avoid zoom-out crush)
    if (takeProfit != null && Math.abs(takeProfit - lastPx) / lastPx < 0.08) highs.push(takeProfit);
    if (stopLoss != null && Math.abs(stopLoss - lastPx) / lastPx < 0.08) lows.push(stopLoss);

    let max = Math.max(...highs);
    let min = Math.min(...lows);
    let span = max - min || lastPx * 0.002 || 1;

    // Keep chart zoom stable — prevent stubby candles when recent range collapses
    let atr = 0;
    for (const c of view) atr += Math.max(c.h - c.l, Math.abs(c.c - c.o));
    atr /= view.length;
    const minSpan = Math.max(atr * 5.5, lastPx * 0.0035, span * 0.35);
    if (span < minSpan) {
      const mid = (max + min) / 2;
      max = mid + minSpan / 2;
      min = mid - minSpan / 2;
      span = minSpan;
    } else {
      max += span * 0.06;
      min -= span * 0.06;
      span = max - min;
    }
    const range = span;

    const yOf = (v: number) => padT + ((max - v) / range) * plotH;
    const cw = plotW / view.length;

    ctx.strokeStyle = 'rgba(42,46,57,0.9)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 8; i++) {
      const y = padT + (plotH / 8) * i;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
      const val = max - (range / 8) * i;
      ctx.fillStyle = '#787B86';
      ctx.font = '11px Trebuchet MS, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(formatPrice(val), w - padR + 6, y + 4);
    }

    view.forEach((c, i) => {
      const x = padL + i * cw + cw / 2;
      const up = c.c >= c.o;
      const color = up ? BULL : BEAR;

      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, Math.min(2, cw * 0.12));
      ctx.beginPath();
      ctx.moveTo(x, yOf(c.h));
      ctx.lineTo(x, yOf(c.l));
      ctx.stroke();

      const bodyTop = yOf(Math.max(c.o, c.c));
      const bodyBot = yOf(Math.min(c.o, c.c));
      const bh = Math.max(2, bodyBot - bodyTop);
      const bw = Math.max(4, Math.min(cw * 0.72, 11));

      ctx.fillStyle = color;
      ctx.fillRect(x - bw / 2, bodyTop, bw, bh);
    });

    const drawLevel = (value: number | null | undefined, color: string, label: string) => {
      if (value == null) return;
      if (Math.abs(value - lastPx) / Math.max(lastPx, 1e-9) >= 0.08) return;
      const y = yOf(value);
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      ctx.font = '10px Trebuchet MS, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${label} ${formatPrice(value)}`, padL + 6, y - 4);
    };

    drawLevel(takeProfit, '#089981', 'TP');
    drawLevel(stopLoss, '#F23645', 'SL');

    // Binomo / Bybit style entry: level + triangle + LEFT price tag (not mixed with live price on right)
    for (const m of markers) {
      const entryTs = Math.floor(new Date(m.createdAt).getTime() / 1000);
      let bestIdx = view.length - 1;
      let bestDiff = Infinity;
      for (let i = 0; i < view.length; i++) {
        const d = Math.abs(view[i].t - entryTs);
        if (d < bestDiff) {
          bestDiff = d;
          bestIdx = i;
        }
      }
      const x = padL + bestIdx * cw + cw / 2;
      const y = yOf(m.entryPrice);
      const long = m.direction === 'UP';
      const color = long ? BULL : BEAR;

      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(padL + 52, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      ctx.fillStyle = color;
      ctx.beginPath();
      if (long) {
        ctx.moveTo(x, y - 2);
        ctx.lineTo(x - 6, y - 12);
        ctx.lineTo(x + 6, y - 12);
      } else {
        ctx.moveTo(x, y + 2);
        ctx.lineTo(x - 6, y + 12);
        ctx.lineTo(x + 6, y + 12);
      }
      ctx.closePath();
      ctx.fill();

      // Entry price badge on the LEFT
      const tagH = 18;
      const label = formatPrice(m.entryPrice);
      ctx.font = '600 10px Trebuchet MS, sans-serif';
      const tagW = Math.max(48, ctx.measureText(label).width + 14);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(padL + tagW + 4, y);
      ctx.lineTo(padL + tagW - 2, y - tagH / 2);
      ctx.lineTo(padL, y - tagH / 2);
      ctx.lineTo(padL, y + tagH / 2);
      ctx.lineTo(padL + tagW - 2, y + tagH / 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(label, padL + tagW / 2 - 1, y + 3.5);
    }

    if (price != null) {
      const y = yOf(price);
      ctx.setLineDash([2, 2]);
      ctx.strokeStyle = 'rgba(41,98,255,0.55)';
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
      ctx.setLineDash([]);
      // live price tag (below entry tag if overlap — still draw)
      ctx.fillStyle = '#2962FF';
      const tagW = padR - 6;
      ctx.fillRect(w - padR + 2, y - 9, tagW, 18);
      ctx.fillStyle = '#fff';
      ctx.font = '600 11px Trebuchet MS, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(formatPrice(price), w - padR / 2, y + 4);
    }

    if (pairLabel) {
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font = '600 12px Trebuchet MS, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(pairLabel, padL + 8, 18);
    }
  }, [view, markers, price, pairLabel, takeProfit, stopLoss]);

  return (
    <div
      className="relative isolate z-0 w-full min-h-[280px] rounded-lg border border-[#2A2E39] bg-[#131722] overflow-hidden"
      style={{ height }}
    >
      <div className="absolute right-2 top-2 z-10 flex gap-1">
        <button
          type="button"
          aria-label="Уменьшить"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-[#2A2E39] bg-[#1E222D] text-[#D1D4DC] hover:bg-[#2A2E39]"
          onClick={() => setVisible((v) => Math.min(candles.length || 120, v + 20))}
        >
          <Minus size={14} />
        </button>
        <button
          type="button"
          aria-label="Увеличить"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-[#2A2E39] bg-[#1E222D] text-[#D1D4DC] hover:bg-[#2A2E39]"
          onClick={() => setVisible((v) => Math.max(20, v - 15))}
        >
          <Plus size={14} />
        </button>
      </div>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}

function formatPrice(v: number) {
  if (v >= 1000) return v.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (v >= 100) return v.toFixed(3);
  if (v >= 1) return v.toFixed(3);
  if (v >= 0.01) return v.toFixed(5);
  return v.toFixed(6);
}
