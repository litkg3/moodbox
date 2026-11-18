import { getDB, toStorageError } from '@/lib/db';
import { createId } from '@/lib/utils';
import type { PostStatus, SquarePost, SquareReply } from '@/types';

export interface PostDraft {
  content: string;
  nickname?: string;
  /** 命中自伤 / 自杀相关表达时由上层传入，仅用于提醒管理员 */
  needsSupport?: boolean;
}

function sortPosts(posts: SquarePost[]): SquarePost[] {
  return [...posts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function sortReplies(replies: SquareReply[]): SquareReply[] {
  return [...replies].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function listPosts(): Promise<SquarePost[]> {
  try {
    const db = await getDB();
    return sortPosts(await db.getAllFromIndex('posts', 'by-created'));
  } catch (error) {
    throw toStorageError(error);
  }
}

/**
 * 发一条帖子。
 *
 * 关键的产品决定：**默认进入待审核队列，而不是直接公开**。
 * 审核由本地管理员完成（见 lib/admin.ts）。这是需求里明确的流程，
 * 也避免任何人把别人的心事当成公共内容随手发出去。
 */
export async function createPost(draft: PostDraft): Promise<SquarePost> {
  const post: SquarePost = {
    id: createId('post'),
    content: draft.content.trim(),
    nickname: draft.nickname?.trim() || '匿名的人',
    createdAt: new Date().toISOString(),
    status: 'pending',
    hugs: 0,
    replies: [],
    needsSupport: draft.needsSupport ?? false,
  };
  try {
    const db = await getDB();
    await db.put('posts', post);
    return post;
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

/** 抱一下。同一条帖子在本地可以重复抱 —— 这里不做去重，只诚实地累加。 */
export async function hugPost(id: string): Promise<SquarePost> {
  try {
    const db = await getDB();
    const existing = await db.get('posts', id);
    if (!existing) throw new Error('这条帖子已经不在了。');
    const next: SquarePost = { ...existing, hugs: existing.hugs + 1 };
    await db.put('posts', next);
    return next;
  } catch (error) {
    throw toStorageError(error);
  }
}

export async function addReply(
  postId: string,
  draft: { content: string; nickname?: string; needsSupport?: boolean },
): Promise<SquarePost> {
  try {
    const db = await getDB();
    const existing = await db.get('posts', postId);
    if (!existing) throw new Error('这条帖子已经不在了。');
    const reply: SquareReply = {
      id: createId('reply'),
      nickname: draft.nickname?.trim() || '匿名的人',
      content: draft.content.trim(),
      createdAt: new Date().toISOString(),
      needsSupport: draft.needsSupport ?? false,
    };
    const next: SquarePost = { ...existing, replies: [...existing.replies, reply] };
    await db.put('posts', next);
    return next;
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
