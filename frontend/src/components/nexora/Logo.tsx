'use client';

import Link from 'next/link';

export function NexoraLogo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/market" className="flex items-center gap-2 sm:gap-2.5 group min-w-0">
      <div className="relative flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-nexora-gradient shadow-glow-sm">
        <span className="font-display text-base sm:text-lg font-bold text-white">N</span>
      </div>
      {!compact && (
        <div className="hidden sm:block min-w-0">
          <div className="font-display text-sm sm:text-base font-bold tracking-tight text-white group-hover:text-nexora-accent transition leading-none truncate">
            NEXORA
          </div>
          <div className="text-[9px] sm:text-[10px] font-medium uppercase tracking-[0.18em] text-nexora-muted mt-0.5">
            P2P Exchange
          </div>
        </div>
      )}
    </Link>
  );
}
