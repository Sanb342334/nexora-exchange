'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { apiGet, apiPatch, apiPost } from '@/lib/api';
import { PageHeader, Badge, Empty, Spinner, Field } from '@/components/ui';
import { fmtFiat } from '@/lib/format';
import { RippleButton } from '@/components/nexora/RippleButton';
import { staggerContainer, staggerItem } from '@/lib/motion';
import { Clock, Search, UserCheck, ExternalLink, TrendingUp } from 'lucide-react';

const STAGES = [
  { id: 'NEW', label: 'Новый' },
  { id: 'ORDER_FOUND', label: 'Ордер найден' },
  { id: 'EXECUTING', label: 'Исполняется' },
  { id: 'PAYMENT_CONFIRMED', label: 'Оплата подтверждена' },
  { id: 'USDT_SENT', label: 'USDT отправлены' },
  { id: 'COMPLETED', label: 'Завершено' },
] as const;

type OtcStage = (typeof STAGES)[number]['id'];

interface OtcAd {
  id: string;
  side: 'BUY' | 'SELL';
  asset: string;
  fiat: string;
  price?: string | null;
  effectivePrice?: number;
  totalAmount: string;
  availableAmount: string;
  minFiat: string;
  maxFiat: string;
  city?: string | null;
  bankName?: string | null;
  otcStage: OtcStage;
  takenAt?: string | null;
  externalOrderUrl?: string | null;
  externalBuyPrice?: string | null;
  externalSellPrice?: string | null;
  expectedProfit?: string | null;
  user: { id: string; username: string; displayName?: string | null; telegram?: string | null };
  assignedOperator?: { id: string; displayName?: string | null; username: string } | null;
}

interface OtcDeal {
  id: string;
  code: string;
  status: string;
  fiatAmount: string;
  fiat: string;
  price: string;
  assetAmount: string;
  otcStage: OtcStage;
  externalOrderUrl?: string | null;
  externalBuyPrice?: string | null;
  externalSellPrice?: string | null;
  expectedProfit?: string | null;
  buyer: { username: string; displayName?: string | null };
  seller: { username: string; displayName?: string | null };
  assignedOperator?: { displayName?: string | null; username: string } | null;
}

function stageIndex(stage: OtcStage) {
  return STAGES.findIndex((s) => s.id === stage);
}

function MarginPanel({
  type,
  id,
  buyPrice,
  sellPrice,
  orderUrl,
  onSaved,
}: {
  type: 'ads' | 'deals';
  id: string;
  buyPrice?: string | null;
  sellPrice?: string | null;
  orderUrl?: string | null;
  onSaved: () => void;
}) {
  const [buy, setBuy] = useState(buyPrice ?? '');
  const [sell, setSell] = useState(sellPrice ?? '');
  const [url, setUrl] = useState(orderUrl ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setBuy(buyPrice ?? '');
    setSell(sellPrice ?? '');
    setUrl(orderUrl ?? '');
  }, [buyPrice, sellPrice, orderUrl]);

  const profit =
    buy && sell ? (parseFloat(sell) - parseFloat(buy)).toFixed(2) : null;

  const save = async () => {
    setSaving(true);
    try {
      await apiPatch(`/admin/otc/${type}/${id}/margin`, {
        externalBuyPrice: buy ? parseFloat(buy) : undefined,
        externalSellPrice: sell ? parseFloat(sell) : undefined,
        externalOrderUrl: url || undefined,
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 space-y-2 rounded-[14px] border border-white/[0.06] bg-[#0E0E1A]/60 p-3">
      <div className="flex items-center gap-2 text-xs font-bold text-nexora-accent">
        <TrendingUp size={13} /> Калькулятор маржи (Bybit)
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Цена покупки (Bybit)">
          <input className="input py-2 text-sm" value={buy} onChange={(e) => setBuy(e.target.value)} placeholder="470" />
        </Field>
        <Field label="Цена клиента">
          <input className="input py-2 text-sm" value={sell} onChange={(e) => setSell(e.target.value)} placeholder="480" />
        </Field>
      </div>
      <Field label="Ссылка на ордер Bybit">
        <input className="input py-2 text-sm" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
      </Field>
      {profit && (
        <div className="text-sm font-bold text-[#4CAF50]">
          Маржа: {fmtFiat(profit)} за 1 USDT
        </div>
      )}
      <RippleButton variant="outline" onClick={save} disabled={saving} className="w-full text-xs">
        {saving ? 'Сохранение...' : 'Сохранить параметры'}
      </RippleButton>
    </div>
  );
}

export default function AdminQueuePage() {
  const [userAds, setUserAds] = useState<OtcAd[]>([]);
  const [activeDeals, setActiveDeals] = useState<OtcDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedAd, setExpandedAd] = useState<string | null>(null);
  const [expandedDeal, setExpandedDeal] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await apiGet<{ userAds: OtcAd[]; activeDeals: OtcDeal[] }>('/admin/otc/queue');
    setUserAds(data.userAds);
    setActiveDeals(data.activeDeals);
    setLoading(false);
  }, []);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load]);

  const takeAd = async (id: string) => {
    await apiPost(`/admin/otc/ads/${id}/take`);
    await load();
    setExpandedAd(id);
  };

  const takeDeal = async (id: string) => {
    await apiPost(`/admin/otc/deals/${id}/take`);
    await load();
    setExpandedDeal(id);
  };

  const setAdStage = async (id: string, stage: OtcStage) => {
    await apiPatch(`/admin/otc/ads/${id}/stage`, { stage });
    await load();
  };

  const setDealStage = async (id: string, stage: OtcStage) => {
    await apiPatch(`/admin/otc/deals/${id}/stage`, { stage });
    await load();
  };

  const filtered = userAds.filter(
    (a) =>
      !search ||
      a.user.username.includes(search) ||
      (a.user.displayName ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="OTC Очередь"
        subtitle="Заявки клиентов → Bybit → исполнение → маржа оператора"
        action={
          <div className="flex items-center gap-2 rounded-[12px] border border-white/[0.08] bg-[#0E0E1A] px-3 py-2">
            <Search size={14} className="text-nexora-muted" />
            <input
              className="bg-transparent text-sm outline-none w-40 placeholder-nexora-muted"
              placeholder="Поиск клиента..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        }
      />

      <div className="mb-6 rounded-[18px] border border-white/[0.07] bg-nexora-card p-4 overflow-x-auto">
        <div className="text-xs font-bold uppercase tracking-wider text-nexora-muted mb-3">Этапы OTC-сделки</div>
        <div className="flex items-center gap-1 min-w-max">
          {STAGES.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1">
              <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${i === 0 ? 'bg-nexora-accent/20 text-nexora-accent' : 'bg-white/[0.04] text-nexora-muted'}`}>
                {s.label}
              </span>
              {i < STAGES.length - 1 && <span className="text-nexora-muted">→</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="rounded-[18px] border border-white/[0.07] bg-nexora-card overflow-hidden">
          <div className="p-4 border-b border-white/[0.07] flex items-center justify-between">
            <h3 className="font-display font-bold text-white">Заявки клиентов</h3>
            <Badge className="bg-nexora-accent/15 text-nexora-accent">{filtered.length}</Badge>
          </div>
          {filtered.length === 0 ? (
            <Empty text="Нет заявок" />
          ) : (
            <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="divide-y divide-white/[0.05]">
              {filtered.map((ad) => {
                const price = ad.effectivePrice ?? (ad.price ? parseFloat(ad.price) : 0);
                const stage = stageIndex(ad.otcStage);
                const open = expandedAd === ad.id;
                return (
                  <motion.div key={ad.id} variants={staggerItem} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-white">{ad.user.displayName ?? ad.user.username}</div>
                        <div className="text-xs text-nexora-muted mt-0.5">
                          {ad.side === 'BUY' ? 'Покупка' : 'Продажа'} USDT · {fmtFiat(price)} {ad.fiat}
                        </div>
                        <div className="text-xs text-nexora-muted">
                          Объём: {fmtFiat(ad.totalAmount)} · {ad.city ?? '—'} · {ad.bankName ?? '—'}
                        </div>
                        {ad.user.telegram && (
                          <div className="text-[11px] text-nexora-accent mt-1">TG: {ad.user.telegram}</div>
                        )}
                        <div className="flex items-center gap-1 mt-1 text-[11px] text-orange-400">
                          <Clock size={11} /> {ad.assignedOperator ? `Оператор: ${ad.assignedOperator.displayName ?? ad.assignedOperator.username}` : 'Ожидает оператора'}
                        </div>
                      </div>
                      {!ad.assignedOperator ? (
                        <RippleButton variant="primary" onClick={() => takeAd(ad.id)}>
                          <UserCheck size={14} className="inline mr-1" />
                          Взять заявку
                        </RippleButton>
                      ) : (
                        <Badge className="bg-[#4CAF50]/15 text-[#4CAF50]">В работе</Badge>
                      )}
                    </div>
                    <div className="mt-3 flex gap-1">
                      {STAGES.map((s, i) => (
                        <button
                          key={s.id}
                          title={s.label}
                          onClick={() => ad.assignedOperator && setAdStage(ad.id, s.id)}
                          className={`h-1.5 flex-1 rounded-full transition ${i <= stage ? 'bg-nexora-accent' : 'bg-white/[0.08] hover:bg-white/[0.15]'}`}
                        />
                      ))}
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-[10px] text-nexora-muted">{STAGES[stage]?.label}</span>
                      <button className="text-[11px] text-nexora-accent" onClick={() => setExpandedAd(open ? null : ad.id)}>
                        {open ? 'Свернуть' : 'Маржа / Bybit'}
                      </button>
                    </div>
                    {open && (
                      <MarginPanel
                        type="ads"
                        id={ad.id}
                        buyPrice={ad.externalBuyPrice}
                        sellPrice={ad.externalSellPrice ?? String(price)}
                        orderUrl={ad.externalOrderUrl}
                        onSaved={load}
                      />
                    )}
                    {ad.externalOrderUrl && (
                      <a href={ad.externalOrderUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-nexora-accent hover:underline">
                        <ExternalLink size={12} /> Bybit ордер
                      </a>
                    )}
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </div>

        <div className="rounded-[18px] border border-white/[0.07] bg-nexora-card overflow-hidden">
          <div className="p-4 border-b border-white/[0.07]">
            <h3 className="font-display font-bold text-white">Активные сделки</h3>
          </div>
          {activeDeals.length === 0 ? (
            <Empty text="Нет активных сделок" />
          ) : (
            <div className="divide-y divide-white/[0.05]">
              {activeDeals.map((d) => {
                const stage = stageIndex(d.otcStage);
                const open = expandedDeal === d.id;
                return (
                  <div key={d.id} className="p-4">
                    <div className="flex justify-between items-start mb-2 gap-3">
                      <div>
                        <span className="font-mono text-sm font-bold text-nexora-accent">{d.code}</span>
                        <div className="text-xs text-nexora-muted mt-0.5">
                          {d.buyer.displayName ?? d.buyer.username} ↔ {d.seller.displayName ?? d.seller.username}
                        </div>
                        <div className="text-xs text-nexora-muted">{d.status}</div>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-bold text-white">{fmtFiat(d.fiatAmount)} {d.fiat}</span>
                        {!d.assignedOperator && (
                          <div className="mt-2">
                            <RippleButton variant="outline" onClick={() => takeDeal(d.id)}>
                              Взять
                            </RippleButton>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {STAGES.map((s, i) => (
                        <button
                          key={s.id}
                          onClick={() => d.assignedOperator && setDealStage(d.id, s.id)}
                          className={`h-1.5 flex-1 rounded-full ${i <= stage ? 'bg-nexora-accent' : 'bg-white/[0.08]'}`}
                          title={s.label}
                        />
                      ))}
                    </div>
                    <button className="mt-2 text-[11px] text-nexora-accent" onClick={() => setExpandedDeal(open ? null : d.id)}>
                      {open ? 'Свернуть' : 'Маржа / Bybit'}
                    </button>
                    {open && (
                      <MarginPanel
                        type="deals"
                        id={d.id}
                        buyPrice={d.externalBuyPrice}
                        sellPrice={d.externalSellPrice ?? d.price}
                        orderUrl={d.externalOrderUrl}
                        onSaved={load}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
