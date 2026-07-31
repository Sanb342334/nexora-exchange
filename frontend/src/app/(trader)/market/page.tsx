'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ChevronDown, Star } from 'lucide-react';
import { apiGet, apiPost, ApiError } from '@/lib/api';
import { useSocketEvent } from '@/lib/socket';
import { Card, Empty } from '@/components/ui';
import { useFormat } from '@/lib/use-format';
import { staggerContainer, tableRow } from '@/lib/motion';
import type { Advertisement, PaymentMethod } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { useLocale } from '@/lib/i18n/locale-context';
import { HeroBanner } from '@/components/nexora/HeroBanner';
import { StatsBar } from '@/components/nexora/StatsBar';
import { TableSkeleton, StatsSkeleton } from '@/components/nexora/Skeletons';
import { PaymentMethodRow } from '@/components/nexora/PaymentMethodIcon';
import { TraderRow } from '@/components/nexora/TraderAvatar';
import { MarketFilters } from '@/components/nexora/MarketFilters';
import { TradeModal } from '@/components/nexora/TradeModal';
import { MarketAdCard } from '@/components/nexora/MarketAdCard';
import { MobileMarketPanel } from '@/components/nexora/MobileMarketPanel';
import { useToast } from '@/components/nexora/ToastProvider';

const FAV_KEY = 'nexora_favorites';

function loadFavorites(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

function saveFavorites(ids: Set<string>) {
  localStorage.setItem(FAV_KEY, JSON.stringify([...ids]));
}

export default function MarketPage() {
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const { t } = useLocale();
  const { fmtCrypto, fmtFiat } = useFormat();
  const allPaymentsLabel = t.app.market.allPayments;
  const [tab, setTab] = useState<'buy' | 'sell'>('buy');
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Advertisement | null>(null);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [amount, setAmount] = useState('50000');
  const [fiat, setFiat] = useState(user?.preferredFiat || 'KZT');
  const [payment, setPayment] = useState(allPaymentsLabel);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'price' | 'rating'>('price');
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState('');

  useEffect(() => setFavorites(loadFavorites()), []);

  useEffect(() => {
    if (user?.preferredFiat) setFiat(user.preferredFiat);
  }, [user?.preferredFiat]);

  useEffect(() => {
    setPayment(allPaymentsLabel);
  }, [allPaymentsLabel]);

  const paymentOptions = useMemo(() => {
    const names = new Set<string>();
    for (const m of methods) {
      if (m.bankName) names.add(m.bankName);
      else if (m.type) names.add(m.type);
    }
    for (const ad of ads) {
      for (const pm of ad.paymentMethods ?? []) {
        if (pm.paymentMethod.bankName) names.add(pm.paymentMethod.bankName);
        else if (pm.paymentMethod.type) names.add(pm.paymentMethod.type);
      }
    }
    return [allPaymentsLabel, ...[...names].sort()];
  }, [methods, ads, allPaymentsLabel]);

  const load = async () => {
    setLoading(true);
    const side = tab === 'buy' ? 'SELL' : 'BUY';
    const data = await apiGet<Advertisement[]>(
      `/advertisements?side=${side}&status=ACTIVE&fiat=${encodeURIComponent(fiat)}`,
    );
    setAds(data);
    setLoading(false);
  };

  useEffect(() => {
    load().catch(() => setLoading(false));
    apiGet<PaymentMethod[]>('/payment-methods').then(setMethods).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, fiat]);

  useSocketEvent('orderbook:update', () => load());

  const filtered = useMemo(() => {
    const amt = parseFloat(amount.replace(/\s/g, '')) || 0;
    let list = ads.filter((ad) => {
      if (amt > 0 && (amt < parseFloat(String(ad.minFiat)) || amt > parseFloat(String(ad.maxFiat)))) return false;
      if (payment !== allPaymentsLabel) {
        const match = ad.paymentMethods.some(
          (m) =>
            m.paymentMethod.type?.toLowerCase().includes(payment.toLowerCase()) ||
            m.paymentMethod.bankName?.toLowerCase().includes(payment.toLowerCase()),
        );
        if (!match) return false;
      }
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sortBy === 'rating') return (b.user.trustScore ?? 0) - (a.user.trustScore ?? 0);
      return tab === 'buy' ? a.effectivePrice - b.effectivePrice : b.effectivePrice - a.effectivePrice;
    });
    const fav = list.filter((a) => favorites.has(a.id));
    const rest = list.filter((a) => !favorites.has(a.id));
    return [...fav, ...rest];
  }, [ads, amount, payment, sortBy, tab, favorites, allPaymentsLabel]);

  const toggleFav = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        toast('info', 'Удалено из избранного');
      } else {
        next.add(id);
        toast('success', 'Добавлено в избранное');
      }
      saveFavorites(next);
      return next;
    });
  };

  const handleTrade = async (fiatAmount: number, paymentMethodId?: string) => {
    if (!selected) return;
    setModalError('');
    setModalLoading(true);
    try {
      const deal = await apiPost<{ id: string }>('/deals', {
        advertisementId: selected.id,
        fiatAmount,
        paymentMethodId: paymentMethodId || undefined,
      });
      toast('success', 'Сделка создана');
      router.push(`/deals/${deal.id}`);
    } catch (err) {
      setModalError(err instanceof ApiError ? err.message : 'Ошибка');
    } finally {
      setModalLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="page-market space-y-4 sm:space-y-5 pb-4 max-w-[1600px] mx-auto w-full">
      <HeroBanner />
      {loading ? <StatsSkeleton /> : <StatsBar />}
      <MobileMarketPanel />

      <Card noPadding className="overflow-hidden border-white/[0.06] bg-[#10131C]">
        <MarketFilters
          tab={tab}
          onTab={setTab}
          amount={amount}
          onAmount={setAmount}
          fiat={fiat}
          onFiat={setFiat}
          payment={payment}
          onPayment={setPayment}
          paymentOptions={paymentOptions}
        />

        <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.04] bg-[#0B0E14]/50">
          <span className="text-[11px] text-nexora-muted">
            {loading ? 'Загрузка...' : `${filtered.length} объявлений`}
          </span>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-nexora-muted">Сортировка:</span>
            <button
              type="button"
              onClick={() => setSortBy('price')}
              className={sortBy === 'price' ? 'text-nexora-neon font-semibold' : 'text-nexora-muted hover:text-white'}
            >
              По цене
            </button>
            <span className="text-white/20">|</span>
            <button
              type="button"
              onClick={() => setSortBy('rating')}
              className={sortBy === 'rating' ? 'text-nexora-neon font-semibold' : 'text-nexora-muted hover:text-white'}
            >
              По рейтингу
            </button>
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={6} />
        ) : filtered.length === 0 ? (
          <Empty text="Нет объявлений по выбранным фильтрам" />
        ) : (
          <>
            {/* Mobile: card list like Binance P2P */}
            <div className="lg:hidden p-3 space-y-3">
              {filtered.map((ad) => (
                <MarketAdCard
                  key={ad.id}
                  ad={ad}
                  tab={tab}
                  isFavorite={favorites.has(ad.id)}
                  onFavorite={() => toggleFav(ad.id)}
                  onTrade={() => setSelected(ad)}
                />
              ))}
            </div>

            {/* Desktop: table like mockup */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full market-table">
              <thead className="sticky top-0 z-10 bg-[#10131C]">
                <tr>
                  <th className="th w-8" />
                  <th className="th">Рекламодатель</th>
                  <th className="th">Цена</th>
                  <th className="th">Доступно / Лимиты</th>
                  <th className="th">Способ оплаты</th>
                  <th className="th text-right pr-6">Действие</th>
                </tr>
              </thead>
              <motion.tbody variants={staggerContainer} initial="hidden" animate="visible">
                {filtered.map((ad) => (
                  <motion.tr
                    key={ad.id}
                    variants={tableRow}
                    className="market-row group"
                  >
                    <td className="td w-8 pl-4">
                      <button
                        type="button"
                        onClick={(e) => toggleFav(ad.id, e)}
                        className="opacity-40 group-hover:opacity-100 transition"
                      >
                        <Star
                          size={16}
                          className={favorites.has(ad.id) ? 'fill-nexora-accent text-nexora-accent' : 'text-nexora-muted'}
                        />
                      </button>
                    </td>
                    <td className="td">
                      <TraderRow
                        name={ad.user.displayName ?? ad.user.username}
                        trustScore={ad.user.trustScore}
                        completedDeals={ad.user.completedDeals}
                      />
                    </td>
                    <td className="td">
                      <div className="price-neon text-xl tabular-nums">{fmtFiat(ad.effectivePrice)}</div>
                      <div className="text-[11px] text-nexora-muted mt-0.5">{ad.fiat}/USDT</div>
                    </td>
                    <td className="td">
                      <div className="font-semibold text-white tabular-nums">
                        {fmtCrypto(parseFloat(ad.availableAmount) / ad.effectivePrice)} {ad.asset}
                      </div>
                      <div className="text-[11px] text-nexora-muted mt-0.5 tabular-nums">
                        {fmtFiat(ad.minFiat)} – {fmtFiat(ad.maxFiat)} {ad.fiat}
                      </div>
                    </td>
                    <td className="td">
                      <PaymentMethodRow methods={ad.paymentMethods} />
                    </td>
                    <td className="td text-right pr-6">
                      <button
                        type="button"
                        className={tab === 'buy' ? 'btn-buy-neon' : 'btn-danger text-sm px-6 py-2.5 rounded-[8px]'}
                        onClick={() => setSelected(ad)}
                      >
                        {tab === 'buy' ? 'Купить USDT' : 'Продать USDT'}
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </motion.tbody>
            </table>
            </div>
          </>
        )}

        {!loading && filtered.length > 0 && (
          <div className="p-4 text-center border-t border-white/[0.07]">
            <button type="button" className="btn-ghost text-sm gap-1">
              Показать ещё объявления <ChevronDown size={14} />
            </button>
          </div>
        )}
      </Card>

      {selected && (
        <TradeModal
          ad={selected}
          methods={methods}
          tab={tab}
          open={!!selected}
          onClose={() => {
            setSelected(null);
            setModalError('');
          }}
          onSubmit={handleTrade}
          loading={modalLoading}
          error={modalError}
        />
      )}
    </motion.div>
  );
}
