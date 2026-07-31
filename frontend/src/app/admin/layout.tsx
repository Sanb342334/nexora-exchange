'use client';

import Link from 'next/link';

/** Web admin is closed — operations run in Telegram bot `/admin`. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  void children;
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#07090F] px-6 text-center">
      <div className="max-w-md rounded-[16px] border border-white/10 bg-[#0c1018] p-6">
        <div className="text-[11px] font-bold uppercase tracking-wide text-nexora-accent">NEXORA</div>
        <h1 className="mt-2 font-display text-xl font-bold text-white">Веб-админка отключена</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/65">
          Управление платформой доступно только в Telegram-боте: команда <code className="text-nexora-accent">/admin</code>.
        </p>
        <Link href="/trade" className="btn-primary mt-5 inline-flex text-sm">
          К торговле
        </Link>
      </div>
    </div>
  );
}
