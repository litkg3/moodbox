import type { StoryTheme, StoryThemeMeta } from '@/types';

/** 故事主题的展示信息。与情绪球一样，颜色全部低饱和，避免变成彩色标签墙。 */
export const STORY_THEME_META: Record<StoryTheme, StoryThemeMeta> = {
  warmth: { id: 'warmth', label: '温暖', tint: 'rgba(247, 224, 206, 0.55)', ink: '#8a6247' },
  company: { id: 'company', label: '陪伴', tint: 'rgba(226, 228, 246, 0.6)', ink: '#5c5f83' },
  courage: { id: 'courage', label: '勇气', tint: 'rgba(232, 222, 244, 0.6)', ink: '#6b5787' },
  rest: { id: 'rest', label: '休息', tint: 'rgba(219, 235, 226, 0.6)', ink: '#4f6b58' },
  growth: { id: 'growth', label: '生长', tint: 'rgba(238, 230, 205, 0.6)', ink: '#7a6a45' },
  night: { id: 'night', label: '深夜', tint: 'rgba(212, 219, 240, 0.6)', ink: '#4d5878' },
};

export const STORY_THEME_LIST = Object.values(STORY_THEME_META);
