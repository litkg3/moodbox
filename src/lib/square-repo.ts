import { getDB, toStorageError } from '@/lib/db';
import { EMPTY_USAGE, canPublish, dayKeyOf, quotaMessage, type QuotaUsage } from '@/lib/quota';
import { createId } from '@/lib/utils';
import type { PostStatus, SquarePost, SquareReply } from '@/types';

export interface PostDraft {
  content: string;
  nickname?: string;
  /** 落空昵称时用的匿名代号（形如「匿名·K7Q2」） */
  alias?: string;
  /** 命中自伤 / 自杀相关表达时由上层传入，仅用于提醒管理员 */
  needsSupport?: boolean;
  /** 访客的稳定标识，只用于判断「这条能不能由本人删」 */
  visitorId?: string;
  /** IP 归属地（城市级），仅用于展示 */
  region?: string | null;
}

/** 树洞广场昵称上限：16 个字（与表单 maxLength 对齐，接口层再兜一道）。 */
export const MAX_NICKNAME_LENGTH = 16;
export const DEFAULT_NICKNAME = '匿名的人';

/** 只去空格与截断，不做兜底：留空时由调用方决定用什么代号。 */
export function trimNickname(nickname?: string | null): string {
  return (nickname ?? '').trim().slice(0, MAX_NICKNAME_LENGTH);
}

/** 统一的昵称收敛：去空格 → 截断到 16 字 → 空值回落到「匿名的人」。 */
export function normalizeNickname(nickname?: string | null): string {
  return trimNickname(nickname) || DEFAULT_NICKNAME;
}

/**
 * 作者显示名：填了昵称就用昵称，没填就用匿名代号（带 4 位后缀）。
 * 后缀是"同一个 IP 的同一个人"，不涉及任何身份信息。
 */
export function resolveAuthorName(nickname?: string | null, alias?: string | null): string {
  return trimNickname(nickname) || trimNickname(alias) || DEFAULT_NICKNAME;
}


function sortPosts(posts: SquarePost[]): SquarePost[] {
  return [...posts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function sortReplies(replies: SquareReply[]): SquareReply[] {
  return [...replies].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * 读列表。
 *
 * `viewerId` 是当前访客的稳定标识，用来标出「这条是我发的」。
 * 云端模式下这件事由数据库函数完成（客户端拿不到别人的标识），
 * 本机模式就在这一层算 —— 两边对界面暴露的字段是一致的。
 */
export async function listPosts(viewerId?: string): Promise<SquarePost[]> {
  try {
    const db = await getDB();
    const posts = await db.getAllFromIndex('posts', 'by-created');
    return sortPosts(posts).map((post) => ({
      ...post,
      visitorId: undefined,
      mine: Boolean(viewerId && post.visitorId === viewerId),
      replies: post.replies.map((reply) => ({
        ...reply,
        visitorId: undefined,
        mine: Boolean(viewerId && reply.visitorId === viewerId),
      })),
    }));
  } catch (error) {
    throw toStorageError(error);
  }
}

/**
 * 发一条帖子。
 *
 * 发出即公开：广场是给人倾诉的地方，卡在「待审核」里等于劝退。
 * 现在由管理员事后删除（见 lib/admin.ts）来兜底不合适的内容。
 */
export async function createPost(draft: PostDraft): Promise<SquarePost> {
  // 每天最多 3 条。判在写入之前，且用的是同一份统计函数，
  // 与界面上的「今天还能发 N 条」不会互相矛盾。
  const usage = await getQuotaUsage(draft.visitorId);
  if (!canPublish('post', usage)) throw new Error(quotaMessage('post'));
  const post: SquarePost = {
    id: createId('post'),
    content: draft.content.trim(),
    nickname: resolveAuthorName(draft.nickname, draft.alias),
    createdAt: new Date().toISOString(),
    status: 'approved',
    hugs: 0,
    replies: [],
    needsSupport: draft.needsSupport ?? false,
    visitorId: draft.visitorId,
    region: draft.region ?? undefined,
  };
  try {
    const db = await getDB();
    await db.put('posts', post);
    return { ...post, mine: true };
  } catch (error) {
    throw toStorageError(error);
  }
}

export async function setPostStatus(id: string, status: PostStatus): Promise<SquarePost> {
  try {
    const db = await getDB();
    const existing = await db.get('posts', id);
    if (!existing) throw new Error('这条帖子已经不在了。');
    const next: SquarePost = { ...existing, status, reviewedAt: new Date().toISOString() };
    await db.put('posts', next);
    return next;
  } catch (error) {
    throw toStorageError(error);
  }
}

export async function deletePost(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete('posts', id);
  } catch (error) {
    throw toStorageError(error);
  }
}

/**
 * 今天已经发了多少（本机统计）。
 *
 * 数两样东西：帖子自己（`visitorId` 对得上的）和回复（帖子里的 `replies`）。
 * 删掉的记录在 IndexedDB 里已经不存在，所以「删了重发」在本机模式下
 * 确实会退回额度 —— 这是本机模式的固有限制，文档里写清楚了，
 * 云端模式下额度由数据库统计，删帖不退。
 */
export async function getQuotaUsage(visitorId?: string, now: Date = new Date()): Promise<QuotaUsage> {
  if (!visitorId) return { ...EMPTY_USAGE };
  const today = dayKeyOf(now.toISOString());
  try {
    const db = await getDB();
    const posts = await db.getAllFromIndex('posts', 'by-created');
    let postCount = 0;
    let replyCount = 0;
    for (const post of posts) {
      if (post.visitorId === visitorId && dayKeyOf(post.createdAt) === today) postCount += 1;
      for (const reply of post.replies) {
        if (reply.visitorId === visitorId && dayKeyOf(reply.createdAt) === today) replyCount += 1;
      }
    }
    return { posts: postCount, replies: replyCount };
  } catch (error) {
    throw toStorageError(error);
  }
}

/**
 * 抱一下。
 *
 * 一个访客对同一条只能抱一次 —— 本机模式下这台设备就是一个访客，
 * 所以直接在帖子上记 `hugged`，第二次点不再累加（幂等返回原样）。
 */
export async function hugPost(id: string): Promise<SquarePost> {
  try {
    const db = await getDB();
    const existing = await db.get('posts', id);
    if (!existing) throw new Error('这条帖子已经不在了。');
    if (existing.hugged) return existing;
    const next: SquarePost = { ...existing, hugs: existing.hugs + 1, hugged: true };
    await db.put('posts', next);
    return next;
  } catch (error) {
    throw toStorageError(error);
  }
}

export interface ReplyDraft {
  content: string;
  nickname?: string;
  /** 落空昵称时用的匿名代号（形如「匿名·K7Q2」） */
  alias?: string;
  needsSupport?: boolean;
  visitorId?: string;
  region?: string | null;
}

/** 回复上限：界面、接口层、数据库三处一致，都是 200 字。 */
export const MAX_REPLY_LENGTH = 200;

/** 按字符（而不是 UTF-16 单元）数长度，emoji 算一个字。 */
export function charLength(input: string): number {
  return Array.from(input).length;
}

export async function addReply(postId: string, draft: ReplyDraft): Promise<SquarePost> {
  const content = draft.content.trim();
  if (!content) throw new Error('回复不能是空的。');
  if (charLength(content) > MAX_REPLY_LENGTH) {
    throw new Error(`回复最多 ${MAX_REPLY_LENGTH} 字，再精简一点吧。`);
  }
  // 每天最多 20 条回复
  const usage = await getQuotaUsage(draft.visitorId);
  if (!canPublish('reply', usage)) throw new Error(quotaMessage('reply'));
  try {
    const db = await getDB();
    const existing = await db.get('posts', postId);
    if (!existing) throw new Error('这条帖子已经不在了。');
    const reply: SquareReply = {
      id: createId('reply'),
      nickname: resolveAuthorName(draft.nickname, draft.alias),
      content,
      createdAt: new Date().toISOString(),
      needsSupport: draft.needsSupport ?? false,
      visitorId: draft.visitorId,
      region: draft.region ?? undefined,
    };
    const next: SquarePost = { ...existing, replies: [...existing.replies, reply] };
    await db.put('posts', next);
    return {
      ...next,
      mine: Boolean(draft.visitorId && existing.visitorId === draft.visitorId),
      replies: next.replies.map((item) => ({
        ...item,
        mine: Boolean(draft.visitorId && item.visitorId === draft.visitorId),
      })),
    };
  } catch (error) {
    throw toStorageError(error);
  }
}

export async function deleteReply(postId: string, replyId: string): Promise<SquarePost> {
  try {
    const db = await getDB();
    const existing = await db.get('posts', postId);
    if (!existing) throw new Error('这条帖子已经不在了。');
    const next: SquarePost = {
      ...existing,
      replies: existing.replies.filter((reply) => reply.id !== replyId),
    };
    await db.put('posts', next);
    return next;
  } catch (error) {
    throw toStorageError(error);
  }
}

/**
 * 匿名游客删自己的帖子。
 *
 * 关键点是「自己的」：只有发布时留下的标识与当前访问者一致才允许删。
 * 本机模式下这层校验发生在本地（同一台设备本来也只有你自己），
 * 云端模式下同样的判断由数据库函数完成 —— 那一层才是真正的边界。
 */
export async function deleteOwnPost(id: string, visitorId: string): Promise<void> {
  if (!visitorId) throw new Error('没能确认这是你发的帖子。');
  try {
    const db = await getDB();
    const existing = await db.get('posts', id);
    if (!existing) throw new Error('这条帖子已经不在了。');
    if (existing.visitorId !== visitorId) {
      throw new Error('这条帖子不是你发的，删不了。');
    }
    await db.delete('posts', id);
  } catch (error) {
    throw toStorageError(error);
  }
}

/** 匿名游客删自己的回复。 */
export async function deleteOwnReply(
  postId: string,
  replyId: string,
  visitorId: string,
): Promise<SquarePost> {
  if (!visitorId) throw new Error('没能确认这是你写的回复。');
  try {
    const db = await getDB();
    const existing = await db.get('posts', postId);
    if (!existing) throw new Error('这条帖子已经不在了。');
    const target = existing.replies.find((reply) => reply.id === replyId);
    if (!target) throw new Error('这条回复已经不在了。');
    if (target.visitorId !== visitorId) {
      throw new Error('这条回复不是你写的，删不了。');
    }
    const next: SquarePost = {
      ...existing,
      replies: existing.replies.filter((reply) => reply.id !== replyId),
    };
    await db.put('posts', next);
    return {
      ...next,
      mine: Boolean(existing.visitorId === visitorId),
      replies: next.replies.map((reply) => ({
        ...reply,
        mine: Boolean(reply.visitorId === visitorId),
      })),
    };
  } catch (error) {
    throw toStorageError(error);
  }
}
