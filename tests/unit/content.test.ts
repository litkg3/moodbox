import { beforeEach, describe, expect, it } from 'vitest';
import { getDB } from '@/lib/db';
import {
  addReply,
  createPost,
  deleteOwnPost,
  deleteOwnReply,
  deletePost,
  deleteReply,
  hugPost,
  listPosts,
  normalizeNickname,
  setPostStatus,
} from '@/lib/square-repo';
import { createStory, deleteStory, listStories, updateStory } from '@/lib/stories-repo';

/**
 * 内容层（故事集 / 树洞广场）。
 *
 * 这一层承载着两条不能退让的规则，测试就围绕它们写：
 * 1. 新帖永远是 `pending` —— 不存在"直接发布"的代码路径；
 * 2. 清空数据不能把别人写的示例内容一起抹掉。
 */

/** 测试里需要一张真正干净的桌子，所以直接清空两个 store（保留种子逻辑本身不动）。 */
async function resetContentStores(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['stories', 'posts'], 'readwrite');
  await Promise.all([
    tx.objectStore('stories').clear(),
    tx.objectStore('posts').clear(),
    tx.done,
  ]);
}

beforeEach(async () => {
  await resetContentStores();
});

describe('治愈故事集', () => {
  it('新建故事会补上默认作者与时间戳', async () => {
    const story = await createStory({
      title: '  一碗热汤  ',
      content: '  她端过来的时候什么都没说。  ',
      theme: 'warmth',
    });

    expect(story.title).toBe('一碗热汤');
    expect(story.content).toBe('她端过来的时候什么都没说。');
    expect(story.author).toBe('匿名整理');
    expect(story.createdAt).toBeTruthy();
    expect(story.isDemo).toBeUndefined();
  });

  it('列表按创建时间倒序，最新的在最前面', async () => {
    const first = await createStory({ title: '先写的', content: 'a', theme: 'warmth' });
    const second = await createStory({ title: '后写的', content: 'b', theme: 'night' });

    const stories = await listStories();
    expect(stories.map((item) => item.id).sort()).toEqual([first.id, second.id].sort());

    // 同一毫秒内创建的两条无法比较先后（会退化成按 id 排序），
    // 所以这里断言的是契约本身：列表始终按 createdAt 递减排列。
    const times = stories.map((item) => item.createdAt);
    expect([...times].sort((a, b) => b.localeCompare(a))).toEqual(times);
  });

  it('编辑会更新内容与 updatedAt，但不改 createdAt', async () => {
    const created = await createStory({ title: '原标题', content: 'a', theme: 'warmth' });
    const updated = await updateStory(created.id, {
      title: '新标题',
      content: 'b',
      theme: 'growth',
      author: '阿岚',
    });

    expect(updated.title).toBe('新标题');
    expect(updated.theme).toBe('growth');
    expect(updated.author).toBe('阿岚');
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.updatedAt >= created.updatedAt).toBe(true);
  });

  it('删除后就查不到了；编辑不存在的故事会报错', async () => {
    const created = await createStory({ title: '临时', content: 'a', theme: 'warmth' });
    await deleteStory(created.id);
    expect(await listStories()).toHaveLength(0);

    await expect(updateStory(created.id, { title: 'x', content: 'y', theme: 'warmth' })).rejects.toThrow(
      /不在了/,
    );
  });
});

describe('树洞广场', () => {
  it('新帖一律进入待审核，不会直接公开', async () => {
    const post = await createPost({ content: '今天有点撑不住。' });

    expect(post.status).toBe('pending');
    expect(post.hugs).toBe(0);
    expect(post.replies).toEqual([]);
    expect(post.nickname).toBe('匿名的人');
  });

  it('昵称最多 16 个字，接口层也会截断', async () => {
    const post = await createPost({
      content: '昵称测试',
      nickname: '一二三四五六七八九十一二三四五六七八',
    });
    expect(post.nickname).toHaveLength(16);
    expect(normalizeNickname('  ')).toBe('匿名的人');
    expect(normalizeNickname('  短名  ')).toBe('短名');
  });

  it('管理员审核通过后状态变为 approved，并记录审核时间', async () => {
    const post = await createPost({ content: '想分享一件小事。' });
    const approved = await setPostStatus(post.id, 'approved');

    expect(approved.status).toBe('approved');
    expect(approved.reviewedAt).toBeTruthy();
  });

  it('拥抱是累加的', async () => {
    const post = await createPost({ content: '抱抱我。' });
    await hugPost(post.id);
    const twice = await hugPost(post.id);
    expect(twice.hugs).toBe(2);
  });

  it('回复可以追加，也可以单独删掉一条', async () => {
    const post = await createPost({ content: '有人吗。' });
    const withReply = await addReply(post.id, { content: '我在。', nickname: '路过的人' });

    expect(withReply.replies).toHaveLength(1);
    expect(withReply.replies[0]?.nickname).toBe('路过的人');

    const replyId = withReply.replies[0]?.id ?? '';
    const cleared = await deleteReply(post.id, replyId);
    expect(cleared.replies).toHaveLength(0);
  });

  it('对不存在的帖子操作会给出明确错误', async () => {
    await expect(hugPost('post_not_exist')).rejects.toThrow(/不在了/);
    await expect(addReply('post_not_exist', { content: 'x' })).rejects.toThrow(/不在了/);
  });


  it('删除帖子后列表里不再出现', async () => {
    const post = await createPost({ content: '删了吧。' });
    await deletePost(post.id);
    expect(await listPosts()).toHaveLength(0);
  });

  it('匿名的帖子带 4 位后缀与归属地，且只有本人能删', async () => {
    const mine = await createPost({
      content: '我发的。',
      alias: '匿名·K7Q2',
      visitorId: 'key-a',
      region: '广东·深圳',
    });
    const other = await createPost({ content: '别人发的。', visitorId: 'key-b' });

    expect(mine.nickname).toBe('匿名·K7Q2');
    expect(mine.region).toBe('广东·深圳');

    const asA = await listPosts('key-a');
    expect(asA.find((post) => post.id === mine.id)?.mine).toBe(true);
    expect(asA.find((post) => post.id === other.id)?.mine).toBe(false);

    await expect(deleteOwnPost(other.id, 'key-a')).rejects.toThrow(/不是你发的/);
    await deleteOwnPost(mine.id, 'key-a');
    expect((await listPosts('key-a')).some((post) => post.id === mine.id)).toBe(false);
  });

  it('回复最多 200 字；本人可以删掉自己的回复', async () => {
    const post = await createPost({ content: '有人吗。', visitorId: 'key-a' });

    await expect(
      addReply(post.id, { content: '啊'.repeat(201), visitorId: 'key-a' }),
    ).rejects.toThrow(/200/);

    const withReply = await addReply(post.id, {
      content: '我在。',
      alias: '匿名·K7Q2',
      visitorId: 'key-a',
      region: '广东·深圳',
    });
    const reply = withReply.replies[0];
    expect(reply?.mine).toBe(true);
    expect(reply?.region).toBe('广东·深圳');

    await expect(deleteOwnReply(post.id, reply!.id, 'key-b')).rejects.toThrow(/不是你写的/);
    const cleared = await deleteOwnReply(post.id, reply!.id, 'key-a');
    expect(cleared.replies).toHaveLength(0);
  });
});
