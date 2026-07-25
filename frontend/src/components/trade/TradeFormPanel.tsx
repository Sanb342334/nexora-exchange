'use client';

import { useState } from 'react';
import { apiPost, ApiError } from '@/lib/api';
import { useLocale } from '@/lib/i18n/locale-context';
import { useToast } from '@/components/nexora/ToastProvider';

type Props = {
  base: string;
  quote: string;
  symbol: string;
  mode: 'spot' | 'futures';
  onFuturesOpened?: () => void;
};

const LEVERAGES = [1, 2, 3, 5, 10, 20];

function clientOrderId() {
  return `nex_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function TradeFormPanel({ base, quote, symbol, mode, onFuturesOpened }: Props) {
  const { t } = useLocale();
  const tr = t.app.trade;
  const toast = useToast();
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<'limit' | 'market'>('market');
  const [price, setPrice] = useState('');
  const [amount, setAmount] = useState('');
  const [leverage, setLeverage] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submitSpot = async () => {
    if (!amount || parseFloat(amount) <= 0) return;
    setError('');
    setLoading(true);
    try {
      await apiPost('/trading/orders', {
        side: side === 'buy' ? 'BUY' : 'SELL',
        type: orderType === 'market' ? 'MARKET' : 'LIMIT',
        symbol,
        quantity: amount,
        price: orderType === 'limit' ? price : undefined,
        clientOrderId: clientOrderId(),
      });
      toast('success', tr.orderPlaced);
      setAmount('');
      setPrice('');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : tr.orderFailed;
      setError(msg);
      toast('error', msg);
    } finally {
      setLoading(false);
    }
  };

  const submitFutures = async () => {
    if (!amount || parseFloat(amount) <= 0) return;
    setError('');
    setLoading(true);
    try {
      await apiPost('/trading/futures/positions', {
        side: side === 'buy' ? 'LONG' : 'SHORT',
        symbol,
        quantity: amount,
        leverage,
        clientOrderId: clientOrderId(),
      });
      toast('success', tr.positionOpened);
      setAmount('');
      onFuturesOpened?.();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : tr.orderFailed;
      setError(msg);
      toast('error', msg);
    } finally {
      setLoading(false);
    }
  };

  const submit = mode === 'futures' ? submitFutures : submitSpot;
  const submitLabel =
    mode === 'futures'
      ? tr.openPosition
      : (side === 'buy' ? tr.submitBuy : tr.submitSell).replace('{base}', base);

  return (
    <div className="rounded-[14px] border border-nexora-border bg-[#10131C] p-3">
      <div className="mb-3 flex gap-1 rounded-lg bg-nexora-hover p-0.5">
        <button
          type="button"
          onClick={() => setSide('buy')}
          className={`flex-1 rounded-md py-1.5 text-xs font-bold ${side === 'buy' ? 'bg-nexora-neon/20 text-nexora-neon' : 'text-nexora-muted'}`}
        >
          {mode === 'futures' ? tr.long : tr.buy}
        </button>
        <button
          type="button"
          onClick={() => setSide('sell')}
          className={`flex-1 rounded-md py-1.5 text-xs font-bold ${side === 'sell' ? 'bg-nexora-error/20 text-nexora-error' : 'text-nexora-muted'}`}
        >
          {mode === 'futures' ? tr.short : tr.sell}
        </button>
      </div>

      {mode === 'spot' && (
        <div className="mb-3 flex gap-2 text-[11px]">
          <button type="button" onClick={() => setOrderType('limit')} className={orderType === 'limit' ? 'text-nexora-accent font-semibold' : 'text-nexora-muted'}>{tr.limit}</button>
          <button type="button" onClick={() => setOrderType('market')} className={orderType === 'market' ? 'text-nexora-accent font-semibold' : 'text-nexora-muted'}>{tr.market}</button>
        </div>
      )}

      {mode === 'futures' && (
        <label className="mb-3 block text-[11px] text-nexora-muted">
          {tr.leverage}
          <div className="mt-1 flex flex-wrap gap-1">
            {LEVERAGES.map((lev) => (
              <button
                key={lev}
                type="button"
                onClick={() => setLeverage(lev)}
                className={`rounded-md px-2 py-1 text-[11px] font-semibold ${leverage === lev ? 'bg-nexora-accent/20 text-nexora-accent' : 'bg-nexora-hover text-nexora-muted'}`}
              >
                {lev}x
              </button>
            ))}
          </div>
        </label>
      )}

      {mode === 'spot' && orderType === 'limit' && (
        <label className="block mb-2 text-[11px] text-nexora-muted">
          {tr.priceIn.replace('{quote}', quote)}
          <input className="input mt-1 w-full py-2 text-sm" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0" inputMode="decimal" />
        </label>
      )}

      <label className="block mb-3 text-[11px] text-nexora-muted">
        {tr.amountIn.replace('{base}', base)}
        <input className="input mt-1 w-full py-2 text-sm" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0" inputMode="decimal" />
      </label>

      {error && <p className="mb-2 text-xs text-nexora-error">{error}</p>}

      <button
        type="button"
        disabled={loading}
        onClick={submit}
        className={`w-full rounded-lg py-2.5 text-sm font-bold transition ${loading ? 'opacity-60' : ''} ${side === 'buy' ? 'bg-nexora-neon/30 text-nexora-neon hover:bg-nexora-neon/40' : 'bg-nexora-error/30 text-nexora-error hover:bg-nexora-error/40'}`}
      >
        {loading ? tr.validating : submitLabel}
      </button>

      <p className="mt-2 text-[10px] text-nexora-muted leading-snug">{tr.fundWallet}</p>
    </div>
  );
}
