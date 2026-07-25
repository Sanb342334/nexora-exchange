'use client';

import { TradeHeroBanner } from '@/components/trade/TradeHeroBanner';
import { MarketsTable } from '@/components/trade/MarketsTable';

export default function TradeHomePage() {
  return (
    <div className="space-y-5 max-w-[1600px] mx-auto w-full pb-4">
      <TradeHeroBanner />
      <MarketsTable />
    </div>
  );
}
