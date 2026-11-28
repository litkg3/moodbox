import raw from './mbti.json';

export type MbtiGroup = '紫粉' | '蓝青' | '绿' | '橙黄';

export interface MbtiType {
  code: string;
  name: string;
  group: MbtiGroup;
  /** 一张卡上那一行话：不超过 14 个汉字，不换行、不截断 */
  tagline: string;
  /** 详情面板里的 2~3 个关键词 */
  tags: string[];
  desc: string;
  image: string;
}

/**
 * 十六型的原始数据。
 *
 * 文案是逐条手写的，不来自任何量表；`group` 就是卡片配色分组，
 * 四组与 CSS 里的 --mbti-analyst / sentinel / diplomat / explorer 对应。
 */
export const MBTI_TYPES = raw as unknown as MbtiType[];

/**
 * 组的显示名与 CSS 变量后缀。
 *
 * `segment` 是手机端分段控件上的三个字 —— 比「分析家」更长一点会挤，
 * 但比「紫粉组」更说人话，所以最终用了「分析型 / 守护型 / 理想型 / 探索型」。
 */
export const MBTI_GROUPS = [
  { key: '紫粉', token: 'analyst', label: '分析型', codes: 'INTJ · INTP · ENTJ · ENTP' },
  { key: '蓝青', token: 'sentinel', label: '守护型', codes: 'ISTJ · ISFJ · ESTJ · ESFJ' },
  { key: '绿', token: 'diplomat', label: '理想型', codes: 'INFJ · INFP · ENFJ · ENFP' },
  { key: '橙黄', token: 'explorer', label: '探索型', codes: 'ISTP · ISFP · ESTP · ESFP' },
] as const satisfies readonly {
  key: MbtiGroup;
  token: string;
  label: string;
  codes: string;
}[];

/** 组 → CSS 变量后缀。颜色本身写在 globals.css 的 --mbti-* 里，跟着主题走。 */
export const MBTI_TOKEN: Record<MbtiGroup, string> = {
  紫粉: 'analyst',
  蓝青: 'sentinel',
  绿: 'diplomat',
  橙黄: 'explorer',
};

/** 卡片/面板要挂的类名：只负责把 --mbti-accent / --mbti-soft 指到本组 */
export const mbtiToken = (type: { group: MbtiGroup }) => `mb-mbti-${MBTI_TOKEN[type.group]}`;

/** 某一组里的四个类型，顺序与数据一致 */
export function typesOfGroup(group: MbtiGroup): MbtiType[] {
  return MBTI_TYPES.filter((type) => type.group === group);
}

/**
 * 灯箱里的整图（4×4）。
 *
 * 尺寸必须和 public/mbti/mbti-all.webp 的真实像素一致 —— 灯箱拿它算缩放
 * 边界，写小了会拖不到图片的右半边。换图之后跑
 * `node scripts/mbti-import.mjs <目录>`，这里的数字要跟着改。
 */
export const MBTI_SHEET = { src: '/mbti/mbti-all.webp', width: 1768, height: 1984 } as const;
