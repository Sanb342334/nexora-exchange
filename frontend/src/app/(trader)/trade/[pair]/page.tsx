'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { BinaryTradeTerminal } from '@/components/trade/BinaryTradeTerminal';

export default function TradePairPage() {
  const params = useParams<{ pair: string }>();
  const pair = (params.pair ?? 'BTC_USDT').toUpperCase();
  const parts = pair.split('_');
  const base = parts[0] ?? 'BTC';
  const quote = parts[1] ?? 'USDT';
  const symbol = `${base}${quote}`;

  if (!base || !quote || !/^[A-Z0-9]{2,10}$/.test(base) || !/^[A-Z0-9]{2,10}$/.test(quote)) {
    return <div className="p-6 text-nexora-error">Неверная пара</div>;
  }

  return (
    <div className="space-y-3 max-w-[1920px] mx-auto w-full pb-4">
      <div className="flex flex-wrap items-center gap-3 border-b border-nexora-border pb-2">
        <Link href="/trade" className="text-xs text-nexora-muted hover:text-white">
          ← Рынки
        </Link>
        <h1 className="font-display text-xl font-bold text-white">
          {base}
          <span className="text-nexora-muted">/{quote}</span>
        </h1>
        <span className="ml-auto text-[10px] uppercase tracking-wide text-nexora-accent font-bold">
          Futures · TP/SL · плечо
        </span>
      </div>
      <BinaryTradeTerminal pairId={symbol} base={base} quote={quote} />
    </div>
  );
}
