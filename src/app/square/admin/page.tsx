import type { Metadata } from 'next';
import { AdminGate } from '@/components/admin/admin-gate';
import { PageShell } from '@/components/layout/page-shell';

export const metadata: Metadata = {
  title: '管理员入口',
  description: '树洞广场的内容管理入口。',
  robots: { index: false, follow: false },
};

export default function SquareAdminPage() {
  return (
    <PageShell width="narrow">
      <AdminGate />
    </PageShell>
  );
}
