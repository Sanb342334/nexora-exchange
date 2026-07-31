import { Suspense } from 'react';
import { NexoraShell } from '@/components/nexora/NexoraShell';

export default function TraderLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <NexoraShell>{children}</NexoraShell>
    </Suspense>
  );
}
