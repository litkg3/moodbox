import type { Metadata } from 'next';
import { CalendarView } from '@/components/calendar/calendar-view';

export const metadata: Metadata = {
  title: '情绪足迹',
  description: '像翻一本手账那样回顾自己的情绪与快乐记忆，只统计你主动记录的内容。',
};

export default function CalendarPage() {
  return <CalendarView />;
}
