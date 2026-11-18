'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { localBackend } from '@/lib/backend/local';
import type { ContentBackend, PostDraft, ReplyDraft } from '@/lib/backend/types';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/supabase-config';
import type { PostStatus, SquarePost, SquareReply } from '@/types';

/**
 * 树洞广场的 Supabase 实现。
 *
 * 设计上的三个关键决定：
 *
 * 1. **只有广场上云**。心事信箱、开心罐、内置故事仍然留在本机 IndexedDB ——
 *    它们是私密内容，上云需要先有真正的登录体系。所以这里返回的对象是
 *    「本地实现 + 广场部分被替换」，其余方法直接透传给 `localBackend`。
 *
 * 2. **一次都不直接用表**。客户端不 `from('square_posts').select()`，
 *    全部走 `moodbox_*` 这组 RPC。原因：匿名访客如果被允许直接写表，
 *    他就能自己把 `status` 改成 `approved`，也可以随意改别人的内容。
 *    表的 RLS 策略是「一条都不给」，读写只能通过 `security definer` 函数，
 *    函数内部再决定谁能做什么。
 *
 * 3. **审核在服务端判**。`moodbox_square_review` / `_delete` 都会校验口令，
 *    前端绕过去也删不掉东西。浏览器里那层口令输入框只负责"界面要不要显示
 *    这些按钮"。
 */

/** Supabase 返回的时间是 `2026-11-18T02:14:43.123+00:00`，统一成 `...Z`。 */
function normalizeIso(value: unknown): string {
  const raw = typeof value === 'string' ? value : '';
  if (!raw) return new Date().toISOString();
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function toReply(raw: unknown): SquareReply {
  const row = (raw ?? {}) as Record<string, unknown>;
  return {
    id: String(row.id ?? ''),
    nickname: String(row.nickname ?? '匿名的人'),
    content: String(row.content ?? ''),
    createdAt: normalizeIso(row.createdAt ?? row.created_at),
    needsSupport: Boolean(row.needsSupport ?? row.needs_support ?? false),
  };
}

/** 把 RPC 返回的 jsonb 收敛成 `SquarePost`，不信任任何字段缺失。 */
function toPost(raw: unknown): SquarePost {
  const row = (raw ?? {}) as Record<string, unknown>;
  const status = row.status;
  return {
    id: String(row.id ?? ''),
    content: String(row.content ?? ''),
    nickname: String(row.nickname ?? '匿名的人'),
    createdAt: normalizeIso(row.createdAt ?? row.created_at),
    status: status === 'pending' || status === 'rejected' ? (status as PostStatus) : 'approved',
    hugs: Number.isFinite(Number(row.hugs)) ? Math.max(0, Number(row.hugs)) : 0,
    replies: Array.isArray(row.replies) ? row.replies.map(toReply) : [],
    needsSupport: Boolean(row.needsSupport ?? row.needs_support ?? false),
    reviewedAt: row.reviewedAt ? normalizeIso(row.reviewedAt) : undefined,
  };
}

/**
 * 把 PostgREST / Postgres 的错误翻译成能看懂的中文。
 *
 * 接数据库最容易踩的坑就是"配错了却只看到 Not Found"，
 * 所以这里把几种典型情况单独识别出来，直接告诉用户该去做什么。
 */
export function translateSupabaseError(error: unknown): Error {
  const raw = error as { message?: string; details?: string; code?: string; hint?: string } | null;
  const message = [raw?.message, raw?.details, raw?.hint].filter(Boolean).join(' ');
  const code = raw?.code ?? '';

  if (code === 'PGRST202' || /could not find the function|function .* does not exist/i.test(message)) {
    return new Error('Supabase 里还没创建 moodbox_* 函数，请先在 SQL Editor 执行 supabase/schema.sql。');
  }
  if (code === '42P01' || /relation .* does not exist/i.test(message)) {
    return new Error('Supabase 里还没有 square_posts / square_replies 表，请先执行 supabase/schema.sql。');
  }
  if (code === '42501' || /permission denied|row-level security/i.test(message)) {
    return new Error('这个操作需要管理员权限（口令没通过校验），或者数据库策略还没配置好。');
  }
  if (/invalid api key|jwt|apikey/i.test(message)) {
    return new Error('Supabase 的 anon key 不对，请检查 NEXT_PUBLIC_SUPABASE_ANON_KEY。');
  }
  if (/failed to fetch|network|fetch failed|err_name_not_resolved/i.test(message)) {
    return new Error('连不上 Supabase，请检查网络，以及项目是否因为长期不用被暂停了。');
  }
  // 自定义函数里 raise exception 的文案本来就是给人看的，直接透传
  if (message && !/^PGRST|^42|^23/.test(code)) return new Error(message);
  return new Error(message || '云端请求失败，请稍后再试。');
}

export interface SupabaseBackendOptions {
  /** 当前标签页的管理员令牌；没有解锁时返回 null */
  getToken?: () => string | null;
}

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL.replace(/\/+$/, ''), SUPABASE_ANON_KEY, {
      auth: {
        // 广场是匿名内容，不需要登录态；关掉自动刷新可以少两个定时器和一次本地存储读写
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { headers: { 'x-application-name': 'moodbox' } },
    });
  }
  return client;
}

export function createSupabaseBackend(options: SupabaseBackendOptions = {}): ContentBackend {
  const token = (): string | null => options.getToken?.() ?? null;

  async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await getClient().rpc(fn, args);
    if (error) throw translateSupabaseError(error);
    return data as T;
  }

  return {
    mode: 'supabase',

    /* ---------------- 广场：走 Supabase ---------------- */

    async listPosts() {
      const data = await rpc<unknown[]>('moodbox_square_list', { p_token: token() });
      return (Array.isArray(data) ? data : []).map(toPost);
    },

    async createPost(draft: PostDraft) {
      // 注意：`status` 不由客户端传。数据库函数里写死了 `pending`，
      // 所以就算有人改了前端代码，也没法跳过审核。
      return toPost(
        await rpc('moodbox_square_create', {
          p_content: draft.content,
          p_nickname: draft.nickname?.trim() || null,
          p_needs_support: draft.needsSupport ?? false,
        }),
      );
    },

    async setPostStatus(id: string, status: PostStatus) {
      return toPost(
        await rpc('moodbox_square_review', { p_id: id, p_status: status, p_token: token() }),
      );
    },

    async deletePost(id: string) {
      await rpc('moodbox_square_delete', { p_id: id, p_token: token() });
    },

    async hugPost(id: string) {
      return toPost(await rpc('moodbox_square_hug', { p_id: id }));
    },

    async addReply(postId: string, draft: ReplyDraft) {
      return toPost(
        await rpc('moodbox_square_reply', {
          p_post_id: postId,
          p_content: draft.content,
          p_nickname: draft.nickname?.trim() || null,
          p_needs_support: draft.needsSupport ?? false,
        }),
      );
    },

    async deleteReply(postId: string, replyId: string) {
      return toPost(
        await rpc('moodbox_square_delete_reply', {
          p_post_id: postId,
          p_reply_id: replyId,
          p_token: token(),
        }),
      );
    },

    async verifyAdmin(candidate: string) {
      try {
        return Boolean(await rpc<boolean>('moodbox_admin_check', { p_token: candidate }));
      } catch {
        // 函数还没建好 / 网络不通时，不要把用户卡在"口令错误"上，
        // 交给上层的错误提示（listPosts 会给出具体原因）
        return false;
      }
    },

    /* ---------------- 其余内容：仍然只在本机 ---------------- */

    listStories: localBackend.listStories,
    createStory: localBackend.createStory,
    updateStory: localBackend.updateStory,
    deleteStory: localBackend.deleteStory,

    listLetters: localBackend.listLetters,
    createLetter: localBackend.createLetter,
    openLetter: localBackend.openLetter,
    deleteLetter: localBackend.deleteLetter,

    listCapsules: localBackend.listCapsules,
    createCapsule: localBackend.createCapsule,
    openCapsule: localBackend.openCapsule,
    deleteCapsule: localBackend.deleteCapsule,
  };
}
