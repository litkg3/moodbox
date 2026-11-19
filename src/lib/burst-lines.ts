import type { EmotionId } from '@/types';

/**
 * 捏爆一颗球之后那句话。
 *
 * 约定：
 * 1. 全部以「XX球被你捏爆啦」开头（开心、麻木这两颗也说「球」），
 *    句式为固定留白，换文案时只改后半句；
 * 2. 负面情绪统一说「负面情绪释放成功」—— 不评价、不追问用户现在好没好；
 * 3. 备考、迷茫送一句祝愿，疲惫说「好好休息，积蓄力量」：
 *    这几颗球捏爆它不像在扔负担，更像在给自己松一口气；
 * 4. 麻木改成「从此积极生活」：麻木本身不是情绪太多，而是感受被调小了，
 *    这里给的是往前的方向，不是「释放」；
 * 5. 文案里不出现「球会飞回来」这类提示，复原是自然的、不需要用户记着。
 */
export const BURST_LINES: Record<EmotionId, (label: string) => string> = {
  // 已含「球」字，不再拼 label
  parting: () => '分别球被你捏爆啦，相遇无悔，从容道别！',
  exam: (label) => `${label}球被你捏爆啦，祝你考试顺利，得偿所愿！`,
  joy: (label) => `${label}球被你捏爆啦，要天天开心哦！`,
  lost: (label) => `${label}球被你捏爆啦，祝你早日找到自己的方向！`,
  exhaustion: (label) => `${label}球被你捏爆啦，好好休息，积蓄力量！`,
  numbness: (label) => `${label}球被你捏爆啦，从此积极生活！`,

  // 以下同属「负向」，说同一句话；单列是为了将来要改某一种时不必动组件
  anxiety: (label) => `${label}球被你捏爆啦，负面情绪释放成功！`,
  loneliness: (label) => `${label}球被你捏爆啦，负面情绪释放成功！`,
  wronged: (label) => `${label}球被你捏爆啦，负面情绪释放成功！`,
  irritation: (label) => `${label}球被你捏爆啦，负面情绪释放成功！`,
  pain: (label) => `${label}球被你捏爆啦，负面情绪释放成功！`,
  sadness: (label) => `${label}球被你捏爆啦，负面情绪释放成功！`,
};

/** 取这颗球对应的捏爆文案。 */
export function burstLine(emotionId: EmotionId, label: string): string {
  const build = BURST_LINES[emotionId];
  return build ? build(label) : `${label}球被你捏爆啦，负面情绪释放成功！`;
}
