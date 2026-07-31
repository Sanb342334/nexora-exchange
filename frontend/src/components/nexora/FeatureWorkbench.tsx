'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowRightLeft,
  Calculator,
  CandlestickChart,
  LayoutDashboard,
  Bot,
  Table2,
  FormInput,
  ExternalLink,
} from 'lucide-react';
import type { ExchangeFeature } from '@/lib/exchange-types';
import { Card, Stat, Empty } from '@/components/ui';

const KIND_META: Record<
  ExchangeFeature['kind'],
  { icon: typeof Calculator; label: string; color: string }
> = {
  calc: { icon: Calculator, label: 'Калькулятор', color: 'text-nexora-accent' },
  table: { icon: Table2, label: 'Таблица / список', color: 'text-sky-400' },
  form: { icon: FormInput, label: 'Форма / действие', color: 'text-amber-400' },
  dashboard: { icon: LayoutDashboard, label: 'Дашборд', color: 'text-nexora-neon' },
  bot: { icon: Bot, label: 'Бот / стратегия', color: 'text-fuchsia-400' },
  trade: { icon: CandlestickChart, label: 'Торговый терминал', color: 'text-nexora-neon' },
  link: { icon: ExternalLink, label: 'Раздел платформы', color: 'text-nexora-muted' },
};

function demoRows(seed: string, cols: string[]) {
  return Array.from({ length: 8 }, (_, i) =>
    cols.reduce<Record<string, string>>((acc, col, ci) => {
      const n = ((seed.length * 17 + i * 31 + ci * 13) % 997) / 10;
      acc[col] =
        col.toLowerCase().includes('pair') || col.toLowerCase().includes('asset')
          ? ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'TON/USDT', 'XRP/USDT'][i % 5]
          : col.toLowerCase().includes('side')
            ? i % 2 ? 'SELL' : 'BUY'
            : col.toLowerCase().includes('status')
              ? ['OPEN', 'FILLED', 'PARTIAL', 'CANCELLED'][i % 4]
              : n.toFixed(2);
      return acc;
    }, {}),
  );
}

function CalcPanel({ feature }: { feature: ExchangeFeature }) {
  const [a, setA] = useState('1000');
  const [b, setB] = useState('2.5');
  const [c, setC] = useState('10');
  const result = useMemo(() => {
    const x = parseFloat(a) || 0;
    const y = parseFloat(b) || 0;
    const z = parseFloat(c) || 0;
    if (feature.slug.includes('liquidation')) return (x * (1 - 1 / Math.max(z, 1)) * (1 - y / 100)).toFixed(4);
    if (feature.slug.includes('fee')) return ((x * y) / 100).toFixed(4);
    if (feature.slug.includes('apr') || feature.slug.includes('apy')) return (x * (Math.pow(1 + y / 100 / 365, 365) - 1)).toFixed(4);
    if (feature.slug.includes('position')) return (x / Math.max(y, 0.0001)).toFixed(6);
    if (feature.slug.includes('funding')) return ((x * y * z) / 100 / 100).toFixed(6);
    return (x * (1 + y / 100) - z).toFixed(4);
  }, [a, b, c, feature.slug]);

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card title="Параметры">
        <div className="space-y-3">
          <Field label="Сумма / маржа" value={a} onChange={setA} />
          <Field label="Ставка / цена / %" value={b} onChange={setB} />
          <Field label="Плечо / период / доп." value={c} onChange={setC} />
        </div>
      </Card>
      <Card title="Результат">
        <div className="text-4xl font-display font-bold text-nexora-neon tabular-nums">{result}</div>
        <p className="mt-3 text-sm text-nexora-muted">
          Интерактивный расчёт для «{feature.titleRu}». Значения можно менять — результат обновляется сразу.
        </p>
        <button className="btn-primary mt-4">Сохранить пресет</button>
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input className="input mt-1" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function TablePanel({ feature }: { feature: ExchangeFeature }) {
  const cols = ['Pair', 'Side', 'Price', 'Qty', 'Status', 'PnL'];
  const rows = demoRows(feature.slug, cols);
  const [q, setQ] = useState('');
  const filtered = rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q.toLowerCase()));

  return (
    <Card noPadding>
      <div className="flex flex-wrap items-center gap-2 p-4 border-b border-white/[0.06]">
        <input
          className="input max-w-xs"
          placeholder="Поиск…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="btn-secondary text-xs">Фильтры</button>
        <button className="btn-secondary text-xs">Экспорт</button>
        <span className="ml-auto text-xs text-nexora-muted">{filtered.length} записей</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-nexora-muted border-b border-white/[0.06]">
              {cols.map((c) => (
                <th key={c} className="px-4 py-3 font-medium">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={i} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                {cols.map((c) => (
                  <td key={c} className="px-4 py-3 tabular-nums">
                    {r[c]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && <Empty text="Нет данных по фильтру" />}
    </Card>
  );
}

function FormPanel({ feature }: { feature: ExchangeFeature }) {
  return (
    <Card title={`Действие: ${feature.titleRu}`}>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="label">Актив / пара</span>
          <input className="input mt-1" defaultValue="USDT" />
        </label>
        <label className="block">
          <span className="label">Сумма</span>
          <input className="input mt-1" defaultValue="100" />
        </label>
        <label className="block sm:col-span-2">
          <span className="label">Комментарий</span>
          <textarea className="input mt-1 min-h-[90px]" defaultValue="" placeholder="Опционально" />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn-primary">Подтвердить</button>
        <button className="btn-secondary">Сохранить черновик</button>
        <button className="btn-ghost">Сбросить</button>
      </div>
    </Card>
  );
}

function DashboardPanel({ feature }: { feature: ExchangeFeature }) {
  const stats = [
    { label: 'Equity', value: '$12,480', trend: '+2.4%' },
    { label: 'Volume 24h', value: '$84.2K', trend: '+11%' },
    { label: 'Open risk', value: '18%', trend: '-3%' },
    { label: 'APY / fee', value: '4.2%', hint: feature.titleEn },
  ];
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {stats.map((s) => (
          <Stat key={s.label} {...s} />
        ))}
      </div>
      <Card title="Динамика">
        <div className="h-48 rounded-[14px] bg-gradient-to-br from-nexora-accent/20 via-transparent to-nexora-neon/10 border border-white/[0.06] flex items-end gap-1 p-4">
          {Array.from({ length: 24 }, (_, i) => (
            <div
              key={i}
              className="flex-1 rounded-t bg-nexora-accent/70"
              style={{ height: `${20 + ((feature.slug.length * 7 + i * 13) % 70)}%` }}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}

function BotPanel({ feature }: { feature: ExchangeFeature }) {
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <Card title="Конфигурация бота" className="lg:col-span-2">
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="label">Пара</span>
            <select className="select mt-1">
              <option>BTC/USDT</option>
              <option>ETH/USDT</option>
              <option>SOL/USDT</option>
            </select>
          </label>
          <label className="block">
            <span className="label">Инвестиция</span>
            <input className="input mt-1" defaultValue="500" />
          </label>
          <label className="block">
            <span className="label">Диапазон %</span>
            <input className="input mt-1" defaultValue="8" />
          </label>
          <label className="block">
            <span className="label">Сетки / DCA шаги</span>
            <input className="input mt-1" defaultValue="12" />
          </label>
        </div>
        <button className="btn-primary mt-4">Запустить {feature.titleRu}</button>
      </Card>
      <Card title="Статус">
        <div className="text-sm text-nexora-muted space-y-2">
          <div>Статус: <span className="text-nexora-neon font-semibold">Ready</span></div>
          <div>Симуляция PnL: +1.8%</div>
          <div>Риск: Medium</div>
        </div>
      </Card>
    </div>
  );
}

function TradePanel({ feature }: { feature: ExchangeFeature }) {
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <Card title="График" className="lg:col-span-2">
        <div className="h-64 rounded-[14px] border border-white/[0.06] bg-[#07090F] relative overflow-hidden">
          <div className="absolute inset-0 opacity-40 bg-[linear-gradient(180deg,transparent,rgba(123,92,255,0.15))]" />
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 160" preserveAspectRatio="none">
            <polyline
              fill="none"
              stroke="#7B5CFF"
              strokeWidth="2"
              points={Array.from({ length: 40 }, (_, i) => `${i * 10},${80 + Math.sin(i / 3 + feature.slug.length) * 40}`).join(' ')}
            />
          </svg>
          <div className="absolute top-3 left-3 text-xs text-nexora-muted">{feature.titleEn} · BTC/USDT</div>
        </div>
      </Card>
      <Card title="Ордер">
        <div className="flex gap-2 mb-3">
          <button className="btn-success flex-1 text-xs">Buy</button>
          <button className="btn-danger flex-1 text-xs">Sell</button>
        </div>
        <div className="space-y-2">
          <input className="input" placeholder="Price" defaultValue="68420" />
          <input className="input" placeholder="Amount" defaultValue="0.01" />
          <button className="btn-primary w-full">Place order</button>
        </div>
        <Link href="/trade/BTCUSDT" className="mt-3 inline-flex text-xs text-nexora-accent hover:underline items-center gap-1">
          Открыть полный терминал <ArrowRightLeft size={12} />
        </Link>
      </Card>
    </div>
  );
}

export function FeatureWorkbench({
  feature,
  categoryTitle,
}: {
  feature: ExchangeFeature;
  categoryTitle?: string;
}) {
  const meta = KIND_META[feature.kind];
  const Icon = meta.icon;

  if (feature.kind === 'link' && feature.href) {
    return (
      <Card title={feature.titleRu}>
        <p className="text-sm text-nexora-muted mb-4">
          Этот инструмент ведёт в основной раздел платформы.
        </p>
        <Link href={feature.href} className="btn-primary inline-flex">
          Перейти: {feature.titleRu}
        </Link>
      </Card>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {categoryTitle && (
            <div className="text-[11px] uppercase tracking-widest text-nexora-muted mb-1">{categoryTitle}</div>
          )}
          <h1 className="font-display text-2xl font-bold text-white">{feature.titleRu}</h1>
          <p className="text-sm text-nexora-muted mt-1">{feature.titleEn}</p>
        </div>
        <div className={`inline-flex items-center gap-2 rounded-full border border-white/[0.08] px-3 py-1.5 text-xs ${meta.color}`}>
          <Icon size={14} />
          {meta.label}
        </div>
      </div>

      {feature.kind === 'calc' && <CalcPanel feature={feature} />}
      {feature.kind === 'table' && <TablePanel feature={feature} />}
      {feature.kind === 'form' && <FormPanel feature={feature} />}
      {feature.kind === 'dashboard' && <DashboardPanel feature={feature} />}
      {feature.kind === 'bot' && <BotPanel feature={feature} />}
      {feature.kind === 'trade' && <TradePanel feature={feature} />}
    </motion.div>
  );
}
