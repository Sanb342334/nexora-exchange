import { AppShell } from '@/components/AppShell';

export default function TraderLayout({ children }: { children: React.ReactNode }) {
  return <AppShell role="TRADER">{children}</AppShell>;
}
