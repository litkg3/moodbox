import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THEME_PREFERENCE,
  isThemeMode,
  normalizePreference,
  resolveTheme,
  THEME_COLORS,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
} from '@/lib/theme';

describe('主题解析', () => {
  it('跟随系统时由 prefers-color-scheme 决定', () => {
    expect(resolveTheme('auto', true)).toBe('night');
    expect(resolveTheme('auto', false)).toBe('day');
  });

  it('手动指定优先于系统偏好', () => {
    expect(resolveTheme('day', true)).toBe('day');
    expect(resolveTheme('night', false)).toBe('night');
  });

  it('非法值一律退回默认的「跟随系统」', () => {
    expect(normalizePreference('dark')).toBe(DEFAULT_THEME_PREFERENCE);
    expect(normalizePreference(null)).toBe(DEFAULT_THEME_PREFERENCE);
    expect(normalizePreference('day')).toBe('day');
    expect(DEFAULT_THEME_PREFERENCE).toBe('auto');
  });

  it('类型守卫只认 day / night', () => {
    expect(isThemeMode('day')).toBe(true);
    expect(isThemeMode('night')).toBe(true);
    expect(isThemeMode('auto')).toBe(false);
  });

  it('两套主题都有地址栏颜色，且深色明显更暗', () => {
    expect(THEME_COLORS.day).toMatch(/^#[0-9a-f]{6}$/i);
    expect(THEME_COLORS.night).toMatch(/^#[0-9a-f]{6}$/i);
    const luminance = (hex: string) => Number.parseInt(hex.slice(1, 3), 16);
    expect(luminance(THEME_COLORS.night)).toBeLessThan(luminance(THEME_COLORS.day));
  });

  it('首帧脚本自带兜底：读不到偏好时落到 day，不会白屏或无主题', () => {
    expect(THEME_INIT_SCRIPT).toContain(THEME_STORAGE_KEY);
    expect(THEME_INIT_SCRIPT).toContain('prefers-color-scheme');
    expect(THEME_INIT_SCRIPT).toContain("dataset.theme='day'");
  });
});
