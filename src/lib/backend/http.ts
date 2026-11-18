import type { PostStatus } from '@/types';
import type { ContentBackend, PostDraft, ReplyDraft, StoryDraft } from '@/lib/backend/types';

/**
 * 远端实现（预留）。
 *
 * 这不是一个跑不通的占位符：只要把 `NEXT_PUBLIC_MOODBOX_API_BASE`
 * 指向一个按下面契约实现的 REST 服务，整套内容功能就会自动切到云端，
 * 页面代码一行都不用改。
 *
 * 约定的接口（全部 JSON，鉴权用 `Authorization: Bearer <token>`）：
 *
 *   GET    /stories                  → HealingStory[]
 *   POST   /stories                  → HealingStory
 *   PATCH  /stories/:id              → HealingStory
 *   DELETE /stories/:id              → 204
 *
 *   GET    /posts                    → SquarePost[]（管理员可见 pending）
 *   POST   /posts                    → SquarePost（发出即公开，服务端直接落 approved）
 *   PATCH  /posts/:id                → SquarePost（body: { status }）
 *   DELETE /posts/:id                → 204
 *   POST   /posts/:id/hugs           → SquarePost
 *   POST   /posts/:id/replies        → SquarePost
 *   DELETE /posts/:id/replies/:rid   → SquarePost
 *
 *   GET    /letters                  → HeartLetter[]
 *   POST   /letters                  → HeartLetter
 *   PATCH  /letters/:id              → HeartLetter（拆开）
 *   DELETE /letters/:id              → 204
 *
 *   GET    /capsules                 → TimeCapsule[]
 *   POST   /capsules                 → TimeCapsule
 *   PATCH  /capsules/:id             → TimeCapsule（记一次阅读）
 *   DELETE /capsules/:id             → 204
 *
 * 需要说明的是：真正上线时，**审核与自伤倾向识别必须放在服务端**，
 * 客户端的关键词检查只能作为体验层的第一道提示，不能作为唯一防线。
 */

export class BackendNotConfiguredError extends Error {
  constructor() {
    super('云端内容服务尚未配置。');
    this.name = 'BackendNotConfiguredError';
  }
}

export class BackendRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'BackendRequestError';
  }
}

export interface HttpBackendOptions {
  baseUrl: string;
  /** 返回当前会话的令牌；没有登录体系时返回 null 即可 */
  getToken?: () => string | null;
  /** 注入自定义 fetch，方便测试 */
  fetchImpl?: typeof fetch;
}

export function createHttpBackend(options: HttpBackendOptions): ContentBackend {
  // 先去掉首尾空白：环境变量里不小心多敲一个空格，也应该被当成"没配"，
  // 而不是拼出一个 ` ␣/stories` 这样的畸形地址再收到一个莫名其妙的 404。
  const base = options.baseUrl.trim().replace(/\/+$/, '');
  const doFetch = options.fetchImpl ?? globalThis.fetch?.bind(globalThis);

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!base) throw new BackendNotConfiguredError();
    if (!doFetch) throw new BackendNotConfiguredError();

    const token = options.getToken?.() ?? null;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await doFetch(`${base}${path}`, { ...init, headers });
    if (!response.ok) {
      let message = `请求失败（${response.status}）`;
      try {
        const payload = (await response.json()) as { message?: string };
        if (payload?.message) message = payload.message;
      } catch {
        // 响应不是 JSON，保持默认文案
      }
      throw new BackendRequestError(message, response.status);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  return {
    mode: 'http',

    listStories: () => request('/stories'),
    createStory: (draft: StoryDraft) =>
      request('/stories', { method: 'POST', body: JSON.stringify(draft) }),
    updateStory: (id, draft) =>
      request(`/stories/${id}`, { method: 'PATCH', body: JSON.stringify(draft) }),
    deleteStory: (id) => request(`/stories/${id}`, { method: 'DELETE' }),

    listPosts: (viewerId?: string) =>
      request(`/posts${viewerId ? `?viewer=${encodeURIComponent(viewerId)}` : ''}`),
    createPost: (draft: PostDraft) =>
      request('/posts', { method: 'POST', body: JSON.stringify(draft) }),
    setPostStatus: (id, status: PostStatus) =>
      request(`/posts/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    deletePost: (id) => request(`/posts/${id}`, { method: 'DELETE' }),
    deleteOwnPost: (id, visitorId) =>
      request(`/posts/${id}`, {
        method: 'DELETE',
        headers: { 'X-Moodbox-Visitor': visitorId },
      }),
    hugPost: (id, visitorId) =>
      request(`/posts/${id}/hugs`, {
        method: 'POST',
        headers: visitorId ? { 'X-Moodbox-Visitor': visitorId } : undefined,
      }),
    addReply: (postId, draft: ReplyDraft) =>
      request(`/posts/${postId}/replies`, { method: 'POST', body: JSON.stringify(draft) }),
    deleteReply: (postId, replyId) =>
      request(`/posts/${postId}/replies/${replyId}`, { method: 'DELETE' }),
    deleteOwnReply: (postId, replyId, visitorId) =>
      request(`/posts/${postId}/replies/${replyId}`, {
        method: 'DELETE',
        headers: { 'X-Moodbox-Visitor': visitorId },
      }),

    listLetters: () => request('/letters'),
    createLetter: (content: string) =>
      request('/letters', { method: 'POST', body: JSON.stringify({ content }) }),
    openLetter: (id) => request(`/letters/${id}`, { method: 'PATCH', body: '{}' }),
    deleteLetter: (id) => request(`/letters/${id}`, { method: 'DELETE' }),

    listCapsules: () => request('/capsules'),
    createCapsule: (content: string, openAt: string) =>
      request('/capsules', { method: 'POST', body: JSON.stringify({ content, openAt }) }),
    openCapsule: (id) => request(`/capsules/${id}`, { method: 'PATCH', body: '{}' }),
    deleteCapsule: (id) => request(`/capsules/${id}`, { method: 'DELETE' }),
  };
}
