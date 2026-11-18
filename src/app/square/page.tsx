import type { Metadata } from 'next';
import { PageShell } from '@/components/layout/page-shell';
import { SquareView } from '@/components/square/square-view';

export const metadata: Metadata = {
  title: '树洞广场',
  description:
    '当小球难以匹配你复杂的心情时，不妨来到树洞广场，欢迎你来倾诉，分享你的故事。内容经审核后展示。',
};

export default function SquarePage() {
  return (
    <PageShell>
      <SquareView />
    </PageShell>
  );
}
