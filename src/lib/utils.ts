/** 极简 className 合并（避免为一个小函数引入 clsx 依赖）。 */
export type ClassValue = string | false | null | undefined;

export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ');
}

/** 生成一个足够唯一的 id（浏览器环境）。 */
export function createId(prefix = 'mb'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

/** 数组随机取一项，空数组返回 null。 */
export function pickRandom<T>(items: readonly T[]): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)] ?? null;
}

/** Fisher–Yates 洗牌，返回新数组，不修改入参。 */
export function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const current = copy[i];
    const target = copy[j];
    if (current === undefined || target === undefined) continue;
    copy[i] = target;
    copy[j] = current;
  }
  return copy;
}

/** 截断长文本，用于卡片预览。 */
export function truncate(text: string, max = 90): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized;
}
