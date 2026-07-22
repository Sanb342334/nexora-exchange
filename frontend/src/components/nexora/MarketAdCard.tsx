'use client';

import { Star } from 'lucide-react';
import { fmtCrypto, fmtFiat } from '@/lib/format';
import type { Advertisement } from '@/lib/types';
import { TraderRow } from './TraderAvatar';
import { PaymentMethodRow } from './PaymentMethodIcon';

interface MarketAdCardProps {
  ad: Advertisement;
  tab: 'buy' | 'sell';
  isFavorite: boolean;
  onFavorite: () => void;
  onTrade: () => void;
}

export function MarketAdCard({ ad, tab, isFavorite, onFavorite, onTrade }: MarketAdCardProps) {
  return (
    <article className="rounded-[14px] border border-white/[0.06] bg-[#0B0E14] p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <TraderRow
          name={ad.user.displayName ?? ad.user.username}
          trustScore={ad.user.trustScore}
          completedDeals={ad.user.completedDeals}
        />
        <button type="button" onClick={onFavorite} className="shrink-0 p-1">
          <Star
            size={18}
            className={isFavorite ? 'fill-nexora-accent text-nexora-accent' : 'text-nexora-muted'}
          />
        </button>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-nexora-muted mb-0.5">Цена</div>
          <div className="price-neon text-2xl tabular-nums">{fmtFiat(ad.effectivePrice)}</div>
          <div className="text-[11px] text-nexora-muted">{ad.fiat}/USDT</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-nexora-muted mb-0.5">Доступно</div>
          <div className="font-semibold text-white tabular-nums text-sm">
            {fmtCrypto(parseFloat(ad.availableAmount) / ad.effectivePrice)} {ad.asset}
          </div>
          <div className="text-[11px] text-nexora-muted tabular-nums">
            {fmtFiat(ad.minFiat)} – {fmtFiat(ad.maxFiat)}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-white/[0.05]">
        <PaymentMethodRow methods={ad.paymentMethods} />
        <button
          type="button"
          className={tab === 'buy' ? 'btn-buy-neon px-5 py-2 text-sm' : 'btn-danger text-sm px-5 py-2 rounded-[8px]'}
          onClick={onTrade}
        >
          {tab === 'buy' ? 'Купить' : 'Продать'}
        </button>
      </div>
    </article>
  );
}
