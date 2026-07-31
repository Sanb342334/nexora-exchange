'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, Timer } from 'lucide-react';
import { apiGet, apiPost, ApiError } from '@/lib/api';
import { useSocketEvent } from '@/lib/socket';
import { useToast } from '@/components/nexora/ToastProvider';
import { HouseChart, type ChartCandle, type ChartMarker } from '@/components/trade/HouseChart';
import { CryptoIcon } from '@/components/trade/CryptoIcon';
import { AmountInput } from '@/components/ui/AmountInput';

type Me = {
  balance: string;
  currency: string;
  symbol: string;
  payout: number;
  tradeFeeRate?: number;
};

type Duration = { sec: number; label: string };

type PairRow = {
  id: string;
  title: string;
  base: string;
  quote: string;
  kind: string;
  price: number;
};

type FeedItem = {
  id: string;
  pairId: string;
  direction: string;
  stake: string;
  fee?: string;
  feeRate?: number;
  payout: string;
  status: string;
  durationSec: number;
  leverage?: number;
  realizedPnl?: string | number;
  entryPrice?: string;
  exitPrice?: string | null;
  takeProfit?: string | null;
  stopLoss?: string | null;
  closeReason?: string | null;
  createdAt: string;
  settledAt?: string | null;
  inProfit: boolean | null;
  live: boolean;
};

type ChartResp = {
  pair: string;
  price: number;
  candles: ChartCandle[];
  markers: ChartMarker[];
  active: null | {
    id: string;
    direction: string;
    entryPrice: number;
    durationSec: number;
    endsAt: string;
    inProfit: boolean;
    leverage: number;
    stake: string;
    fee?: string;
    unrealizedPnl: number;
    takeProfit: number | null;
    stopLoss: number | null;
  };
};

type Props = {
  pairId: string;
  base: string;
  quote: string;
};

export function BinaryTradeTerminal({ pairId, base, quote }: Props) {
  const toast = useToast();
  const router = useRouter();
  const normalized = pairId.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const [me, setMe] = useState<Me | null>(null);
  const [pairs, setPairs] = useState<PairRow[]>([]);
  const [pairOpen, setPairOpen] = useState(false);
  const [pairQ, setPairQ] = useState('');
  const [durations, setDurations] = useState<Duration[]>([]);
  const [durationSec, setDurationSec] = useState(60);
  const [stake, setStake] = useState('100');
  const [leverage, setLeverage] = useState(10);
  const [tp, setTp] = useState('');
  const [sl, setSl] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [status, setStatus] = useState('Готов к сделке');
  const [chart, setChart] = useState<ChartResp | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const skipSettledToast = useRef(false);

  const loadMe = useCallback(async () => {
    setMe(await apiGet<Me>('/binary/me'));
  }, []);

  const loadChart = useCallback(async () => {
    const data = await apiGet<ChartResp>(`/binary/chart?pair=${normalized}`);
    setChart(data);
    if (data.active) {
      const left = Math.max(0, Math.ceil((new Date(data.active.endsAt).getTime() - Date.now()) / 1000));
      setCountdown(left > 0 ? left : null);
    } else {
      setCountdown(null);
    }
  }, [normalized]);

  const loadFeed = useCallback(async () => {
    const data = await apiGet<{ items: FeedItem[] }>('/binary/feed?limit=40');
    setFeed(data.items);
  }, []);

  useEffect(() => {
    apiGet<{ durations: Duration[] }>('/binary/durations')
      .then((d) => {
        setDurations(d.durations);
        if (d.durations[0]) setDurationSec(d.durations[0].sec);
      })
      .catch(() => {});
    apiGet<{ pairs: PairRow[] }>('/binary/pairs')
      .then((d) => setPairs(d.pairs.filter((p) => p.kind === 'crypto')))
      .catch(() => {});
    loadMe().catch(() => {});
    loadFeed().catch(() => {});
  }, [loadMe, loadFeed]);

  useEffect(() => {
    loadChart().catch(() => {});
    const t = setInterval(() => loadChart().catch(() => {}), 700);
    return () => clearInterval(t);
  }, [loadChart]);

  useEffect(() => {
    const t = setInterval(() => loadFeed().catch(() => {}), 2000);
    return () => clearInterval(t);
  }, [loadFeed]);

  useSocketEvent('binary:settled', (payload: { status?: string; profit?: string; balance?: string; symbol?: string; liquidated?: boolean }) => {
    const won = payload.status === 'WON';
    if (payload.balance != null) {
      setMe((prev) =>
        prev
          ? { ...prev, balance: payload.balance!, symbol: payload.symbol ?? prev.symbol }
          : prev,
      );
    }
    setStatus(
      payload.liquidated
        ? 'Ликвидация'
        : won
          ? `PnL +${payload.profit ?? ''}`
          : `PnL ${payload.profit ?? '0'}`,
    );
    if (!skipSettledToast.current) {
      if (payload.liquidated) toast('error', 'Позиция ликвидирована — маржа списана');
      else toast(won ? 'success' : 'error', won ? 'Сделка закрыта с прибылью' : 'Сделка закрыта с убытком');
    }
    skipSettledToast.current = false;
    setCountdown(null);
    loadMe().catch(() => {});
    loadFeed().catch(() => {});
    loadChart().catch(() => {});
  });

  useSocketEvent('balance:updated', (payload: { balance?: string; symbol?: string }) => {
    if (payload?.balance == null) return;
    setMe((prev) =>
      prev ? { ...prev, balance: payload.balance!, symbol: payload.symbol ?? prev.symbol } : prev,
    );
  });

  const filteredPairs = useMemo(() => {
    const q = pairQ.trim().toUpperCase();
    if (!q) return pairs;
    return pairs.filter((p) => p.id.includes(q) || p.base.includes(q) || p.title.includes(q));
  }, [pairs, pairQ]);

  const place = async (direction: 'UP' | 'DOWN') => {
    const amount = parseFloat(stake);
    if (!amount || amount <= 0) {
      toast('error', 'Укажите маржу');
      return;
    }
    setLoading(true);
    try {
      await apiPost('/binary/trade', {
        pair: normalized,
        direction: direction.toLowerCase(),
        stake: amount,
        duration_sec: durationSec,
        leverage,
        take_profit: tp ? parseFloat(tp) : undefined,
        stop_loss: sl ? parseFloat(sl) : undefined,
      });
      setCountdown(durationSec);
      setStatus('Позиция открыта');
      toast('success', `${direction === 'UP' ? 'Long' : 'Short'} · ${base}/${quote} · ${leverage}x`);
      await Promise.all([loadMe(), loadFeed(), loadChart()]);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Не удалось открыть позицию';
      setStatus(msg);
      toast('error', msg);
    } finally {
      setLoading(false);
    }
  };

  const closePos = async (id: string) => {
    try {
      skipSettledToast.current = true;
      const res = await apiPost<{
        balance?: string;
        symbol?: string;
        liquidated?: boolean;
        profit?: number;
        status?: string;
      }>(`/binary/trades/${id}/close`, {});
      if (res?.balance != null) {
        setMe((prev) =>
          prev ? { ...prev, balance: String(res.balance), symbol: res.symbol ?? prev.symbol } : prev,
        );
      }
      if (res?.liquidated) toast('error', 'Позиция ликвидирована — маржа списана');
      else toast('success', 'Позиция закрыта');
      await Promise.all([loadMe(), loadFeed(), loadChart()]);
      setTimeout(() => {
        loadMe().catch(() => {});
      }, 400);
    } catch (err) {
      skipSettledToast.current = false;
      toast('error', err instanceof ApiError ? err.message : 'Ошибка закрытия');
    }
  };

  const switchPair = (p: PairRow) => {
    setPairOpen(false);
    router.push(`/trade/${p.base}_${p.quote}`);
  };

  const uPnl = chart?.active?.unrealizedPnl;

  return (
    <div className="grid gap-3 xl:grid-cols-[1fr_minmax(260px,320px)] tg-terminal">
      <div className="min-w-0 space-y-3">
        <div className="relative flex flex-wrap items-center gap-2 rounded-[12px] border border-nexora-border bg-[#10131C] px-3 py-2">
          <button
            type="button"
            onClick={() => setPairOpen((v) => !v)}
            className="inline-flex items-center gap-2 rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-sm font-bold text-white hover:bg-white/[0.07]"
          >
            <CryptoIcon symbol={base} size={22} />
            {base}
            <span className="text-nexora-muted font-semibold">/{quote}</span>
            <ChevronDown size={14} className="text-nexora-muted" />
          </button>
          <div className="text-sm tabular-nums text-white font-semibold">
            {chart?.price != null
              ? chart.price.toLocaleString('ru-RU', {
                  minimumFractionDigits: 3,
                  maximumFractionDigits: chart.price >= 1 ? 3 : 6,
                })
              : '—'}
          </div>
          {chart?.active && (
            <div
              className={`ml-auto text-xs font-bold tabular-nums ${
                (uPnl ?? 0) >= 0 ? 'text-nexora-neon' : 'text-nexora-error'
              }`}
            >
              uPnL {(uPnl ?? 0) >= 0 ? '+' : ''}
              {(uPnl ?? 0).toFixed(2)} {me?.symbol}
            </div>
          )}

          {pairOpen && (
            <div className="absolute left-2 right-2 top-full z-30 mt-1 max-h-72 overflow-hidden rounded-xl border border-nexora-border bg-[#0E1118] shadow-xl">
              <input
                className="input w-full rounded-none border-0 border-b border-white/10 text-sm"
                placeholder="Поиск пары…"
                value={pairQ}
                onChange={(e) => setPairQ(e.target.value)}
                autoFocus
              />
              <div className="max-h-56 overflow-y-auto">
                {filteredPairs.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => switchPair(p)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/[0.04] ${
                      p.id === normalized ? 'bg-nexora-accent/15' : ''
                    }`}
                  >
                    <CryptoIcon symbol={p.base} size={18} />
                    <span className="font-semibold text-white">{p.base}</span>
                    <span className="text-nexora-muted">/{p.quote}</span>
                    <span className="ml-auto tabular-nums text-xs text-nexora-muted">
                      {p.price?.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <HouseChart
          candles={chart?.candles ?? []}
          markers={chart?.markers ?? []}
          price={chart?.price}
          pairLabel={`${base}/${quote}`}
          takeProfit={chart?.active?.takeProfit}
          stopLoss={chart?.active?.stopLoss}
          height="min(480px, calc(var(--tg-viewport-stable-height, 100dvh) - 280px))"
        />

        {chart?.active && (
          <div className="rounded-[14px] border border-nexora-border bg-[#10131C] px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Timer size={16} className="text-nexora-accent" />
              <span className="font-semibold text-white">В процессе</span>
              <span className="text-nexora-muted text-xs">
                {chart.active.direction === 'UP' ? 'Long' : 'Short'} · {chart.active.leverage}x · вход{' '}
                {chart.active.entryPrice.toFixed(4)}
                {chart.active.fee != null && Number(chart.active.fee) > 0
                  ? ` · комиссия ${Number(chart.active.fee).toFixed(2)}`
                  : ''}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-nexora-accent font-bold tabular-nums">
                {countdown != null ? `${countdown}с` : '—'}
              </span>
              <button type="button" className="btn-secondary text-xs py-1" onClick={() => closePos(chart.active!.id)}>
                Закрыть
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="rounded-[14px] border border-nexora-border bg-[#10131C] p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-nexora-muted">Баланс</div>
              <div className="text-lg font-bold text-nexora-neon tabular-nums">
                {me ? `${Number(me.balance).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${me.symbol}` : '—'}
              </div>
            </div>
            <Link href="/deposit" className="text-[11px] text-nexora-accent hover:underline">
              Пополнить
            </Link>
          </div>

          <label className="mb-2 block text-[11px] text-nexora-muted">
            Маржа
            <AmountInput
              className="input mt-1 w-full py-2 text-sm"
              value={stake}
              onChange={setStake}
            />
          </label>
          {(() => {
            const feeRate = me?.tradeFeeRate ?? 0.01;
            const margin = parseFloat(stake) || 0;
            const fee = margin * feeRate;
            return (
              <div className="mb-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2 text-[11px] text-nexora-muted">
                Комиссия {(feeRate * 100).toFixed(0)}%:{' '}
                <span className="font-semibold text-white tabular-nums">{fee.toFixed(2)}</span>
                {' · '}Итого списания:{' '}
                <span className="font-semibold text-white tabular-nums">{(margin + fee).toFixed(2)}</span>
                {me?.symbol ? ` ${me.symbol}` : ''}
              </div>
            );
          })()}

          <div className="mb-2">
            <div className="mb-1 text-[11px] text-nexora-muted">Плечо</div>
            <div className="flex flex-wrap gap-1">
              {[5, 10, 20, 50, 100].map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLeverage(l)}
                  className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
                    leverage === l ? 'bg-nexora-accent/20 text-nexora-accent' : 'bg-nexora-hover text-nexora-muted'
                  }`}
                >
                  {l}x
                </button>
              ))}
            </div>
          </div>

          <div className="mb-2 grid grid-cols-2 gap-2">
            <label className="text-[11px] text-nexora-muted">
              TP
              <input
                className="input mt-1 w-full py-1.5 text-xs"
                placeholder="Take Profit"
                value={tp}
                onChange={(e) => setTp(e.target.value.replace(/[^\d.]/g, ''))}
              />
            </label>
            <label className="text-[11px] text-nexora-muted">
              SL
              <input
                className="input mt-1 w-full py-1.5 text-xs"
                placeholder="Stop Loss"
                value={sl}
                onChange={(e) => setSl(e.target.value.replace(/[^\d.]/g, ''))}
              />
            </label>
          </div>

          <div className="mb-3">
            <div className="mb-1 text-[11px] text-nexora-muted">Время позиции</div>
            <div className="flex flex-wrap gap-1">
              {durations.map((d) => (
                <button
                  key={d.sec}
                  type="button"
                  onClick={() => setDurationSec(d.sec)}
                  className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
                    durationSec === d.sec ? 'bg-nexora-accent/20 text-nexora-accent' : 'bg-nexora-hover text-nexora-muted'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => place('UP')}
              className="rounded-lg bg-[#0B3B2E] py-3 text-sm font-bold text-[#0ECB81] hover:brightness-110 disabled:opacity-50"
            >
              Long / Вверх
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => place('DOWN')}
              className="rounded-lg bg-[#3B1519] py-3 text-sm font-bold text-[#F6465D] hover:brightness-110 disabled:opacity-50"
            >
              Short / Вниз
            </button>
          </div>

          <div className="mt-3 text-center text-xs text-nexora-muted">
            {countdown != null ? (
              <span className="inline-flex items-center gap-1 font-semibold text-nexora-accent">
                <Timer size={12} /> До автозакрытия: {countdown}с
              </span>
            ) : (
              status
            )}
          </div>
        </div>

        <div className="rounded-[14px] border border-nexora-border bg-[#10131C] p-3 overflow-hidden">
          <div className="mb-2 text-[10px] uppercase tracking-wide text-nexora-muted">Позиции · история</div>
          <div className="overflow-x-auto max-h-[320px] overflow-y-auto">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-[#10131C] text-nexora-muted">
                <tr className="border-b border-white/[0.06]">
                  <th className="py-1.5 text-left font-medium">Пара</th>
                  <th className="py-1.5 text-left font-medium">Сторона</th>
                  <th className="py-1.5 text-right font-medium">Маржа</th>
                  <th className="py-1.5 text-right font-medium">Комиссия</th>
                  <th className="py-1.5 text-right font-medium">PnL</th>
                  <th className="py-1.5 text-right font-medium">Статус</th>
                </tr>
              </thead>
              <tbody>
                {feed.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-nexora-muted">
                      Нет позиций
                    </td>
                  </tr>
                ) : (
                  feed.map((t) => {
                    const live = t.live || t.status === 'OPEN';
                    const pnl = live
                      ? null
                      : t.realizedPnl != null
                        ? Number(t.realizedPnl)
                        : t.status === 'WON'
                          ? Number(t.payout) - Number(t.stake)
                          : -Number(t.stake);
                    const feeN = Number(t.fee ?? 0);
                    const baseSym = t.pairId.replace(/USDT|USD$/, '');
                    return (
                      <tr key={t.id} className="border-b border-white/[0.04]">
                        <td className="py-2">
                          <span className="inline-flex items-center gap-1.5 font-semibold text-white">
                            <CryptoIcon symbol={baseSym} size={14} />
                            {t.pairId}
                          </span>
                        </td>
                        <td className={t.direction === 'UP' ? 'text-[#0ECB81]' : 'text-[#F6465D]'}>
                          {t.direction === 'UP' ? 'Long' : 'Short'}
                          {t.leverage ? ` ${t.leverage}x` : ''}
                        </td>
                        <td className="text-right tabular-nums text-white">{t.stake}</td>
                        <td className="text-right tabular-nums text-nexora-muted">
                          {feeN > 0 ? (
                            <>
                              {feeN.toFixed(2)}
                              <span className="block text-[9px] opacity-70">1%</span>
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td
                          className={`text-right tabular-nums font-bold ${
                            live
                              ? t.inProfit
                                ? 'text-[#0ECB81]'
                                : 'text-[#F6465D]'
                              : (pnl ?? 0) >= 0
                                ? 'text-[#0ECB81]'
                                : 'text-[#F6465D]'
                          }`}
                        >
                          {live ? '—' : `${(pnl ?? 0) >= 0 ? '+' : ''}${(pnl ?? 0).toFixed(2)}`}
                        </td>
                        <td className="text-right">
                          {live ? (
                            <button
                              type="button"
                              className="text-nexora-accent hover:underline"
                              onClick={() => closePos(t.id)}
                            >
                              Close
                            </button>
                          ) : (
                            <span className="text-nexora-muted">{t.closeReason || t.status}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
