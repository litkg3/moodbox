import type { MemoryMood, MemoryMoodId } from '@/types';

/** 快乐记忆的心情标签。颜色都取自同一套低饱和色盘。 */
export const MEMORY_MOOD_LIST: readonly MemoryMood[] = [
  { id: 'warm', label: '温暖', tint: '#F7E3D8', ink: '#9A6B4E' },
  { id: 'joyful', label: '雀跃', tint: '#FBEBC0', ink: '#8F7431' },
  { id: 'moved', label: '感动', tint: '#F6DDE2', ink: '#9C5E6C' },
  { id: 'calm', label: '平静', tint: '#E1EAE4', ink: '#5F7A69' },
  { id: 'proud', label: '骄傲', tint: '#E4E1F3', ink: '#6B6493' },
  { id: 'amused', label: '好笑', tint: '#FDE6D6', ink: '#A06B45' },
  { id: 'hopeful', label: '期待', tint: '#DFEAF3', ink: '#53748C' },
  { id: 'safe', label: '安心', tint: '#E9E7F0', ink: '#6A6486' },
];

export const MEMORY_MOOD_MAP: Record<MemoryMoodId, MemoryMood> = MEMORY_MOOD_LIST.reduce(
  (acc, mood) => {
    acc[mood.id] = mood;
    return acc;
  },
  {} as Record<MemoryMoodId, MemoryMood>,
);

export function isMemoryMoodId(value: unknown): value is MemoryMoodId {
  return typeof value === 'string' && MEMORY_MOOD_LIST.some((mood) => mood.id === value);
}
