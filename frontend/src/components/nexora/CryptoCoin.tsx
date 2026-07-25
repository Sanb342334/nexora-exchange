'use client';

import { motion } from 'framer-motion';

const presets = {
  btc: {
    label: '₿',
    ring: 'from-[#F7931A] via-[#FFB347] to-[#C56A00]',
    face: 'bg-gradient-to-br from-[#FFB84D] via-[#F7931A] to-[#D97706]',
    glow: 'rgba(247,147,26,0.45)',
  },
  eth: {
    label: 'Ξ',
    ring: 'from-[#627EEA] via-[#8B9FFF] to-[#4B5FD6]',
    face: 'bg-gradient-to-br from-[#8B9FFF] via-[#627EEA] to-[#3D51B8]',
    glow: 'rgba(98,126,234,0.45)',
  },
  usdt: {
    label: '₮',
    ring: 'from-[#26A17B] via-[#50D890] to-[#1A8F5F]',
    face: 'bg-gradient-to-br from-[#50D890] via-[#26A17B] to-[#15803D]',
    glow: 'rgba(38,161,123,0.45)',
  },
  nexora: {
    label: 'N',
    ring: 'from-[#7B61FF] via-[#9D8AFF] to-[#6F3DFF]',
    face: 'bg-gradient-to-br from-[#1a1528] via-[#12101c] to-[#0b0e14]',
    glow: 'rgba(123,97,255,0.65)',
  },
  bnb: {
    label: 'B',
    ring: 'from-[#F3BA2F] via-[#FCD535] to-[#D4A017]',
    face: 'bg-gradient-to-br from-[#FCD535] via-[#F3BA2F] to-[#CA8A04]',
    glow: 'rgba(243,186,47,0.45)',
  },
} as const;

type CoinKind = keyof typeof presets;

export function CryptoCoin({
  kind,
  size = 56,
  className = '',
  hero = false,
}: {
  kind: CoinKind;
  size?: number;
  className?: string;
  hero?: boolean;
}) {
  const p = presets[kind];
  const ringPad = hero ? 'p-[4px]' : 'p-[3px]';
  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      <div
        className={`absolute inset-0 rounded-full blur-md ${hero ? 'opacity-90 blur-lg' : 'opacity-70'}`}
        style={{ background: p.glow, transform: `scale(${hero ? 1.35 : 1.15})` }}
      />
      <div
        className={`absolute inset-0 rounded-full bg-gradient-to-br ${p.ring} ${ringPad} ${
          hero
            ? kind === 'nexora'
              ? 'shadow-[0_0_40px_rgba(123,97,255,0.55),0_0_80px_rgba(123,97,255,0.25)]'
              : 'shadow-[0_0_30px_rgba(247,147,26,0.5)]'
            : 'shadow-lg'
        }`}
        style={{ transformStyle: 'preserve-3d' }}
      >
        <div
          className={`flex h-full w-full items-center justify-center rounded-full ${p.face} border ${
            hero && kind === 'nexora'
              ? 'border-nexora-accent/50'
              : hero
                ? 'border-amber-200/40'
                : 'border-white/20'
          }`}
        >
          <span
            className={`font-display font-black drop-shadow-md ${
              hero && kind === 'nexora'
                ? 'text-transparent bg-clip-text bg-gradient-to-b from-[#E8E0FF] to-[#7B61FF]'
                : hero && kind === 'btc'
                  ? 'text-amber-50'
                  : 'text-white'
            }`}
            style={{ fontSize: size * (hero ? 0.44 : 0.38) }}
          >
            {p.label}
          </span>
        </div>
      </div>
      <div className={`absolute inset-x-[15%] top-[6%] rounded-full bg-white/30 blur-[2px] ${hero ? 'h-[28%]' : 'h-[22%]'}`} />
      {hero && kind === 'nexora' && (
        <>
          <div className="absolute inset-[10%] rounded-full border border-nexora-accent/30 pointer-events-none" />
          <div className="absolute inset-[18%] rounded-full border border-white/[0.06] pointer-events-none" />
        </>
      )}
      {hero && kind === 'btc' && (
        <div className="absolute inset-[12%] rounded-full border border-amber-300/20 pointer-events-none" />
      )}
    </div>
  );
}

export function FloatingCoin({
  kind,
  size,
  delay = 0,
}: {
  kind: CoinKind;
  size?: number;
  delay?: number;
}) {
  return (
    <motion.div
      animate={{ y: [0, -6, 0] }}
      transition={{ repeat: Infinity, duration: 3 + delay, ease: 'easeInOut', delay }}
    >
      <CryptoCoin kind={kind} size={size} />
    </motion.div>
  );
}
