'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost, ApiError } from '@/lib/api';
import { useLocale } from '@/lib/i18n/locale-context';
import { useFormat } from '@/lib/use-format';
import { useToast } from '@/components/nexora/ToastProvider';

type Position = {
  id: string;
  symbol: string;
  base: string;
  side: 'LONG' | 'SHORT';
  leverage: number;
  entryPrice: number;
  markPrice: number;
  quantity: number;
  margin: number;
  liquidationPrice: number;
  unrealizedPnl: number;
};

type Props = {
  symbol?: string;
  refreshKey?: number;
  onClosed?: () => void;
};

export function PositionsPanel({ symbol, refreshKey = 0, onClosed }: Props) {
  const { t } = useLocale();
  const tr = t.app.trade;
  const { fmtNum } = useFormat();
  const toast = useToast();
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [closingId, setClosingId] = useState<string | null>(null);

  const load = useCallback(() => {
    const q = symbol ? `?symbol=${encodeURIComponent(symbol)}` : '';
    apiGet<Position[]>(`/trading/futures/positions${q}`)
      .then(setPositions)
      .catch(() => setPositions([]))
      .finally(() => setLoading(false));
  }, [symbol]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load, refreshKey]);

  const close = async (id: string) => {
    setClosingId(id);
    try {
      await apiPost(`/trading/futures/positions/${id}/close`, {});
      toast('success', tr.positionClosed);
      load();
      onClosed?.();
    } catch (err) {
      toast('error', err instanceof ApiError ? err.message : tr.orderFailed);
    } finally {
      setClosingId(null);
    }
  };

  return (
    <div className="rounded-[14px] border border-nexora-border bg-[#10131C] p-3">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-nexora-muted">{tr.positions}</h3>
      {loading && positions.length === 0 ? (
        <p className="text-xs text-nexora-muted">{t.app.common.loading}</p>
      ) : positions.length === 0 ? (
        <p className="text-xs text-nexora-muted">{tr.noPositions}</p>
      ) : (
        <div className="space-y-2">
          {positions.map((p) => {
            const up = p.unrealizedPnl >= 0;
            const isLong = p.side === 'LONG';
            return (
              <div key={p.id} className="rounded-lg border border-white/[0.06] bg-black/20 p-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-white">
                    {p.base}
                    <span className={`ml-1.5 ${isLong ? 'text-nexora-neon' : 'text-nexora-error'}`}>
                      {isLong ? tr.long : tr.short} {p.leverage}x
                    </span>
                  </span>
                  <span className={`tabular-nums font-semibold ${up ? 'text-nexora-neon' : 'text-nexora-error'}`}>
                    {up ? '+' : ''}{fmtNum(p.unrealizedPnl)} USDT
                  </span>
                </div>
                <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] text-nexora-muted tabular-nums">
                  <span>{tr.price}: {fmtNum(p.entryPrice)}</span>
                  <span>Mark: {fmtNum(p.markPrice)}</span>
                  <span>{tr.margin}: {fmtNum(p.margin)}</span>
                  <span>{tr.liquidationPrice}: {fmtNum(p.liquidationPrice)}</span>
                </div>
                <button
                  type="button"
                  disabled={closingId === p.id}
                  onClick={() => close(p.id)}
                  className="mt-2 w-full rounded-md border border-nexora-border py-1.5 text-[11px] font-semibold text-white hover:bg-white/5 disabled:opacity-50"
                >
                  {closingId === p.id ? tr.validating : tr.closePosition}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
