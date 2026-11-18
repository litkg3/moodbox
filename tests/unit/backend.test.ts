import { describe, expect, it, vi } from 'vitest';
import { BackendNotConfiguredError, BackendRequestError, createHttpBackend } from '@/lib/backend/http';

/**
 * 云端内容后端（预留实现）。
 *
 * 现在没有服务器可连，但契约必须被钉死：地址怎么拼、方法用什么、
 * 令牌放哪 —— 否则将来接真后端时，才发现两边对不上。
 */

interface Recorded {
  url: string;
  init: RequestInit;
}

function makeFetch(payload: unknown = [], status = 200) {
  const calls: Recorded[] = [];
  const fetchImpl = vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    if (status === 204) return new Response(null, { status: 204 });
    return new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

describe('HTTP 内容后端', () => {
  it('mode 标记为 http，便于界面判断数据存在哪', () => {
    const { fetchImpl } = makeFetch();
    expect(createHttpBackend({ baseUrl: 'https://api.example.com', fetchImpl }).mode).toBe('http');
  });

  it('拼接地址时去掉结尾多余的斜杠', async () => {
    const { calls, fetchImpl } = makeFetch();
    const backend = createHttpBackend({ baseUrl: 'https://api.example.com///', fetchImpl });

    await backend.listStories();
    expect(calls[0]?.url).toBe('https://api.example.com/stories');
  });

  it('写操作使用正确的 HTTP 方法与 JSON body', async () => {
    const { calls, fetchImpl } = makeFetch({ id: 'story_1' });
    const backend = createHttpBackend({ baseUrl: 'https://api.example.com', fetchImpl });

    await backend.createStory({ title: 't', content: 'c', theme: 'warmth' });
    expect(calls[0]?.init.method).toBe('POST');
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ title: 't', content: 'c', theme: 'warmth' });

    await backend.updateStory('story_1', { title: 't2', content: 'c2', theme: 'night' });
    expect(calls[1]?.init.method).toBe('PATCH');
    expect(calls[1]?.url).toBe('https://api.example.com/stories/story_1');

    await backend.deleteStory('story_1');
    expect(calls[2]?.init.method).toBe('DELETE');
  });

  it('审核接口只发状态，不把整条帖子传回去', async () => {
    const { calls, fetchImpl } = makeFetch({ id: 'post_1' });
    const backend = createHttpBackend({ baseUrl: 'https://api.example.com', fetchImpl });

    await backend.setPostStatus('post_1', 'approved');
    expect(calls[0]?.init.method).toBe('PATCH');
    expect(calls[0]?.url).toBe('https://api.example.com/posts/post_1');
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ status: 'approved' });
  });

  it('拥抱与回复走各自的子路径', async () => {
    const { calls, fetchImpl } = makeFetch({ id: 'post_1' });
    const backend = createHttpBackend({ baseUrl: 'https://api.example.com', fetchImpl });

    await backend.hugPost('post_1');
    await backend.addReply('post_1', { content: '我在。' });
    await backend.deleteReply('post_1', 'reply_9');

    expect(calls.map((call) => `${call.init.method} ${call.url}`)).toEqual([
      'POST https://api.example.com/posts/post_1/hugs',
      'POST https://api.example.com/posts/post_1/replies',
      'DELETE https://api.example.com/posts/post_1/replies/reply_9',
    ]);
  });

  it('有令牌时带上 Authorization，没有就不带', async () => {
    const cold = makeFetch();
    await createHttpBackend({ baseUrl: 'https://api.example.com', fetchImpl: cold.fetchImpl }).listPosts();
    expect((cold.calls[0]?.init.headers as Record<string, string>).Authorization).toBeUndefined();

    const warm = makeFetch();
    await createHttpBackend({
      baseUrl: 'https://api.example.com',
      getToken: () => 'token-abc',
      fetchImpl: warm.fetchImpl,
    }).listPosts();
    expect((warm.calls[0]?.init.headers as Record<string, string>).Authorization).toBe('Bearer token-abc');
  });

  it('请求失败时抛出带状态码的错误，并优先用服务端给的文案', async () => {
    const { fetchImpl } = makeFetch({ message: '需要管理员权限' }, 403);
    const backend = createHttpBackend({ baseUrl: 'https://api.example.com', fetchImpl });

    await expect(backend.deletePost('post_1')).rejects.toBeInstanceOf(BackendRequestError);
    await expect(backend.deletePost('post_1')).rejects.toThrow('需要管理员权限');
    await expect(backend.deletePost('post_1')).rejects.toMatchObject({ status: 403 });
  });

  it('204 视为成功，不尝试解析空 body', async () => {
    const { fetchImpl } = makeFetch(null, 204);
    const backend = createHttpBackend({ baseUrl: 'https://api.example.com', fetchImpl });
    await expect(backend.deleteLetter('letter_1')).resolves.toBeUndefined();
  });

  it('未配置地址时给出可读的错误，而不是静默失败', async () => {
    const { fetchImpl } = makeFetch();
    const backend = createHttpBackend({ baseUrl: '   ', fetchImpl });
    await expect(backend.listCapsules()).rejects.toBeInstanceOf(BackendNotConfiguredError);
  });
});
