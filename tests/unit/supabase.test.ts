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

    expect(rpcMock).toHaveBeenCalledWith('moodbox_square_list', {
      p_token: null,
      p_visitor: null,
    });
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
    expect(rpcMock).toHaveBeenLastCalledWith('moodbox_square_list', {
      p_token: null,
      p_visitor: null,
    });

    token = 'moodbox2026';
    await backend.listPosts('visitor-key-123');
    expect(rpcMock).toHaveBeenLastCalledWith('moodbox_square_list', {
      p_token: 'moodbox2026',
      p_visitor: 'visitor-key-123',
    });
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

    // 客户端先把昵称收敛到 16 字以内、空值回落「匿名的人」，数据库函数里也会再截一次
    await backend.createPost({ content: '  今天还行  ', nickname: '  ', needsSupport: true });

    expect(rpcMock).toHaveBeenCalledWith('moodbox_square_create', {
      p_content: '  今天还行  ',
      p_nickname: '匿名的人',
      p_needs_support: true,
      p_visitor: null,
      p_region: null,
    });
    const args = rpcMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(args).not.toHaveProperty('p_status');
  });

  it('昵称超过 16 个字会被截断后再发给数据库', async () => {
    rpcMock.mockResolvedValue(ok({ ...rawPost, status: 'pending' }));
    const backend = createSupabaseBackend();

    await backend.createPost({ content: '昵称超长', nickname: '一二三四五六七八九十一二三四五六' });

    const args = rpcMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(args.p_nickname).toBe('一二三四五六七八九十一二三四五六');
    expect(String(args.p_nickname)).toHaveLength(16);
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

  it('拥抱不需要令牌，但会带上访客标识用于去重', async () => {
    rpcMock.mockResolvedValue(ok({ ...rawPost, hugs: 4, hugged: true }));
    const backend = createSupabaseBackend();
    const post = await backend.hugPost('post_abc', 'visitor_key');
    expect(rpcMock).toHaveBeenLastCalledWith('moodbox_square_hug', {
      p_id: 'post_abc',
      p_visitor: 'visitor_key',
      p_undo: false,
    });
    expect(post.hugs).toBe(4);
    expect(post.hugged).toBe(true);
  });

  it('库里还没更新到带 p_visitor 的拥抱函数时，退回单参数调用', async () => {
    const missing = { code: 'PGRST202', message: 'Could not find the function public.moodbox_square_hug' };
    rpcMock
      .mockResolvedValueOnce({ data: null, error: missing })
      .mockResolvedValueOnce(ok({ ...rawPost, hugs: 4 }));
    const backend = createSupabaseBackend();
    const post = await backend.hugPost('post_abc', 'visitor_key');
    expect(rpcMock).toHaveBeenLastCalledWith('moodbox_square_hug', {
      p_id: 'post_abc',
      p_undo: false,
    });
    expect(post.hugs).toBe(4);
  });

  it('函数旧到连单参数签名都没有时，提示去重新执行 schema，而不是静默失败', async () => {
    // 和真 client 一致：以 { data: null, error } 的形式把错误还回来
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function public.moodbox_square_hug' },
    });
    const backend = createSupabaseBackend();
    await expect(backend.hugPost('post_abc', 'visitor_key')).rejects.toThrow(/重新执行一次/);
    expect(rpcMock).toHaveBeenCalledTimes(2);
  });

  it('拥抱遇到网络 / 业务错误时直接抛出，不会误降级成单参数调用', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } });
    const backend = createSupabaseBackend();
    await expect(backend.hugPost('post_abc', 'visitor_key')).rejects.toThrow(/连不上/);
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it('删除自己的帖子 / 回复走 delete_own，不携带管理员口令', async () => {
    rpcMock.mockResolvedValue(ok(null));
    const backend = createSupabaseBackend({ getToken: () => 'should-not-be-used' });

    await backend.deleteOwnPost('post_abc', 'visitor-key');
    expect(rpcMock).toHaveBeenLastCalledWith('moodbox_square_delete_own', {
      p_id: 'post_abc',
      p_visitor: 'visitor-key',
    });

    rpcMock.mockResolvedValue(ok(rawPost));
    await backend.deleteOwnReply('post_abc', 'reply_1', 'visitor-key');
    expect(rpcMock).toHaveBeenLastCalledWith('moodbox_square_delete_own_reply', {
      p_post_id: 'post_abc',
      p_reply_id: 'reply_1',
      p_visitor: 'visitor-key',
    });
  });

  it('mine / region 会被收敛成前端字段：数据库只下发布尔值，不下发指纹', async () => {
    rpcMock.mockResolvedValue(
      ok([
        {
          ...rawPost,
          mine: true,
          region: '广东·深圳',
          replies: [{ ...rawPost.replies[0], mine: true, region: '广东·深圳' }],
        },
      ]),
    );
    const backend = createSupabaseBackend();
    const posts = await backend.listPosts('visitor-key');

    expect(posts[0]?.mine).toBe(true);
    expect(posts[0]?.region).toBe('广东·深圳');
    expect(posts[0]?.replies[0]?.mine).toBe(true);
    expect(posts[0]?.replies[0]?.region).toBe('广东·深圳');
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
