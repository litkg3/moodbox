import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ChatView } from '@/components/chat/chat-view';

export const metadata: Metadata = {
  title: 'AI 陪聊',
  description:
    '一个愿意听你说话的 AI 陪伴者。它不诊断、不说教，也不会替你保密 —— 但它会陪你把话说完。',
};

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="mb-chat-page" aria-busy="true" />}>
      <ChatView />
    </Suspense>
  );
}
