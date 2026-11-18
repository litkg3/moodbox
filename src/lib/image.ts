import type { MemoryImage } from '@/types';

/** 图片最长边上限，超过则等比缩小，避免一次收藏就吃掉几十 MB 配额。 */
export const MAX_IMAGE_EDGE = 1600;
export const IMAGE_QUALITY = 0.82;
export const MAX_INPUT_SIZE = 20 * 1024 * 1024;

export class ImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageError';
  }
}

function loadBitmap(file: File): Promise<{ width: number; height: number; draw: CanvasImageSource }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight, draw: image });
      // 注意：不在此处 revoke，调用方需要先完成绘制
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ImageError('这张图片暂时无法读取，换一张试试？'));
    };
    image.src = url;
  });
}

/**
 * 把用户选择的图片压缩为 JPEG Blob 后存进 IndexedDB。
 * 之所以存 Blob 而不是 base64：base64 会让体积膨胀约 33%，且会拖慢主线程。
 */
export async function fileToMemoryImage(file: File): Promise<MemoryImage> {
  if (!file.type.startsWith('image/')) {
    throw new ImageError('只能添加图片文件哦。');
  }
  if (file.size > MAX_INPUT_SIZE) {
    throw new ImageError('图片太大了（超过 20MB），换一张小一点的吧。');
  }

  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageError('当前浏览器无法处理图片。');

  // 白底，避免透明 PNG 转 JPEG 后出现黑底
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap.draw, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', IMAGE_QUALITY);
  });

  if (!blob) throw new ImageError('图片处理失败了，换一张试试？');

  return { blob, type: 'image/jpeg', width, height };
}

/**
 * Blob → base64 dataURL。
 * 优先使用 Blob.arrayBuffer；个别旧内核（以及测试环境的简化 Blob 实现）
 * 没有这个方法时退回 FileReader，保证导出功能不会因为运行环境而失效。
 */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  const buffer = await readBlobBuffer(blob);
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  const mime = blob.type || 'image/jpeg';
  return `data:${mime};base64,${btoa(binary)}`;
}

function readBlobBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error('图片读取失败。'));
    };
    reader.onerror = () => reject(new Error('图片读取失败。'));
    reader.readAsArrayBuffer(blob);
  });
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, base64] = dataUrl.split(',');
  if (!meta || !base64) throw new ImageError('图片数据格式不正确。');
  const mimeMatch = /data:([^;]+);base64/.exec(meta);
  const mime = mimeMatch?.[1] ?? 'image/jpeg';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`;
}
