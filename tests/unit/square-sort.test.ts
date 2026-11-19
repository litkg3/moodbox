import { describe, expect, it } from 'vitest';
import { sortPostsForView } from '@/lib/square-repo';
import type { SquarePost } from '@/types';

function post(id: string, createdAt: string, hugs: number): SquarePost {
  return {
    id,
    content: `第 ${id} 条`,
    nickname: '匿名',
    createdAt,
    status: 'approved',
    hugs,
    replies: [],
    needsSupport: false,
  };
}

describe('广场排序', () => {
  const posts = [
    post('a', '2026-11-19T08:00:00.000Z', 2),
    post('b', '2026-11-19T10:00:00.000Z', 8),
    post('c', '2026-11-19T09:00:00.000Z', 0),
  ];

  it('默认按时间倒序：越新越靠上', () => {
    expect(sortPostsForView(posts, 'time').map((item) => item.id)).toEqual(['b', 'c', 'a']);
  });

  it('按热度排序：拥抱多的靠上', () => {
    expect(sortPostsForView(posts, 'hug').map((item) => item.id)).toEqual(['b', 'a', 'c']);
  });

  it('热度相同时回落到时间，不会每次刷新乱跳', () => {
    const tied = [
      post('old', '2026-11-19T08:00:00.000Z', 3),
      post('new', '2026-11-19T10:00:00.000Z', 3),
      post('mid', '2026-11-19T09:00:00.000Z', 3),
    ];
    expect(sortPostsForView(tied, 'hug').map((item) => item.id)).toEqual(['new', 'mid', 'old']);
  });

  it('不改动传进来的数组', () => {
    const original = posts.map((item) => item.id);
    sortPostsForView(posts, 'hug');
    expect(posts.map((item) => item.id)).toEqual(original);
  });
});
