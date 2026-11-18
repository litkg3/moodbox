import { EMOTIONS } from '@/data/emotions';
import { isMemoryMoodId } from '@/data/moods';
import { isValidDateKey } from '@/lib/date';
import { blobToDataUrl, dataUrlToBlob } from '@/lib/image';
import { bulkPutEmotionLogs, bulkPutMemories } from '@/lib/memories-repo';
import { isEmotionId } from '@/lib/emotions';
import type {
  EmotionLog,
  ExportedMemory,
  ImportResult,
  MemoryRecord,
  MoodBoxExport,
} from '@/types';

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

const MAX_IMPORT_BYTES = 60 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown, field: string, max = 4000): string {
  if (typeof value !== 'string') throw new ImportError(`字段 ${field} 不是文本。`);
  if (value.length > max) throw new ImportError(`字段 ${field} 过长。`);
  return value;
}

/** 把内存中的记录转换为可序列化的导出结构（图片转 base64）。 */
export async function buildExportPayload(
  memories: MemoryRecord[],
  emotionLogs: EmotionLog[],
): Promise<MoodBoxExport> {
  const exportedMemories: ExportedMemory[] = [];
  for (const memory of memories) {
    const base: ExportedMemory = {
      id: memory.id,
      date: memory.date,
      title: memory.title,
      content: memory.content,
      mood: memory.mood,
      createdAt: memory.createdAt,
      updatedAt: memory.updatedAt,
      isDemo: memory.isDemo,
    };
    if (memory.image) {
      base.image = {
        dataUrl: await blobToDataUrl(memory.image.blob),
        type: memory.image.type,
        width: memory.image.width,
        height: memory.image.height,
      };
    }
    exportedMemories.push(base);
  }

  return {
    format: 'moodbox-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    memories: exportedMemories,
    emotionLogs: emotionLogs.map((log) => ({ ...log })),
  };
}

export function downloadExport(payload: MoodBoxExport): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `moodbox-backup-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // 交给浏览器完成下载后再释放
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** 严格校验导入文件：宁可报错，也不要静默写入半截脏数据。 */
export function parseExportFile(raw: unknown): MoodBoxExport {
  if (!isRecord(raw)) throw new ImportError('文件内容不是有效的备份格式。');
  if (raw.format !== 'moodbox-export') {
    throw new ImportError('这不是情绪盒子的备份文件。');
  }
  if (raw.version !== 1) {
    throw new ImportError('备份文件版本与当前网站不兼容。');
  }
  if (!Array.isArray(raw.memories) || !Array.isArray(raw.emotionLogs)) {
    throw new ImportError('备份文件缺少必要的数据字段。');
  }

  const memories: ExportedMemory[] = raw.memories.map((item, index) => {
    if (!isRecord(item)) throw new ImportError(`第 ${index + 1} 条记忆格式不正确。`);
    const date = asString(item.date, 'date');
    if (!isValidDateKey(date)) throw new ImportError(`第 ${index + 1} 条记忆的日期不合法。`);
    if (!isMemoryMoodId(item.mood)) throw new ImportError(`第 ${index + 1} 条记忆的心情标签无法识别。`);

    const image = item.image;
    let parsedImage: ExportedMemory['image'];
    if (isRecord(image)) {
      const dataUrl = asString(image.dataUrl, 'image.dataUrl', 8_000_000);
      if (!dataUrl.startsWith('data:image/')) throw new ImportError('图片数据格式不正确。');
      parsedImage = {
        dataUrl,
        type: typeof image.type === 'string' ? image.type : 'image/jpeg',
        width: typeof image.width === 'number' ? image.width : 0,
        height: typeof image.height === 'number' ? image.height : 0,
      };
    }

    return {
      id: asString(item.id, 'id', 200),
      date,
      title: asString(item.title, 'title', 200),
      content: asString(item.content, 'content'),
      mood: item.mood,
      createdAt: asString(item.createdAt, 'createdAt', 80),
      updatedAt: asString(item.updatedAt, 'updatedAt', 80),
      isDemo: item.isDemo === true,
      image: parsedImage,
    };
  });

  const emotionLogs: EmotionLog[] = raw.emotionLogs.map((item, index) => {
    if (!isRecord(item)) throw new ImportError(`第 ${index + 1} 条情绪记录格式不正确。`);
    if (!isEmotionId(item.emotionId)) {
      throw new ImportError(`第 ${index + 1} 条情绪记录的情绪类型无法识别。`);
    }
    const date = asString(item.date, 'date');
    if (!isValidDateKey(date)) throw new ImportError(`第 ${index + 1} 条情绪记录的日期不合法。`);
    return {
      id: asString(item.id, 'id', 200),
      emotionId: item.emotionId,
      date,
      createdAt: asString(item.createdAt, 'createdAt', 80),
      isDemo: item.isDemo === true,
    };
  });

  return {
    format: 'moodbox-export',
    version: 1,
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : new Date().toISOString(),
    memories,
    emotionLogs,
  };
}

export async function readExportFile(file: File): Promise<MoodBoxExport> {
  if (file.size > MAX_IMPORT_BYTES) {
    throw new ImportError('备份文件过大（超过 60MB），无法导入。');
  }
  let text: string;
  try {
    text = await file.text();
  } catch {
    throw new ImportError('文件读取失败，可能已损坏。');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ImportError('文件不是合法的 JSON。');
  }
  return parseExportFile(parsed);
}

/**
 * 合并导入：同 id 时保留更新时间较晚的一条，其余直接新增。
 * 不做“清空再写入”，避免用户误导入导致原有记录丢失。
 */
export async function importIntoDatabase(
  payload: MoodBoxExport,
  existingMemories: MemoryRecord[],
  existingLogs: EmotionLog[],
): Promise<ImportResult> {
  const existingMemoryMap = new Map(existingMemories.map((memory) => [memory.id, memory]));
  const existingLogMap = new Set(existingLogs.map((log) => log.id));

  const toWrite: MemoryRecord[] = [];
  let skipped = 0;

  for (const item of payload.memories) {
    const existing = existingMemoryMap.get(item.id);
    if (existing && existing.updatedAt >= item.updatedAt) {
      skipped += 1;
      continue;
    }
    const record: MemoryRecord = {
      id: item.id,
      date: item.date,
      title: item.title,
      content: item.content,
      mood: item.mood,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      isDemo: item.isDemo,
    };
    if (item.image) {
      record.image = {
        blob: dataUrlToBlob(item.image.dataUrl),
        type: item.image.type,
        width: item.image.width,
        height: item.image.height,
      };
    }
    toWrite.push(record);
  }

  const logsToWrite = payload.emotionLogs.filter((log) => !existingLogMap.has(log.id));

  await bulkPutMemories(toWrite);
  await bulkPutEmotionLogs(logsToWrite);

  return {
    imported: toWrite.length,
    skipped,
    emotionsImported: logsToWrite.length,
    total: payload.memories.length,
  };
}

/** 演示数据使用的情绪 id 白名单，保证与内容库同步。 */
export const KNOWN_EMOTION_IDS = EMOTIONS.map((emotion) => emotion.id);
