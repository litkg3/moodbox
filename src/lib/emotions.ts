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

/**
 * 已经下线的情绪 → 现在最接近的那一颗。
 *
 * 用户的记录是长期资产，删一颗球不该让那些心情凭空消失。
 * 这里只在**读取/展示**时做映射，不改库里的原始记录：
 * 万一以后又把球加回来，旧数据还是完整的。
 */
export const LEGACY_EMOTION_IDS: Readonly<Record<string, EmotionId>> = {
  emo: 'numbness',
  worry: 'anxiety',
  fear: 'anxiety',
};

/**
 * 把任意 id（含已下线的）收敛成现存的情绪 id。
 *
 * 完全不认识的值回退到第一种情绪 —— 与 `getEmotion` 的策略保持一致，
 * 宁可显示一颗「焦虑」，也不要让界面空着或崩掉。
 */
export function normalizeEmotionId(id: string): EmotionId {
  if (isEmotionId(id)) return id;
  return LEGACY_EMOTION_IDS[id] ?? EMOTIONS[0]!.id;
}

/** 读取情绪配置，未知 id 回退到第一种情绪，避免运行时报错。 */
export function getEmotion(id: EmotionId): Emotion {
  return EMOTION_MAP[id] ?? EMOTIONS[0]!;
}

/** 按（可能是旧的）id 取情绪，展示历史记录时用这个。 */
export function getEmotionLoose(id: string): Emotion {
  return EMOTION_MAP[normalizeEmotionId(id)] ?? EMOTIONS[0]!;
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
  // 焦虑：在原来那 8 条之后加了 2 条「允许焦虑、给悬而未决留点耐心」的短句，共 10 条
  //（故事另放在 emotion.story 里，不占这个额度）。
  anxiety: 10,
  // 备考：文案已按需求整体替换为一组独立的鼓励短句，后又追加 2 条，共 16 条。
  exam: 16,
  // 孤独：文案已按需求整体替换为一组关于「独处」的短句，共 7 条。
  loneliness: 7,
  // 难过：文案已按需求整体替换为一组「接受情绪」的短句，共 8 条。
  sadness: 8,
  // 开心：文案已按需求整体替换为一组轻快的祝福短句，共 14 条。
  joy: 14,
  // 分别：文案已按需求整体替换为一组关于「阶段性陪伴」的短句，共 12 条。
  parting: 12,
  // 痛苦：文案已按需求整体替换为一组「与痛苦相处」的短句，共 7 条。
  pain: 7,
  // 疲惫：文案已按需求整体替换为一组「允许自己休息」的短句，共 5 条。
  exhaustion: 5,
  // 委屈 / 麻木：按需求各只留一句，全部旧文案删掉。
  // 一句也允许，但没有可轮换的内容时面板不会再显示「再给我一点温暖」。
  wronged: 1,
  numbness: 1,
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
