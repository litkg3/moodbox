import { EMOTIONS } from '@/data/emotions';
import { EMOTION_IDS, type Emotion, type EmotionId } from '@/types';

export const EMOTION_MAP: Record<EmotionId, Emotion> = EMOTIONS.reduce(
  (acc, emotion) => {
    acc[emotion.id] = emotion;
    return acc;
  },
  {} as Record<EmotionId, Emotion>,
);

export function isEmotionId(value: unknown): value is EmotionId {
  return typeof value === 'string' && (EMOTION_IDS as readonly string[]).includes(value);
}

/** 读取情绪配置，未知 id 回退到第一种情绪，避免运行时报错。 */
export function getEmotion(id: EmotionId): Emotion {
  return EMOTION_MAP[id] ?? EMOTIONS[0]!;
}

/**
 * 随机取一条文案，并尽量避开最近出现过的内容，
 * 保证“再给我一点温暖”不会连续重复同一句。
 */
export function pickMessage(
  messages: readonly string[],
  recent: readonly string[] = [],
): { message: string; recent: string[] } {
  if (messages.length === 0) return { message: '', recent: [...recent] };

  const available = messages.filter((message) => !recent.includes(message));
  const pool = available.length > 0 ? available : messages;
  const message = pool[Math.floor(Math.random() * pool.length)] ?? messages[0]!;

  const nextRecent = [...recent.filter((item) => item !== message), message].slice(-4);
  return { message, recent: nextRecent };
}

/**
 * 每种情绪需要配多少条文案（单元测试与内容自检使用）。
 * 默认 15 条；个别情绪可以按需声明自己的最低条数。
 */
export const DEFAULT_MIN_MESSAGES = 15;

/** 情绪 → 该情绪允许的最少文案条数（未列出的情绪按 DEFAULT_MIN_MESSAGES 校验）。 */
export const MIN_MESSAGES_BY_EMOTION: Partial<Record<EmotionId, number>> = {
  // 焦虑：文案已按需求整体替换为一组短句，共 8 条。
  anxiety: 8,
};

/** 所有情绪球是否达到各自的最低文案条数（供单元测试与内容自检使用）。 */
export function validateEmotionLibrary(): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  for (const emotion of EMOTIONS) {
    const min = MIN_MESSAGES_BY_EMOTION[emotion.id] ?? DEFAULT_MIN_MESSAGES;
    if (emotion.messages.length < min) {
      problems.push(`${emotion.label} 的文案不足 ${min} 条（当前 ${emotion.messages.length} 条）`);
    }
    const unique = new Set(emotion.messages);
    if (unique.size !== emotion.messages.length) {
      problems.push(`${emotion.label} 存在重复文案`);
    }
  }
  if (EMOTIONS.length !== EMOTION_IDS.length) {
    problems.push('情绪配置数量与 EMOTION_IDS 不一致');
  }
  return { ok: problems.length === 0, problems };
}
