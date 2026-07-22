import { AdminShell } from '@/components/nexora/AdminShell';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
