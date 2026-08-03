'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Spinner } from '@/components/ui';
import { isInsideTelegramShell } from '@/lib/telegram';

/** Login UI removed for Mini App — silent Telegram auth only. */
export default function LoginPage() {
  const { user, loading, isTelegram, loginWithTelegram } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (user) {
      router.replace('/trade');
      return;
    }
    const inTg = isTelegram || isInsideTelegramShell();
    if (inTg) {
      loginWithTelegram()
        .finally(() => router.replace('/trade'))
        .catch(() => router.replace('/trade'));
      return;
    }
    router.replace('/trade');
  }, [loading, user, isTelegram, loginWithTelegram, router]);

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-[#07090F]">
      <div className="text-center space-y-3">
        <Spinner />
        <p className="text-sm text-white/50">Вход через Telegram…</p>
      </div>
    </div>
  );
}
