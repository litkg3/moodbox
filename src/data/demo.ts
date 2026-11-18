import { subDays } from 'date-fns';
import { toDateKey } from '@/lib/date';
import type { EmotionId, EmotionLog, MemoryMoodId, MemoryRecord } from '@/types';

/**
 * 演示用示例数据。
 *
 * 用途：线下评审现场演示时，可以快速让日历 / 收藏馆 / “我不开心了”有内容可看。
 * 所有记录都带 `isDemo: true`，界面上会明确标注「示例」，
 * 并在设置中提供一键清除，绝不与用户真实记录混淆。
 * 图片不内置，示例只使用文字。
 */

interface DemoMemorySeed {
  offset: number;
  title: string;
  content: string;
  mood: MemoryMoodId;
}

const DEMO_MEMORY_SEEDS: readonly DemoMemorySeed[] = [
  {
    offset: 0,
    title: '下班路上买到最后一个可颂',
    content: '袋子还是热的。走在路上忽然觉得，今天好像也没有那么糟。',
    mood: 'warm',
  },
  {
    offset: 1,
    title: '收到了远方寄来的明信片',
    content: '她说那里已经下雪了，邮戳上还沾着一点点融化的雪水。我把它贴在了书桌前面。',
    mood: 'joyful',
  },
  {
    offset: 3,
    title: '室友给我留了一碗汤',
    content: '加班到十点回家，汤还在锅里温着，上面盖了一个盘子，怕凉掉。',
    mood: 'moved',
  },
  {
    offset: 5,
    title: '一个人在公园坐了一小时',
    content: '什么都没有做，只是看鸽子走来走去。风有一点凉，太阳刚好落在长椅上。',
    mood: 'calm',
  },
  {
    offset: 6,
    title: '第一次跑完五公里没有停',
    content: '最后一公里腿很酸，但我没有走。回到家的时候，觉得自己挺厉害的。',
    mood: 'proud',
  },
  {
    offset: 8,
    title: '把咖啡洒在了白衬衫上',
    content: '同事说这是我今天的抽象派胸针，我们两个人笑了很久，笑到忘记开会。',
    mood: 'amused',
  },
  {
    offset: 9,
    title: '抢到了想看的演出票',
    content: '十一月二十四号，第七排靠中间。已经开始想那天要穿什么了。',
    mood: 'hopeful',
  },
  {
    offset: 11,
    title: '妈妈说家里一切都好',
    content: '她只说了三分钟，但那三分钟让我接下来一整周都很踏实。',
    mood: 'safe',
  },
  {
    offset: 13,
    title: '猫在门口等我回家',
    content: '钥匙还没转完，它就开始叫了。好像我离开的这九个小时，它一直在数。',
    mood: 'warm',
  },
];

const DEMO_EMOTION_SEEDS: readonly { offset: number; emotionId: EmotionId }[] = [
  { offset: 0, emotionId: 'joy' },
  { offset: 0, emotionId: 'anxiety' },
  { offset: 1, emotionId: 'exhaustion' },
  { offset: 2, emotionId: 'lost' },
  { offset: 2, emotionId: 'anxiety' },
  { offset: 3, emotionId: 'joy' },
  { offset: 4, emotionId: 'numbness' },
  { offset: 5, emotionId: 'exhaustion' },
  { offset: 6, emotionId: 'joy' },
  { offset: 7, emotionId: 'anxiety' },
  { offset: 8, emotionId: 'irritation' },
  { offset: 8, emotionId: 'joy' },
  { offset: 9, emotionId: 'joy' },
  { offset: 10, emotionId: 'loneliness' },
  { offset: 11, emotionId: 'joy' },
  { offset: 11, emotionId: 'exhaustion' },
  { offset: 12, emotionId: 'exam' },
];

export function createDemoMemories(now: Date = new Date()): MemoryRecord[] {
  return DEMO_MEMORY_SEEDS.map((seed, index) => {
    const date = toDateKey(subDays(now, seed.offset));
    const createdAt = new Date(subDays(now, seed.offset));
    createdAt.setHours(20, 15 + index, 0, 0);
    return {
      id: `demo_memory_${index + 1}`,
      date,
      title: seed.title,
      content: seed.content,
      mood: seed.mood,
      createdAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString(),
      isDemo: true,
    };
  });
}

export function createDemoEmotionLogs(now: Date = new Date()): EmotionLog[] {
  return DEMO_EMOTION_SEEDS.map((seed, index) => {
    const moment = new Date(subDays(now, seed.offset));
    moment.setHours(9 + (index % 11), (index * 7) % 60, 0, 0);
    return {
      id: `demo_log_${index + 1}`,
      emotionId: seed.emotionId,
      date: toDateKey(moment),
      createdAt: moment.toISOString(),
      isDemo: true,
    };
  });
}

export const DEMO_MEMORY_ID_PREFIX = 'demo_memory_';
export const DEMO_LOG_ID_PREFIX = 'demo_log_';

export function isDemoRecord(record: { isDemo?: boolean; id: string }): boolean {
  return record.isDemo === true || record.id.startsWith('demo_');
}
