/**
 * 本地对话存储。
 *
 * 产品规则只有一条：**默认不保存**。所以这里所有"写"函数都先看开关，
 * 开关关着就什么都不写 —— 连一个空的 key 都不建。
 *
 * 关掉开关时会主动清空：用户按下"不保存"的那一刻，之前存的东西也应该
 * 一起消失，否则这个开关就成了摆设。
 */

import type { ChatMessage, ChatSession } from '@/lib/chat/types';

const SESSIONS_KEY = 'moodbox-chat-sessions-v1';
const SAVE_KEY = 'moodbox-chat-save-v1';
const MAX_SESSIONS = 12;

export function isSaveEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(SAVE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setSaveEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (enabled) {
      window.localStorage.setItem(SAVE_KEY, '1');
    } else {
      window.localStorage.removeItem(SAVE_KEY);
      window.localStorage.removeItem(SESSIONS_KEY);
    }
  } catch {
    // 隐私模式下写不进去，只是这一次不记住，不影响聊天
  }
}

export function newSessionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 用第一句用户消息当标题，长了自己截断 */
export function titleOf(messages: ChatMessage[]): string {
  const first = messages.find((message) => message.role === 'user')?.content.trim();
  if (!first) return '新的对话';
  return first.length > 18 ? `${first.slice(0, 18)}…` : first;
}

export function loadSessions(): ChatSession[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is ChatSession => {
        if (typeof item !== 'object' || item === null) return false;
        const node = item as Partial<ChatSession>;
        return (
          typeof node.id === 'string' &&
          typeof node.updatedAt === 'number' &&
          Array.isArray(node.messages)
        );
      })
      .slice(0, MAX_SESSIONS);
  } catch {
    return [];
  }
}

/** 只在开关开着时调用；写入失败（配额满 / 隐私模式）静默放弃 */
export function persistSession(session: ChatSession): ChatSession[] {
  if (typeof window === 'undefined' || !isSaveEnabled()) return [];
  if (session.messages.length === 0) return loadSessions();

  const rest = loadSessions().filter((item) => item.id !== session.id);
  const next = [session, ...rest]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_SESSIONS);

  try {
    window.localStorage.setItem(SESSIONS_KEY, JSON.stringify(next));
  } catch {
    // 存不下就不存，绝不因为存储失败打断对话
  }
  return next;
}

export function clearAllSessions(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(SESSIONS_KEY);
  } catch {
    /* 忽略 */
  }
}
