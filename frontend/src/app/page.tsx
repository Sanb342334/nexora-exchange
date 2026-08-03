'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Spinner } from '@/components/ui';

export default function Home() {
  const { user, loading, isTelegram, loginWithTelegram } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (user) {
      router.replace('/trade');
      return;
    }
    if (isTelegram) {
      loginWithTelegram()
        .then((u) => router.replace(u ? '/trade' : '/trade'))
        .catch(() => router.replace('/trade'));
      return;
    }
    router.replace('/trade');
  }, [user, loading, router, isTelegram, loginWithTelegram]);

  return <Spinner />;
}
