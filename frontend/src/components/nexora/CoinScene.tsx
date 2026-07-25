'use client';

import { memo } from 'react';
import { CryptoCoin } from './CryptoCoin';

const orbitCoins = [
  { kind: 'btc' as const, size: 44, orbit: 112, duration: 18 },
  { kind: 'eth' as const, size: 40, orbit: 86, duration: 14 },
  { kind: 'usdt' as const, size: 38, orbit: 68, duration: 11 },
  { kind: 'bnb' as const, size: 36, orbit: 98, duration: 16 },
];

function CoinSceneInner({ className = '' }: { className?: string }) {
  return (
    <div
      className={`coin-scene relative h-[220px] w-[280px] sm:h-[250px] sm:w-[320px] shrink-0 ${className}`}
      aria-hidden
    >
      <div className="absolute inset-0 rounded-full bg-nexora-accent/12 blur-[72px]" />
      <div className="absolute bottom-[20%] left-1/2 h-32 w-32 -translate-x-1/2 rounded-full bg-[#7B61FF]/20 blur-[48px]" />

      {/* Orbital rings — pure circles */}
      {[112, 86, 68].map((r, i) => (
        <div
          key={r}
          className="absolute left-1/2 rounded-full border border-white/[0.05]"
          style={{
            width: r * 2,
            height: r * 2,
            bottom: 118 - r,
            marginLeft: -r,
            opacity: 0.28 - i * 0.06,
            boxShadow: i === 0 ? '0 0 24px rgba(123,97,255,0.12)' : undefined,
          }}
        />
      ))}

      {/* Circular tiered pedestal (not a square slot) */}
      <div className="absolute bottom-3 sm:bottom-5 left-1/2 -translate-x-1/2 flex flex-col items-center">
        <div
          className="h-3 w-[148px] rounded-[50%] opacity-80"
          style={{
            background: 'radial-gradient(ellipse, rgba(123,97,255,0.45) 0%, transparent 70%)',
            filter: 'blur(8px)',
          }}
        />
        <div className="relative -mt-1 flex flex-col items-center">
          <div className="h-[14px] w-[100px] rounded-[50%] bg-gradient-to-b from-[#2a2540] to-[#141820] border border-nexora-accent/25 shadow-[0_0_20px_rgba(123,97,255,0.2)]" />
          <div className="-mt-1 h-[18px] w-[124px] rounded-[50%] bg-gradient-to-b from-[#1f1b30] to-[#10131c] border border-white/[0.08]" />
          <div className="-mt-1 h-[22px] w-[148px] rounded-[50%] bg-gradient-to-b from-[#161b28] to-[#0b0e14] border border-white/[0.06]" />
          <div
            className="absolute -top-6 left-1/2 h-12 w-12 -translate-x-1/2 rounded-full coin-pedestal-glow"
            style={{
              background: 'radial-gradient(circle, rgba(123,97,255,0.35) 0%, transparent 70%)',
            }}
          />
        </div>
      </div>

      {/* Central NEXORA coin — round, branded, gentle float only (no rotateY) */}
      <div className="absolute bottom-[92px] sm:bottom-[98px] left-1/2 z-20 coin-float">
        <CryptoCoin kind="nexora" size={96} hero />
      </div>

      {/* Orbiting coins — CSS animation (lighter than Framer) */}
      {orbitCoins.map((c) => (
        <div
          key={c.kind}
          className="coin-orbit absolute left-1/2 bottom-[108px] sm:bottom-[114px]"
          style={{
            width: c.orbit * 2,
            height: c.orbit * 2,
            marginLeft: -c.orbit,
            animationDuration: `${c.duration}s`,
          }}
        >
          <div className="coin-orbit-counter" style={{ animationDuration: `${c.duration}s` }}>
            <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2">
              <CryptoCoin kind={c.kind} size={c.size} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export const CoinScene = memo(CoinSceneInner);
