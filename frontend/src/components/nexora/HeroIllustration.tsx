'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { memo } from 'react';
import { CryptoCoin } from './CryptoCoin';

const ORBIT_COINS = [
  { kind: 'btc' as const, size: 52, radius: 132, duration: 22 },
  { kind: 'eth' as const, size: 48, radius: 158, duration: 17 },
  { kind: 'usdt' as const, size: 44, radius: 182, duration: 13 },
];

const PARTICLES = Array.from({ length: 8 }, (_, i) => ({
  id: i,
  left: 15 + ((i * 19) % 70),
  top: 22 + ((i * 27) % 58),
  size: 2 + (i % 2),
  duration: 4 + (i % 3),
  delay: i * 0.4,
}));

interface HeroIllustrationProps {
  variant?: 'banner' | 'login' | 'trade';
  className?: string;
  priority?: boolean;
  lite?: boolean;
}

function OrbitCoin({
  kind,
  size,
  radius,
  duration,
  reduced,
  centerY = '56%',
}: {
  kind: 'btc' | 'eth' | 'usdt';
  size: number;
  radius: number;
  duration: number;
  reduced: boolean;
  centerY?: string;
}) {
  return (
    <motion.div
      className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{ top: centerY, width: radius * 2, height: radius * 2 }}
      animate={reduced ? undefined : { rotate: 360 }}
      transition={reduced ? undefined : { repeat: Infinity, duration, ease: 'linear' }}
    >
      <motion.div
        className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2"
        animate={reduced ? undefined : { rotate: -360 }}
        transition={reduced ? undefined : { repeat: Infinity, duration, ease: 'linear' }}
      >
        <CryptoCoin kind={kind} size={size} />
      </motion.div>
    </motion.div>
  );
}

function HeroIllustrationInner({
  variant = 'banner',
  className = '',
  priority = false,
  lite = false,
}: HeroIllustrationProps) {
  const reduced = useReducedMotion();
  const isLogin = variant === 'login';
  const isTrade = variant === 'trade';
  const simple = lite || !!reduced;

  const wrapperClass = isTrade
    ? `pointer-events-none absolute right-0 top-1/2 z-[1] hidden w-[50%] max-w-[480px] -translate-y-1/2 lg:block ${className}`
    : isLogin
      ? `relative mx-auto w-full max-w-[720px] ${className}`
      : `pointer-events-none absolute right-[-4%] top-1/2 z-[1] hidden w-[60%] max-w-[720px] -translate-y-1/2 lg:block ${className}`;

  const orbitScale = isTrade ? 0.78 : isLogin ? 0.92 : 1;
  const orbitCenter = isTrade ? '58%' : isLogin ? '68%' : '56%';
  const ringRadii = isTrade ? [96, 118, 140] : isLogin ? [112, 132, 152] : [132, 158, 182];

  return (
    <div className={wrapperClass} aria-hidden>
      <div className={`relative w-full overflow-hidden ${isLogin ? 'aspect-[5/4]' : 'aspect-[16/10]'}`}>
        <motion.div
          className="absolute left-[54%] h-[45%] w-[62%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#7B61FF] blur-[80px]"
          style={{ top: isLogin ? '72%' : '58%' }}
          animate={reduced ? { opacity: 0.3 } : { opacity: [0.2, 0.45, 0.2] }}
          transition={reduced ? undefined : { repeat: Infinity, duration: 3.6, ease: 'easeInOut' }}
        />

        {ringRadii.map((radius, i) => (
          <div
            key={radius}
            className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#9D8AFF]/20 hero-orbit-ring"
            style={{
              top: orbitCenter,
              width: radius * 2,
              height: radius * 2,
              animationDuration: `${26 + i * 6}s`,
              animationDirection: i % 2 === 0 ? 'normal' : 'reverse',
            }}
          />
        ))}

        {!simple &&
          PARTICLES.map((p) => (
            <motion.span
              key={p.id}
              className="absolute rounded-full bg-[#C4B5FD]"
              style={{ left: `${p.left}%`, top: `${p.top}%`, width: p.size, height: p.size }}
              animate={{ y: [0, -12, 0], opacity: [0.2, 0.75, 0.2] }}
              transition={{ repeat: Infinity, duration: p.duration, delay: p.delay, ease: 'easeInOut' }}
            />
          ))}

        {!simple &&
          ORBIT_COINS.map((coin) => (
            <OrbitCoin
              key={coin.kind}
              kind={coin.kind}
              size={Math.round(coin.size * orbitScale)}
              radius={Math.round(coin.radius * orbitScale)}
              duration={coin.duration}
              reduced={!!reduced}
              centerY={orbitCenter}
            />
          ))}

        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          animate={simple ? undefined : { y: [0, -10, 0] }}
          transition={simple ? undefined : { repeat: Infinity, duration: 4.4, ease: 'easeInOut' }}
        >
          <motion.div
            className="relative h-full w-full"
            animate={simple ? undefined : { rotateY: [0, 8, 0, -8, 0] }}
            transition={simple ? undefined : { repeat: Infinity, duration: 14, ease: 'easeInOut' }}
            style={simple ? undefined : { transformStyle: 'preserve-3d', perspective: 1000 }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/nexora-hero-premium.png"
              alt=""
              loading={priority ? 'eager' : 'lazy'}
              decoding="async"
              fetchPriority={priority ? 'high' : 'auto'}
              draggable={false}
              className={`h-full w-full object-contain ${simple ? 'hero-scene-sharp' : 'hero-scene-blend'}`}
            />
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}

export const HeroIllustration = memo(HeroIllustrationInner);
