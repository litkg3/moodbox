import raw from './mbti.json';

export type MbtiGroup = '紫粉' | '蓝青' | '绿' | '橙黄';

export interface MbtiType {
  code: string;
  name: string;
  group: MbtiGroup;
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

/** 组的显示名与 CSS 变量后缀 */
export const MBTI_GROUPS = [
  { key: '紫粉', token: 'analyst', label: '分析家' },
  { key: '蓝青', token: 'sentinel', label: '守护者' },
  { key: '绿', token: 'diplomat', label: '外交家' },
  { key: '橙黄', token: 'explorer', label: '探险家' },
] as const satisfies readonly { key: MbtiGroup; token: string; label: string }[];

/** 灯箱里的整图（4×4） */
export const MBTI_SHEET = { src: '/mbti/mbti-all.webp', width: 1600, height: 2000 } as const;
