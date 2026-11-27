/**
 * 情绪转盘：普拉奇克情绪轮（Plutchik's Wheel of Emotions）。
 *
 * 结构是一个八瓣的花：八个花瓣各是一种基础情绪，每个花瓣从外到内分三层，
 * 强度依次升高 —— 外缘是轻微的那一档（平静 / 接纳 / 厌倦……），越靠近圆心
 * 越强烈（狂喜 / 钦佩 / 憎恶……）。夹在两个花瓣之间的那八段空白，是这两种
 * 情绪混在一起时得到的复合情绪（乐观 = 喜悦 + 期待，悔恨 = 悲伤 + 厌恶……）。
 *
 * 顺序就是花在盘上的顺序，从正上方开始顺时针排：
 * 喜悦 → 钦佩 → 惊悚 → 惊吓 → 悲痛 → 憎恶 → 暴怒 → 警惕。
 *
 * 转盘与主页那十二颗情绪球是两套东西：
 * - 情绪球（data/emotions.ts）是「你此刻是什么心情」，点开给你一段陪伴；
 * - 转盘是「情绪由什么组成、强度走到哪一层」，点开看它属于哪一类。
 */

export type Intensity = 'mild' | 'medium' | 'intense';

export interface EmotionTier {
  /** 这一层的词：平静 / 喜悦 / 狂喜 */
  label: string;
  /**
   * 强度档。它决定这一层在花瓣里占的位置，也决定卡片上那句「低强度 /
   * 中等强度 / 高强度」。
   */
  intensity: Intensity;
  /**
   * 这一层的一句话解释。
   *
   * 现在是空的 —— 这一轮只做轮子本身。缺省时卡片不渲染这一块，
   * 留白比塞一句凑数的话强。补的时候按 `mild` / `medium` / `intense`
   * 的高低写：同一层里的六个词，强度感要一致。
   */
  note?: string;
}

export interface EmotionPetal {
  /** 花瓣 id，用最外层那个词命名，三点叠起来看不会撞 */
  id: string;
  /** 这一瓣的颜色名（只用于调试与 aria） */
  family: string;
  /** 花瓣填充色 */
  color: string;
  /** 描边色，比填充深一档 */
  edge: string;
  /** 花瓣里的文字颜色，保证在色块上读得清 */
  ink: string;
  /** 从外到内三层 */
  tiers: readonly [EmotionTier, EmotionTier, EmotionTier];
}

/**
 * 八瓣。角度从正上方（12 点）开始顺时针：
 * 第 i 瓣占 [i × 45° − 22.5°, i × 45° + 22.5°]，瓣心在 i × 45°。
 */
export const EMOTION_PETALS: readonly EmotionPetal[] = [
  {
    id: 'joy',
    family: '黄',
    color: '#F5D547',
    edge: '#D4B01F',
    ink: '#6B5300',
    tiers: [
      { label: '平静', intensity: 'mild' },
      { label: '喜悦', intensity: 'medium' },
      { label: '狂喜', intensity: 'intense' },
    ],
  },
  {
    id: 'trust',
    family: '黄绿',
    color: '#C3D93F',
    edge: '#9CB322',
    ink: '#4E5A00',
    tiers: [
      { label: '接纳', intensity: 'mild' },
      { label: '信任', intensity: 'medium' },
      { label: '钦佩', intensity: 'intense' },
    ],
  },
  {
    id: 'fear',
    family: '绿',
    color: '#4E9E4A',
    edge: '#357A32',
    ink: '#F3FBEF',
    tiers: [
      { label: '忧虑', intensity: 'mild' },
      { label: '恐惧', intensity: 'medium' },
      { label: '惊悚', intensity: 'intense' },
    ],
  },
  {
    id: 'surprise',
    family: '深绿',
    color: '#2E7D46',
    edge: '#1B5C30',
    ink: '#EFF8F0',
    tiers: [
      { label: '不解', intensity: 'mild' },
      { label: '惊讶', intensity: 'medium' },
      { label: '惊吓', intensity: 'intense' },
    ],
  },
  {
    id: 'sadness',
    family: '蓝',
    color: '#3E9BD6',
    edge: '#2A78AC',
    ink: '#F2FAFF',
    tiers: [
      { label: '伤感', intensity: 'mild' },
      { label: '悲伤', intensity: 'medium' },
      { label: '悲痛', intensity: 'intense' },
    ],
  },
  {
    id: 'disgust',
    family: '紫',
    color: '#5A3A82',
    edge: '#432764',
    ink: '#F6F0FF',
    tiers: [
      { label: '厌倦', intensity: 'mild' },
      { label: '厌恶', intensity: 'medium' },
      { label: '憎恶', intensity: 'intense' },
    ],
  },
  {
    id: 'anger',
    family: '红',
    color: '#B3202C',
    edge: '#8A121D',
    ink: '#FFF1F1',
    tiers: [
      { label: '懊恼', intensity: 'mild' },
      { label: '生气', intensity: 'medium' },
      { label: '暴怒', intensity: 'intense' },
    ],
  },
  {
    id: 'anticipation',
    family: '橙',
    color: '#EC8B2E',
    edge: '#C46A12',
    ink: '#FFF8EE',
    tiers: [
      { label: '好奇', intensity: 'mild' },
      { label: '期待', intensity: 'medium' },
      { label: '警惕', intensity: 'intense' },
    ],
  },
] as const;

/**
 * 复合情绪：相邻两瓣交界处那一段空白里的词。
 *
 * 位置约定为「第 i 瓣与第 i+1 瓣之间」，所以第 i 个复合词落在
 * i × 45° + 22.5° 的方向上（正上方顺时针）。八个词正好绕满一圈。
 *
 * 它们只是标注，不参与点击 —— 点开能看的仍然是那二十四层的词。
 */
export const EMOTION_DYADS: readonly string[] = [
  '乐观', // 喜悦 + 期待
  '喜爱', // 喜悦 + 钦佩
  '屈从', // 钦佩 + 惊悚
  '敬畏', // 惊悚 + 惊吓
  '悲观', // 惊吓 + 悲痛
  '悔恨', // 悲痛 + 憎恶
  '鄙视', // 憎恶 + 暴怒
  '好斗', // 暴怒 + 警惕
] as const;

/** 强度档对应的中文说法，卡片上用。 */
export const INTENSITY_LABEL: Record<Intensity, string> = {
  mild: '低强度',
  medium: '中等强度',
  intense: '高强度',
};

/** 一层在花瓣里的序号：0 最外、2 最内。也用来说明「离圆心越近越强」。 */
export const TIER_ORDER: Record<Intensity, number> = {
  mild: 0,
  medium: 1,
  intense: 2,
};

/** 展平成 24 个可点的格，按下标取用。顺序即花瓣顺序 × 层顺序。 */
export interface EmotionCell {
  /** 全局唯一：`花瓣id-层` */
  id: string;
  /** 这个词本身 */
  label: string;
  intensity: Intensity;
  note?: string;
  tier: number;
  petalIndex: number;
  petal: EmotionPetal;
}

export const EMOTION_CELLS: readonly EmotionCell[] = EMOTION_PETALS.flatMap((petal, petalIndex) =>
  petal.tiers.map((tier, tierIndex) => ({
    id: `${petal.id}-${tier.intensity}`,
    label: tier.label,
    intensity: tier.intensity,
    note: tier.note,
    tier: tierIndex,
    petalIndex,
    petal,
  })),
);
