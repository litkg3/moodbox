import { readAdminToken } from '@/lib/admin-token';
import { createHttpBackend } from '@/lib/backend/http';
import { localBackend } from '@/lib/backend/local';
import { createSupabaseBackend } from '@/lib/backend/supabase';
import type { ContentBackend } from '@/lib/backend/types';
import { isLocalModeForced, isSupabaseConfigured } from '@/lib/supabase-config';

export type { ContentBackend, PostDraft, ReplyDraft, StoryDraft } from '@/lib/backend/types';
export { BackendNotConfiguredError, BackendRequestError } from '@/lib/backend/http';
export { translateSupabaseError } from '@/lib/backend/supabase';

/**
 * 选哪一个内容后端。
 *
 * 优先级：
 * 1. 配了 `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
 *    → 树洞广场走 Supabase，心事信箱 / 开心罐 / 故事仍留本机；
 * 2. 配了 `NEXT_PUBLIC_MOODBOX_API_BASE` → 走自建 REST（预留）；
 * 3. 都没配 → 全部留在本机（默认）。
 *
 * 环境变量在构建时就被内联成常量，所以一个会话里只会构建一次后端实例。
 */
let cached: ContentBackend | null = null;

/**
 * 这个浏览器到底走不走云端。
 *
 * = 配好了 Supabase 环境变量 且 没有被 `moodbox-force-local` 强制退回本机。
 * 界面上的措辞（"已接入 Supabase" / "仅在本机"）也要用它，否则会出现
 * "写着一回事、做的是另一回事"。
 *
 * ⚠️ 只能在浏览器里调用（要读 localStorage）。
 */
export function isCloudSquareMode(): boolean {
  return isSupabaseConfigured() && !isLocalModeForced();
}

export function getContentBackend(): ContentBackend {
  if (cached) return cached;

  if (isCloudSquareMode()) {
    cached = createSupabaseBackend({ getToken: readAdminToken });
    return cached;
  }

  const base = (process.env.NEXT_PUBLIC_MOODBOX_API_BASE ?? '').trim();
  cached = base ? createHttpBackend({ baseUrl: base }) : localBackend;
  return cached;
}

/** 供界面展示：告诉用户数据到底存在哪，不制造"已经云同步"的错觉。 */
export function describeBackend(): {
  mode: ContentBackend['mode'];
  label: string;
  detail: string;
} {
  const backend = getContentBackend();

  /*
   * 面向用户的措辞只回答一件事：「我写的东西，别人看得见吗？」
   * 以前这里写的是「已接入 Supabase 数据库」「存在 IndexedDB 里」——
   * 技术名词对用户没有任何帮助，还会和关于页的「不会上传」直接打架。
   */
  if (backend.mode === 'supabase') {
    return {
      mode: 'supabase',
      label: '广场上的帖子所有人都能看见',
      detail: '你发的帖子会公开发布，带大致位置（如果你自己选了）。其余记录仍只在这台设备上。',
    };
  }

  if (backend.mode === 'http') {
    return {
      mode: 'http',
      label: '广场上的帖子所有人都能看见',
      detail: '其余记录仍只在这台设备上。',
    };
  }

  return {
    mode: 'local',
    label: '这些帖子只存在这台设备上',
    detail: '换一台设备就看不到了，别人也看不见。',
  };
}
