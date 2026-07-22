'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Plus, ArrowDownToLine, ArrowUpFromLine, History, TrendingUp, ShieldCheck, Lock, Headphones } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { fmtFiat } from '@/lib/format';
import { staggerContainer, staggerItem } from '@/lib/motion';

const quickActions = [
  { href: '/ads', icon: Plus, label: 'Создать объявление' },
  { href: '/wallet', icon: ArrowDownToLine, label: 'Пополнить кошелёк' },
  { href: '/wallet', icon: ArrowUpFromLine, label: 'Вывести средства' },
  { href: '/deals', icon: History, label: 'История сделок' },
];

const securityItems = [
  { icon: ShieldCheck, text: 'Эскроу-система' },
  { icon: ShieldCheck, text: 'Проверенные пользователи' },
  { icon: Lock, text: 'Шифрование данных' },
  { icon: Headphones, text: '24/7 поддержка' },
];

export function MarketRightPanel() {
  const [market, setMarket] = useState<{ price: number } | null>(null);

  useEffect(() => {
    apiGet<{ price: number }>('/rates/market').then(setMarket).catch(() => {});
  }, []);

  const rates = [
    { label: 'BTC / USDT', price: '67,842', change: '+2.4%', up: true },
    { label: 'ETH / USDT', price: '3,521', change: '+1.8%', up: true },
    { label: 'USDT / KZT', price: market ? fmtFiat(market.price) : '499.80', change: '+0.3%', up: true },
    { label: 'BNB / USDT', price: '612', change: '+0.9%', up: true },
    { label: 'SOL / USDT', price: '178', change: '-0.4%', up: false },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-[16px] border border-white/[0.06] bg-[#10131C] p-4">
        <h3 className="font-display text-sm font-bold text-white mb-3">Быстрые действия</h3>
        <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-1.5">
          {quickActions.map(({ href, icon: Icon, label }) => (
            <motion.div key={label} variants={staggerItem}>
              <Link
                href={href}
                className="flex items-center gap-3 rounded-[10px] px-2 py-2.5 text-sm text-nexora-text hover:bg-white/[0.04] transition active:scale-[0.98]"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-nexora-accent/15 text-nexora-accent">
                  <Icon size={16} />
                </div>
                {label}
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </div>

      <div className="rounded-[16px] border border-white/[0.06] bg-[#10131C] p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={15} className="text-nexora-neon" />
          <h3 className="font-display text-sm font-bold text-white">Курсы криптовалют</h3>
        </div>
        <div className="space-y-3">
          {rates.map((r) => (
            <div key={r.label} className="flex items-center justify-between">
              <span className="text-xs text-nexora-muted">{r.label}</span>
              <div className="text-right">
                <div className="text-sm font-bold text-white tabular-nums">{r.price}</div>
                <div className={`text-[10px] font-semibold ${r.up ? 'text-nexora-neon' : 'text-nexora-error'}`}>
                  {r.change}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="relative overflow-hidden rounded-[16px] border border-white/[0.06] bg-[#10131C] p-4">
        <div className="flex gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-sm font-bold text-white leading-snug">
              Безопасность на первом месте
            </h3>
            <ul className="mt-3 space-y-2.5">
              {securityItems.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-2.5 text-[12px] text-nexora-muted">
                  <Icon size={14} className="text-nexora-accent/80 shrink-0" />
                  {text}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative w-[88px] h-[100px] shrink-0 -mr-1">
            <Image
              src="/assets/nexora-shield-3d.png"
              alt="Security"
              fill
              className="object-contain object-bottom drop-shadow-[0_0_20px_rgba(123,97,255,0.4)]"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
