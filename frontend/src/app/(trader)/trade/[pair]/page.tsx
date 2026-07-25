'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { TradingViewWidget } from '@/components/trade/TradingViewWidget';
import { OrderBookPanel } from '@/components/trade/OrderBookPanel';
import { TradeFormPanel } from '@/components/trade/TradeFormPanel';
import { PositionsPanel } from '@/components/trade/PositionsPanel';
import { useLocale } from '@/lib/i18n/locale-context';
import { apiGet } from '@/lib/api';
import { useFormat } from '@/lib/use-format';

const TV_MAP: Record<string, string> = {
  BTC_USDT: 'BINANCE:BTCUSDT',
  ETH_USDT: 'BINANCE:ETHUSDT',
  SOL_USDT: 'BINANCE:SOLUSDT',
  XRP_USDT: 'BINANCE:XRPUSDT',
  BNB_USDT: 'BINANCE:BNBUSDT',
  ADA_USDT: 'BINANCE:ADAUSDT',
  DOGE_USDT: 'BINANCE:DOGEUSDT',
  TON_USDT: 'BINANCE:TONUSDT',
};

type PairStats = { lastPrice: number; change24h: string; base: string; quote: string; symbol?: string };

export default function TradePairPage() {
  const params = useParams<{ pair: string }>();
  const searchParams = useSearchParams();
  const { t } = useLocale();
  const tr = t.app.trade;
  const { fmtNum } = useFormat();
  const pair = (params.pair ?? 'BTC_USDT').toUpperCase();
  const [base, quote] = pair.split('_');
  const mode = searchParams.get('type') === 'futures' ? 'futures' : 'spot';
  const symbol = `${base}${quote}`;
  const tvSymbol = mode === 'futures'
    ? (TV_MAP[pair]?.replace('BINANCE:', 'BINANCE:') ? `BINANCE:${base}USDT.P` : `BINANCE:${base}USDT.P`)
    : (TV_MAP[pair] ?? `BINANCE:${symbol}`);
  const [stats, setStats] = useState<PairStats | null>(null);
  const [mobileTab, setMobileTab] = useState<'chart' | 'book' | 'trade'>('chart');
  const [positionsRefresh, setPositionsRefresh] = useState(0);

  useEffect(() => {
    const type = mode === 'futures' ? 'futures' : 'spot';
    apiGet<PairStats[]>(`/trading/pairs?type=${type}`)
      .then((pairs) => {
        const found = pairs.find((p) => `${p.base}_${p.quote}` === pair || p.symbol === symbol);
        if (found) setStats(found);
      })
      .catch(() => {});
  }, [pair, symbol, mode]);

  if (!base || !quote || !/^[A-Z0-9]{2,10}$/.test(base) || !/^[A-Z0-9]{2,10}$/.test(quote)) {
    return <div className="p-6 text-nexora-error">{tr.invalidPair}</div>;
  }

  const ch = stats ? parseFloat(stats.change24h) : 0;
  const up = ch >= 0;

  return (
    <div className="space-y-3 max-w-[1920px] mx-auto w-full pb-4">
      <div className="flex flex-wrap items-center gap-3 border-b border-nexora-border pb-2">
        <h1 className="font-display text-xl font-bold text-white">
          {base}<span className="text-nexora-muted">/{quote}</span>
          {mode === 'futures' && <span className="ml-2 text-xs font-semibold text-nexora-accent">PERP</span>}
        </h1>
        {stats && (
          <div className="flex flex-wrap items-center gap-3 text-xs tabular-nums">
            <span className="text-lg font-bold text-white">{fmtNum(stats.lastPrice)}</span>
            <span className={up ? 'text-nexora-neon' : 'text-nexora-error'}>{up ? '+' : ''}{stats.change24h}%</span>
          </div>
        )}
        <div className="flex gap-1 rounded-lg border border-nexora-border p-0.5 text-xs">
          <Link href={`/trade/${pair}?type=spot`} className={`rounded-md px-3 py-1.5 font-semibold ${mode === 'spot' ? 'bg-nexora-accent/20 text-nexora-accent' : 'text-nexora-muted'}`}>{tr.spot}</Link>
          <Link href={`/trade/${pair}?type=futures`} className={`rounded-md px-3 py-1.5 font-semibold ${mode === 'futures' ? 'bg-nexora-accent/20 text-nexora-accent' : 'text-nexora-muted'}`}>{tr.futures}</Link>
        </div>
        <Link href="/market" className="ml-auto text-xs text-nexora-accent hover:underline">{tr.p2pMarketLink}</Link>
      </div>

      <div className="xl:hidden flex gap-1 rounded-lg border border-nexora-border p-0.5 text-xs">
        {(['chart', 'book', 'trade'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setMobileTab(tab)}
            className={`flex-1 rounded-md py-2 font-semibold ${mobileTab === tab ? 'bg-nexora-accent/20 text-nexora-accent' : 'text-nexora-muted'}`}
          >
            {tab === 'chart' ? tr.chartLink.replace(' →', '') : tab === 'book' ? tr.orderBook : tr.trade}
          </button>
        ))}
      </div>

      <div className="grid gap-3 xl:grid-cols-[1fr_280px_260px]">
        <div className={`min-w-0 ${mobileTab !== 'chart' ? 'hidden xl:block' : ''}`}>
          <TradingViewWidget symbol={tvSymbol} height="min(560px, calc(100dvh - 240px))" />
          {mode === 'futures' && (
            <div className="mt-3 hidden xl:block">
              <PositionsPanel symbol={symbol} refreshKey={positionsRefresh} />
            </div>
          )}
        </div>
        <div className={mobileTab !== 'book' ? 'hidden xl:block' : ''}>
          <OrderBookPanel symbol={symbol} />
        </div>
        <div className={mobileTab !== 'trade' ? 'hidden xl:block' : ''}>
          <TradeFormPanel
            base={base}
            quote={quote}
            symbol={symbol}
            mode={mode}
            onFuturesOpened={() => setPositionsRefresh((k) => k + 1)}
          />
          {mode === 'futures' && (
            <div className="mt-3 xl:hidden">
              <PositionsPanel symbol={symbol} refreshKey={positionsRefresh} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
