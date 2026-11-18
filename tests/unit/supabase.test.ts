import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Supabase 后端的单元测试。
 *
 * 这里不打真实网络：`@supabase/supabase-js` 被整体替换成一个假的 `rpc`，
 * 我们只验证"客户端这一层有没有把约定守住"：
 * - RPC 名字与参数对不对（尤其 p_token 有没有带上）；
 * - 返回的 jsonb 有没有被收敛成前端能吃的形状；
 * - 数据库报错有没有被翻译成人话；
 * - 关键的：发帖时客户端**不能**自己传 status。
 */

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ rpc: rpcMock }),
}));

import { createSupabaseBackend, translateSupabaseError } from '@/lib/backend/supabase';

function ok(data: unknown) {
  return { data, error: null };
}

const rawPost = {
  id: 'post_abc',
  nickname: '晚风',
  content: '今天路过一棵很好看的树。',
  status: 'approved',
  hugs: 3,
  needsSupport: false,
  createdAt: '2026-11-18T02:14:43.123Z',
  reviewedAt: null,
  replies: [
    {
      id: 'reply_1',
      nickname: '星星',
      content: '抱一下。',
      needsSupport: false,
      createdAt: '2026-11-18T03:00:00.000Z',
    },
  ],
};

describe('Supabase 后端 · 读', () => {
  beforeEach(() => rpcMock.mockReset());

  it('列表走 moodbox_square_list，并把 jsonb 收敛成 SquarePost', async () => {
    rpcMock.mockResolvedValue(ok([rawPost]));
    const backend = createSupabaseBackend();

    const posts = await backend.listPosts();

    expect(rpcMock).toHaveBeenCalledWith('moodbox_square_list', { p_token: null });
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      id: 'post_abc',
      nickname: '晚风',
      status: 'approved',
      hugs: 3,
      needsSupport: false,
    });
    expect(posts[0]?.replies[0]).toMatchObject({ id: 'reply_1', content: '抱一下。' });
    expect(posts[0]?.reviewedAt).toBeUndefined();
  });

  it('管理员解锁后会把令牌一起发过去，未解锁时是 null', async () => {
    rpcMock.mockResolvedValue(ok([]));
    let token: string | null = null;
    const backend = createSupabaseBackend({ getToken: () => token });

    await backend.listPosts();
    expect(rpcMock).toHaveBeenLastCalledWith('moodbox_square_list', { p_token: null });

    token = 'moodbox2026';
    await backend.listPosts();
    expect(rpcMock).toHaveBeenLastCalledWith('moodbox_square_list', { p_token: 'moodbox2026' });
  });

  it('接口返回 null 时不会崩，给一个空数组', async () => {
    rpcMock.mockResolvedValue(ok(null));
    const backend = createSupabaseBackend();
    await expect(backend.listPosts()).resolves.toEqual([]);
  });

  it('未知的 status 一律按 approved 处理，不会把脏数据带进界面', async () => {
    rpcMock.mockResolvedValue(ok([{ ...rawPost, status: 'whatever' }]));
    const backend = createSupabaseBackend();
    const posts = await backend.listPosts();
    expect(posts[0]?.status).toBe('approved');
  });
});

describe('Supabase 后端 · 写', () => {
  beforeEach(() => rpcMock.mockReset());

  it('发帖不带 status —— 审核状态只能由数据库决定', async () => {
    rpcMock.mockResolvedValue(ok({ ...rawPost, status: 'pending' }));
    const backend = createSupabaseBackend();

    await backend.createPost({ content: '  今天还行  ', nickname: '  ', needsSupport: true });

    expect(rpcMock).toHaveBeenCalledWith('moodbox_square_create', {
      p_content: '  今天还行  ',
      p_nickname: null,
      p_needs_support: true,
    });
    const args = rpcMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(args).not.toHaveProperty('p_status');
  });

  it('审核 / 删帖 / 删回复都会带上令牌', async () => {
    rpcMock.mockResolvedValue(ok({ ...rawPost, status: 'approved' }));
    const backend = createSupabaseBackend({ getToken: () => 'secret-token' });

    await backend.setPostStatus('post_abc', 'approved');
    expect(rpcMock).toHaveBeenLastCalledWith('moodbox_square_review', {
      p_id: 'post_abc',
      p_status: 'approved',
      p_token: 'secret-token',
    });

    await backend.deletePost('post_abc');
    expect(rpcMock).toHaveBeenLastCalledWith('moodbox_square_delete', {
      p_id: 'post_abc',
      p_token: 'secret-token',
    });

    rpcMock.mockResolvedValue(ok(rawPost));
    await backend.deleteReply('post_abc', 'reply_1');
    expect(rpcMock).toHaveBeenLastCalledWith('moodbox_square_delete_reply', {
      p_post_id: 'post_abc',
      p_reply_id: 'reply_1',
      p_token: 'secret-token',
    });
  });

  it('拥抱不需要令牌', async () => {
    rpcMock.mockResolvedValue(ok({ ...rawPost, hugs: 4 }));
    const backend = createSupabaseBackend();
    const post = await backend.hugPost('post_abc');
    expect(rpcMock).toHaveBeenLastCalledWith('moodbox_square_hug', { p_id: 'post_abc' });
    expect(post.hugs).toBe(4);
  });

  it('verifyAdmin 在服务端报错时返回 false，而不是抛异常', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'nope' } });
    const backend = createSupabaseBackend();
    await expect(backend.verifyAdmin?.('x')).resolves.toBe(false);

    rpcMock.mockResolvedValue(ok(true));
    await expect(backend.verifyAdmin?.('x')).resolves.toBe(true);
  });
});

describe('后端选择：环境变量决定走哪条路', () => {
  it('两个变量都配好才切到 supabase，缺一个就退回本地', async () => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    const localMod = await import('@/lib/backend');
    expect(localMod.getContentBackend().mode).toBe('local');
    expect(localMod.describeBackend().label).toMatch(/本机/);

    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://demo-project.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'k'.repeat(48));
    const cloudMod = await import('@/lib/backend');
    expect(cloudMod.getContentBackend().mode).toBe('supabase');
    const described = cloudMod.describeBackend();
    expect(described.label).toMatch(/Supabase/);
    // 界面不再展示项目 ref，只说明"信箱与开心罐仍在本机"
    expect(described.detail).toBe('心事信箱与开心罐仍然只在这台设备上。');

    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('URL 形状不对时当作没配，不把用户丢进网络错误里', async () => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.com');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'k'.repeat(48));
    const mod = await import('@/lib/backend');
    expect(mod.getContentBackend().mode).toBe('local');

    vi.unstubAllEnvs();
    vi.resetModules();
  });
});

describe('Supabase 后端 · 边界', () => {
  it('mode 是 supabase，其余内容仍然交给本地实现', () => {
    const backend = createSupabaseBackend();
    expect(backend.mode).toBe('supabase');
    // 心事信箱 / 开心罐 不该被上传到云端
    expect(typeof backend.listLetters).toBe('function');
    expect(typeof backend.listStories).toBe('function');
  });

  it('数据库没建好时，错误提示要直接说该去做什么', () => {
    expect(
      translateSupabaseError({ code: 'PGRST202', message: 'Could not find the function p' }).message,
    ).toMatch(/schema\.sql/);

    expect(
      translateSupabaseError({ code: '42P01', message: 'relation "square_posts" does not exist' })
        .message,
    ).toMatch(/schema\.sql/);

    expect(
      translateSupabaseError({ code: '42501', message: 'permission denied for table' }).message,
    ).toMatch(/管理员/);

    expect(
      translateSupabaseError({ code: 'P0001', message: '管理员口令不对，这次审核没有生效。' })
        .message,
    ).toBe('管理员口令不对，这次审核没有生效。');

    expect(translateSupabaseError({ message: 'Failed to fetch' }).message).toMatch(/连不上/);
  });
});
