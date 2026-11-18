import type { Metadata } from 'next';
import { BreatheView } from '@/components/breathe/breathe-view';
import { PageShell } from '@/components/layout/page-shell';

export const metadata: Metadata = {
  title: '呼吸放松',
  description: '跟着圆环做几十秒的深呼吸。不承诺疗效，只是给身体一个慢下来的机会。',
};

export default function BreathePage() {
  return (
    <PageShell width="narrow">
      <BreatheView />
    </PageShell>
  );
}
