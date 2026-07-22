'use client';

import { motion } from 'framer-motion';
import { CryptoCoin } from './CryptoCoin';

/** Orbiting coins — BTC is the hero centerpiece, not in orbit */
const orbitCoins = [
  { kind: 'eth' as const, size: 48, orbit: 118, duration: 14, delay: 0 },
  { kind: 'usdt' as const, size: 44, orbit: 88, duration: 11, delay: 0.4 },
  { kind: 'nexora' as const, size: 42, orbit: 102, duration: 16, delay: 0.8 },
  { kind: 'bnb' as const, size: 40, orbit: 72, duration: 10, delay: 1.2 },
];

export function CoinScene({ className = '' }: { className?: string }) {
  return (
    <div
      className={`relative h-[240px] w-[300px] sm:h-[260px] sm:w-[340px] shrink-0 ${className}`}
      style={{ perspective: '1200px' }}
    >
      {/* Ambient glow — gold + purple mix */}
      <div className="absolute inset-0 rounded-full bg-[#F7931A]/15 blur-[70px]" />
      <div className="absolute inset-0 rounded-full bg-nexora-accent/15 blur-[90px] translate-y-8" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_72%,rgba(247,147,26,0.2),transparent_50%)]" />

      {/* Orbital rings */}
      {[118, 88, 102].map((r, i) => (
        <div
          key={r}
          className="absolute bottom-[108px] left-1/2 -translate-x-1/2 rounded-full border border-white/[0.06]"
          style={{
            width: r * 2,
            height: r * 2,
            marginLeft: -r,
            marginBottom: -r,
            opacity: 0.35 - i * 0.08,
            boxShadow: i === 0 ? '0 0 20px rgba(123,97,255,0.15)' : undefined,
          }}
        />
      ))}

      {/* Pedestal */}
      <div className="absolute bottom-2 sm:bottom-4 left-1/2 -translate-x-1/2">
        <motion.div
          animate={{ opacity: [0.45, 0.9, 0.45], scaleX: [0.92, 1.08, 0.92] }}
          transition={{ repeat: Infinity, duration: 2.8, ease: 'easeInOut' }}
          className="h-6 w-44 rounded-full blur-lg"
          style={{ background: 'linear-gradient(90deg, rgba(247,147,26,0.5), rgba(123,97,255,0.45))' }}
        />
        <div className="relative mx-auto -mt-3 h-[92px] w-[120px]">
          <div
            className="absolute inset-0 rounded-b-[30px] border shadow-[0_0_60px_rgba(247,147,26,0.25),0_0_40px_rgba(123,97,255,0.2)]"
            style={{
              background: 'linear-gradient(to bottom, rgba(247,147,26,0.35) 0%, #1a1a2e 35%, #0e0e1a 100%)',
              borderColor: 'rgba(247,147,26,0.35)',
            }}
          />
          <div className="absolute inset-x-3 top-0 h-1 rounded-full bg-gradient-to-r from-transparent via-white/30 to-transparent" />
          <motion.div
            animate={{ opacity: [0.3, 0.7, 0.3] }}
            transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
            className="absolute inset-x-6 top-2 h-8 rounded-full bg-[#F7931A]/20 blur-md"
          />
        </div>
      </div>

      {/* Central golden Bitcoin */}
      <motion.div
        animate={{ y: [0, -12, 0], rotateY: [0, 360] }}
        transition={{
          y: { repeat: Infinity, duration: 3.5, ease: 'easeInOut' },
          rotateY: { repeat: Infinity, duration: 14, ease: 'linear' },
        }}
        className="absolute bottom-[86px] sm:bottom-[88px] left-1/2 z-20 -translate-x-1/2"
        style={{ transformStyle: 'preserve-3d' }}
      >
        <CryptoCoin kind="btc" size={104} hero />
      </motion.div>

      {/* Light beam under BTC */}
      <motion.div
        animate={{ opacity: [0.25, 0.55, 0.25], scaleY: [0.9, 1.05, 0.9] }}
        transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
        className="absolute bottom-[72px] left-1/2 z-10 h-16 w-8 -translate-x-1/2 rounded-full blur-md pointer-events-none"
        style={{ background: 'linear-gradient(to top, rgba(247,147,26,0.6), transparent)' }}
      />

      {/* Orbiting coins */}
      {orbitCoins.map((c) => (
        <motion.div
          key={c.kind}
          className="absolute bottom-[104px] left-1/2 -translate-x-1/2"
          style={{ width: c.orbit * 2, height: c.orbit * 2 }}
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: c.duration, ease: 'linear', delay: c.delay }}
        >
          <motion.div
            className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2"
            animate={{ rotate: -360 }}
            transition={{ repeat: Infinity, duration: c.duration, ease: 'linear', delay: c.delay }}
          >
            <CryptoCoin kind={c.kind} size={c.size} />
          </motion.div>
        </motion.div>
      ))}

      {/* Sparkles */}
      {[...Array(8)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: i % 3 === 0 ? 3 : 2,
            height: i % 3 === 0 ? 3 : 2,
            left: `${12 + i * 10}%`,
            top: `${10 + (i % 4) * 18}%`,
            background: i % 2 === 0 ? '#FFB347' : '#9D8AFF',
          }}
          animate={{ opacity: [0, 0.9, 0], scale: [0.4, 1.3, 0.4] }}
          transition={{ repeat: Infinity, duration: 1.8 + i * 0.35, delay: i * 0.25 }}
        />
      ))}
    </div>
  );
}
