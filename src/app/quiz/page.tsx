import type { Metadata } from 'next';
import { PageShell } from '@/components/layout/page-shell';
import { QuizView } from '@/components/quiz/quiz-view';

export const metadata: Metadata = {
  title: '情绪测试',
  description: '六个问题，帮你把此刻的感觉说清楚一点。不是心理测评，也不构成任何诊断。',
};

export default function QuizPage() {
  return (
    <PageShell width="narrow">
      <QuizView />
    </PageShell>
  );
}
