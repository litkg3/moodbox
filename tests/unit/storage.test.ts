import { beforeEach, describe, expect, it } from 'vitest';
import { clearAllData, createMemory, deleteMemory, listEmotionLogs, listMemories, updateMemory } from '@/lib/memories-repo';
import { addEmotionLog } from '@/lib/memories-repo';
import {
  buildExportPayload,
  ImportError,
  importIntoDatabase,
  parseExportFile,
} from '@/lib/export-import';

const draft = {
  date: '2026-11-12',
  title: '楼下的桂花开了',
  content: '出门的时候闻到一阵很淡的香味。',
  mood: 'warm' as const,
};

beforeEach(async () => {
  await clearAllData();
});

describe('记忆仓储（IndexedDB）', () => {
  it('创建后可以读回，并按日期倒序排列', async () => {
    await createMemory(draft);
    await createMemory({ ...draft, date: '2026-11-14', title: '更晚的一天' });

    const memories = await listMemories();
    expect(memories).toHaveLength(2);
    expect(memories[0]?.date).toBe('2026-11-14');
    expect(memories[0]?.title).toBe('更晚的一天');
    expect(memories[1]?.content).toContain('香味');
  });

  it('编辑会更新内容与 updatedAt，同时保留 createdAt', async () => {
    const created = await createMemory(draft);
    const updated = await updateMemory(created.id, { title: '桂花真的很香' });

    expect(updated.title).toBe('桂花真的很香');
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.updatedAt >= created.updatedAt).toBe(true);

    const [stored] = await listMemories();
    expect(stored?.title).toBe('桂花真的很香');
  });

  it('删除后不再出现在列表里', async () => {
    const created = await createMemory(draft);
    await deleteMemory(created.id);
    expect(await listMemories()).toHaveLength(0);
  });

  it('情绪记录可以写入并按日期读取', async () => {
    await addEmotionLog('joy', '2026-11-12');
    await addEmotionLog('anxiety', '2026-11-12');
    const logs = await listEmotionLogs();
    expect(logs).toHaveLength(2);
    expect(logs.map((log) => log.emotionId).sort()).toEqual(['anxiety', 'joy']);
  });

  it('编辑不存在的记录会给出明确错误', async () => {
    await expect(updateMemory('not-exist', { title: 'x' })).rejects.toThrow(/不在了/);
  });
});

describe('导出与导入', () => {
  it('导出的 JSON 可以原样导入回来（含图片）', async () => {
    // 注意：fake-indexeddb 读回的 Blob 是简化实现，因此这里用真实 Blob 构造待导出记录，
    // 只把「导入 → 落库 → 再读出」这段真实链路交给数据库。
    const imageBlob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/jpeg' });
    const record = {
      id: 'memory_with_image',
      date: draft.date,
      title: draft.title,
      content: draft.content,
      mood: draft.mood,
      createdAt: '2026-11-12T09:00:00.000Z',
      updatedAt: '2026-11-12T09:00:00.000Z',
      image: { blob: imageBlob, type: 'image/jpeg', width: 640, height: 480 },
    } as const;

    const payload = await buildExportPayload([record], []);
    expect(payload.memories[0]?.image?.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true);

    const serialized = JSON.parse(JSON.stringify(payload));
    const parsed = parseExportFile(serialized);
    expect(parsed.memories).toHaveLength(1);

    const result = await importIntoDatabase(parsed, [], []);
    expect(result.imported).toBe(1);

    const restored = await listMemories();
    expect(restored[0]?.title).toBe(draft.title);
    expect(restored[0]?.image?.type).toBe('image/jpeg');
    expect(restored[0]?.image?.width).toBe(640);
    expect(restored[0]?.image?.height).toBe(480);
    // 二进制内容在真实浏览器中由 e2e 覆盖，fake-indexeddb 的 Blob 实现不含 size 等属性
  });

  it('重复导入同一条记录时跳过，而不是产生副本', async () => {
    const created = await createMemory(draft);
    const payload = await buildExportPayload([created], []);

    const existing = await listMemories();
    const result = await importIntoDatabase(parseExportFile(JSON.parse(JSON.stringify(payload))), existing, []);
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('拒绝不是情绪盒子的备份文件', () => {
    expect(() => parseExportFile({ format: 'something-else' })).toThrow(ImportError);
    expect(() => parseExportFile(null)).toThrow(/有效的备份格式/);
    expect(() => parseExportFile({ format: 'moodbox-export', version: 99 })).toThrow(/版本/);
  });

  it('拒绝非法日期与未知情绪', () => {
    const base = {
      format: 'moodbox-export',
      version: 1,
      exportedAt: new Date().toISOString(),
      memories: [
        {
          id: 'm1',
          date: '2026-02-31',
          title: 't',
          content: 'c',
          mood: 'warm',
          createdAt: '2026-02-31T00:00:00.000Z',
          updatedAt: '2026-02-31T00:00:00.000Z',
        },
      ],
      emotionLogs: [],
    };
    expect(() => parseExportFile(base)).toThrow(/日期不合法/);

    expect(() =>
      parseExportFile({
        ...base,
        memories: [],
        emotionLogs: [
          { id: 'l1', emotionId: 'unknown', date: '2026-11-12', createdAt: new Date().toISOString() },
        ],
      }),
    ).toThrow(/情绪类型无法识别/);
  });
});
