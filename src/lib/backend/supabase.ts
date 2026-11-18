'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { localBackend } from '@/lib/backend/local';
import type { ContentBackend, PostDraft, ReplyDraft } from '@/lib/backend/types';
import { resolveAuthorName } from '@/lib/square-repo';
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
    mine: Boolean(row.mine),
    region: typeof row.region === 'string' && row.region ? row.region : undefined,
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
    mine: Boolean(row.mine),
    hugged: Boolean(row.hugged),
    region: typeof row.region === 'string' && row.region ? row.region : undefined,
  };
}

/**
 * 把 PostgREST 返回的错误体收敛成纯数据（`{ code, text }`）。
 *
 * 真实错误可能是普通对象，也可能是被包过的 `Error` 实例，字段位置并不统一，
 * 所以统一走 `pickText` 逐个取，别的地方只认这个结果。
 */
function errorParts(error: unknown): { code: string; text: string } {
  if (!error) return { code: '', text: '' };
  const source = error as Record<string, unknown>;
  return {
    code: pickText(source, 'code'),
    text: [pickText(source, 'message'), pickText(source, 'details'), pickText(source, 'hint')]
      .filter(Boolean)
      .join(' '),
  };
}

/** 从错误对象里取一个字符串字段；没有或不是字符串都当空。 */
function pickText(source: Record<string, unknown>, key: string): string {
  if (!(key in source)) return '';
  const value = source[key];
  return typeof value === 'string' ? value : '';
}

/** PostgREST 找不到"这个签名的函数"时给这个码；旧库少一个参数就会报它。 */
const FUNCTION_NOT_FOUND = 'PGRST202';

/** 这个错误是不是"函数没有这个签名"（而不是网络 / 权限 / 业务异常）。 */
export function isFunctionMissing(error: unknown): boolean {
  const { code, text } = errorParts(error);
  if (code === FUNCTION_NOT_FOUND) return true;
  return /could not find the function/i.test(text);
}

/** 这个错误是不是网络层面的（断网、域名解析不了、项目被暂停）。 */
export function isNetworkError(error: unknown): boolean {
  const { text } = errorParts(error);
  return /failed to fetch|networkerror|network request failed|fetch failed|err_name_not_resolved|load failed/i.test(
    text,
  );
}

/**
 * 把 PostgREST / Postgres 的错误翻译成能看懂的中文。
 *
 * 接数据库最容易踩的坑就是"配错了却只看到 Not Found"，
 * 所以这里把几种典型情况单独识别出来，直接告诉用户该去做什么。
 */
export function translateSupabaseError(error: unknown): Error {
  const { code, text: message } = errorParts(error);

  if (isFunctionMissing(error)) {
    return new Error(
      'Supabase 里还没创建 moodbox_* 函数（或版本偏旧）。请在 SQL Editor 里把 supabase/schema.sql 整段重新执行一次，执行完以后刷新页面。',
    );
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
  if (isNetworkError(error) || /^failed to fetch$/i.test(message)) {
    return new Error('连不上 Supabase，请检查网络，以及项目是否因为长期不用被暂停了。');
  }
  // 自定义函数里 raise exception 的文案本来就是给人看的，直接透传
  if (message && !/^PGRST|^42|^23/.test(code)) return new Error(message);
  return new Error(message || '云端请求失败，请稍后再试。');
}

/** 本机提示的兜底文案里会出现这句，用来认出"是配额问题"而不是别的失败。 */
const QUOTA_HINT = /今天已经(发满|回复满)|每天.*条/u;

/**
 * 判断一个错误是不是「今天发满了」。
 *
 * 云端与本地给的是同一句中文（`lib/quota.ts` 的 `quotaMessage`），
 * 所以按文案匹配就够了；这里不另造错误码，免得两套说法漂移。
 */
export function isQuotaError(error: unknown): boolean {
  if (error instanceof Error) return QUOTA_HINT.test(error.message);
  return QUOTA_HINT.test(errorParts(error).text);
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
    if (error) {
      throw translateSupabaseError(error);
    }
    return data as T;
  }

  /** 原样把错误抛出去（rpc 会把错误翻译成中文，降级判断要看原始 code）。 */
  async function rawRpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await getClient().rpc(fn, args);
    if (error) throw error;
    return data as T;
  }

  /**
   * 可选参数的 RPC：库里的函数可能还没有这个参数（比如旧版 schema 的拥抱函数）。
   *
   * 客户端没法可靠地"先查库有几个签名"（那要走 pg_catalog，anon 未必有权限），
   * 所以按参数多少从新到旧逐个试，但只有「函数签名不存在」才降级。
   *
   * ⚠️ 这里的错误必须**原样**传下去，不能先用 `translateSupabaseError` 包一层：
   * 翻译会丢掉 `code`，降级判断就再也认不出 PGRST202 了（这个坑踩过）。
   * 网络错误也要先排除 —— 断网时 fetch 报的是 `TypeError: Failed to fetch`，
   * 名字里就带 "fetch"，很容易被误判成 PostgREST 的报错。
   */
  async function rpcFallback<T>(attempts: Array<() => Promise<T>>): Promise<T> {
    let missing: unknown = null;
    for (const attempt of attempts) {
      try {
        return await attempt();
      } catch (error) {
        if (!isFunctionMissing(error) || isNetworkError(error)) {
          throw translateSupabaseError(error);
        }
        missing = error;
      }
    }
    // 所有签名都找不到：确实没建好（或版本差太多），交给翻译说清楚
    throw translateSupabaseError(
      missing ?? { code: 'PGRST202', message: 'Could not find the function (unknown)' },
    );
  }

  return {
    mode: 'supabase',

    /* ---------------- 广场：走 Supabase ---------------- */

    async listPosts(viewerId?: string) {
      const data = await rpc<unknown[]>('moodbox_square_list', {
        p_token: token(),
        p_visitor: viewerId ?? null,
      });
      return (Array.isArray(data) ? data : []).map(toPost);
    },

    /**
     * 今天的额度用量。
     *
     * 统计在数据库里做（`moodbox_quota`），因为只有服务端看得见
     * 「同一个 IP 今天一共发了多少条」—— 本地算的话，清掉浏览器存储就能重置。
     * 函数还没建（旧版 schema）时退回全零：界面不显示剩余额度，
     * 但发帖时服务端仍会拦，不会因此放行。
     */
    async getQuotaUsage(visitorId?: string) {
      if (!visitorId) return { posts: 0, replies: 0 };
      try {
        const data = await rawRpc<unknown>('moodbox_quota', { p_visitor: visitorId });
        const row = (data ?? {}) as Record<string, unknown>;
        return { posts: Number(row.posts ?? 0), replies: Number(row.replies ?? 0) };
      } catch (error) {
        if (isFunctionMissing(error) || isNetworkError(error)) return { posts: 0, replies: 0 };
        // 其他错误（权限、连不上）也不该让整个页面挂掉，交给发帖时再报
        return { posts: 0, replies: 0 };
      }
    },

    async createPost(draft: PostDraft) {
      // 状态不由客户端传：数据库函数里写死了 `approved`。
      // 每日 3 条的额度也在同一个函数里数（moodbox_quota），前端绕不过去。
      const created = toPost(
        await rpc('moodbox_square_create', {
          p_content: draft.content,
          p_nickname: resolveAuthorName(draft.nickname, draft.alias),
          p_needs_support: draft.needsSupport ?? false,
          p_visitor: draft.visitorId ?? null,
          p_region: draft.region ?? null,
        }),
      );
      // 刚发出去的那条一定是自己的，不必等下一次刷新
      return { ...created, mine: true };
    },

    async setPostStatus(id: string, status: PostStatus) {
      return toPost(
        await rpc('moodbox_square_review', { p_id: id, p_status: status, p_token: token() }),
      );
    },

    async deletePost(id: string) {
      await rpc('moodbox_square_delete', { p_id: id, p_token: token() });
    },

    async hugPost(id: string, visitorId?: string) {
      /*
       * 带 p_visitor 的签名是「一个 IP 只能抱一次」的前提；
       * 库还是旧版（只有 p_id）时就退回单参数调用，先让人抱上，
       * 只是这时候服务端没法去重。两种情况都只吞「函数签名不存在」。
       */
      const post = await rpcFallback([
        () => rawRpc<unknown>('moodbox_square_hug', { p_id: id, p_visitor: visitorId ?? null }),
        () => rawRpc<unknown>('moodbox_square_hug', { p_id: id }),
      ]);
      return toPost(post);
    },

    async addReply(postId: string, draft: ReplyDraft) {
      const next = toPost(
        await rpc('moodbox_square_reply', {
          p_post_id: postId,
          p_content: draft.content,
          p_nickname: resolveAuthorName(draft.nickname, draft.alias),
          p_needs_support: draft.needsSupport ?? false,
          p_visitor: draft.visitorId ?? null,
          p_region: draft.region ?? null,
        }),
      );
      return {
        ...next,
        replies: next.replies.map((reply, index) =>
          index === next.replies.length - 1 ? { ...reply, mine: true } : reply,
        ),
      };
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

    async deleteOwnPost(id: string, visitorId: string) {
      await rpc('moodbox_square_delete_own', { p_id: id, p_visitor: visitorId });
    },

    async deleteOwnReply(postId: string, replyId: string, visitorId: string) {
      return toPost(
        await rpc('moodbox_square_delete_own_reply', {
          p_post_id: postId,
          p_reply_id: replyId,
          p_visitor: visitorId,
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
