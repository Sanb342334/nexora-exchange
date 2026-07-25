'use client';

import Link from 'next/link';

export function NexoraLogo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/trade" className="group flex min-w-0 items-center gap-2.5 sm:gap-3">
      <div className="relative h-9 w-9 shrink-0 sm:h-10 sm:w-10" aria-hidden>
        <div className="absolute inset-0 rounded-full bg-[#7B61FF]/40 blur-md" />
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#7B61FF] via-[#9D8AFF] to-[#6F3DFF] p-[2.5px] shadow-[0_0_20px_rgba(123,97,255,0.45)]">
          <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#1a1528] via-[#12101c] to-[#0b0e14] border border-[#9D8AFF]/35">
            <span className="font-display text-[15px] font-black leading-none text-transparent bg-clip-text bg-gradient-to-b from-[#F0EBFF] to-[#7B61FF] sm:text-[16px]">
              N
            </span>
            <div className="pointer-events-none absolute inset-x-[18%] top-[8%] h-[26%] rounded-full bg-white/25 blur-[1px]" />
            <div className="pointer-events-none absolute inset-[14%] rounded-full border border-white/[0.07]" />
          </div>
        </div>
      </div>
      {!compact && (
        <div className="min-w-0">
          <div className="truncate font-display text-sm font-bold leading-none tracking-tight text-white transition group-hover:text-nexora-accent sm:text-base">
            NEXORA
          </div>
          <div className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.18em] text-nexora-muted sm:text-[10px]">
            P2P Exchange
          </div>
        </div>
      )}
    </Link>
  );
}
