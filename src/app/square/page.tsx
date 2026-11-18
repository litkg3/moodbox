import type { Metadata } from 'next';
import { PageShell } from '@/components/layout/page-shell';
import { SquareView } from '@/components/square/square-view';

export const metadata: Metadata = {
  title: '树洞广场',
  description:
    '匿名说一句，会有人抱抱你。内容经审核后展示，出现与伤害自己有关的表达时会先给出温柔的提示与真实的求助电话。',
};

export default function SquarePage() {
  return (
    <PageShell>
      <SquareView />
    </PageShell>
  );
}
