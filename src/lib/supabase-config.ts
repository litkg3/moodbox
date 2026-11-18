/**
 * Supabase 连接配置。
 *
 * 这个文件刻意不 import 任何东西 —— `lib/db.ts` 与 `lib/backend/*` 都要读它，
 * 一旦它反过来依赖业务模块，就会形成循环引用。
 *
 * 两个变量都是 `NEXT_PUBLIC_` 前缀：它们会被打进浏览器包，本来就该是公开的。
 * Supabase 的 anon key 就是设计成可以放在前端的 —— 真正的安全边界是 RLS 与
 * `security definer` 函数（见 supabase/schema.sql），不是这把 key。
 *
 * ⚠️ 绝对不要把 `service_role` key 写进这里，那个 key 会绕过全部 RLS。
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';

export const SUPABASE_URL = url;
export const SUPABASE_ANON_KEY = anonKey;

/**
 * 是否已经配好 Supabase。
 *
 * 校验得比"非空"严格一点：环境变量里贴错东西（比如把 key 填到 url 上、
 * 或者只复制了一半）应该被当成"没配"，直接退回本地模式，
 * 而不是让用户看到一连串莫名其妙的网络错误。
 */
export function isSupabaseConfigured(): boolean {
  return /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url) && anonKey.length > 40;
}

/** 给界面用的提示：现在广场的数据存在哪。 */
export function describeSupabase(): { configured: boolean; project: string } {
  return {
    configured: isSupabaseConfigured(),
    project: isSupabaseConfigured() ? (url.match(/^https:\/\/([^.]+)\./)?.[1] ?? 'supabase') : '',
  };
}

/**
 * 强制走本机的开关（调试 / 离线演示 / 端到端测试用）。
 *
 * 在浏览器控制台执行一次、刷新即可：
 *   localStorage.setItem('moodbox-force-local', '1')
 * 清除：
 *   localStorage.removeItem('moodbox-force-local')
 *
 * 为什么会有这个东西：
 * - 现场演示时网络不通，云端读写会一直报错，但你又不想改代码重新构建；
 * - e2e 测试必须可重复：不管开发者有没有配 Supabase，都应该跑同一套断言。
 *
 * 它**不会**削弱云端安全：云端对帖子的保护在数据库的 RLS 与函数里，
 * 这个开关只决定"这个浏览器把数据写到哪"，不影响别人能看到什么。
 */
export const FORCE_LOCAL_KEY = 'moodbox-force-local';

export function isLocalModeForced(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(FORCE_LOCAL_KEY) === '1';
  } catch {
    return false;
  }
}
