import type { EmotionId } from '@/types';

/**
 * 捏爆一颗球之后那句话。
 *
 * 约定：
 * 1. 负面情绪统一说「释放成功」，不评价、不追问用户现在好没好；
 * 2. 开心这类正向情绪不说「释放」—— 把好心情「释放」掉听起来像在丢东西，
 *    所以改成往外传（「好心情是会传染的哦」）；
 * 3. 备考虽说不上愉快，但捏爆它不该像在扔负担，所以送的是一句祝愿；
 * 4. 文案里不出现「球会飞回来」这类提示，复原是自然的、不需要用户记着。
 */
export const BURST_LINES: Record<EmotionId, (label: string) => string> = {
  joy: () => '开心被你捏爆了，好心情是会传染的哦',

  // 备考：不判它是好是坏，直接送祝愿
  exam: (label) => `${label}被你捏爆啦，祝你考试顺利，得偿所愿！`,

  // 以下情绪同属「负向」，说同一句话；单列是为了将来要改某一种时不必动组件
  anxiety: (label) => `${label}被你捏爆了！负面情绪释放成功`,
  sadness: (label) => `${label}被你捏爆了！负面情绪释放成功`,
  loneliness: (label) => `${label}被你捏爆了！负面情绪释放成功`,
  emo: (label) => `${label}被你捏爆了！负面情绪释放成功`,
  pain: (label) => `${label}被你捏爆了！负面情绪释放成功`,
  fear: (label) => `${label}被你捏爆了！负面情绪释放成功`,
  irritation: (label) => `${label}被你捏爆了！负面情绪释放成功`,
  exhaustion: (label) => `${label}被你捏爆了！负面情绪释放成功`,
  worry: (label) => `${label}被你捏爆了！负面情绪释放成功`,
  lost: (label) => `${label}被你捏爆了！负面情绪释放成功`,
  wronged: (label) => `${label}被你捏爆了！负面情绪释放成功`,
  numbness: (label) => `${label}被你捏爆了！负面情绪释放成功`,
};

/** 取这颗球对应的捏爆文案。 */
export function burstLine(emotionId: EmotionId, label: string): string {
  const build = BURST_LINES[emotionId];
  return build ? build(label) : `${label}被你捏爆了！负面情绪释放成功`;
}
