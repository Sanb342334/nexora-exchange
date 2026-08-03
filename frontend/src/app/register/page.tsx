'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui';

/** Registration disabled — Telegram Mini App creates the account automatically. */
export default function RegisterPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/trade');
  }, [router]);
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-[#07090F]">
      <Spinner />
    </div>
  );
}
