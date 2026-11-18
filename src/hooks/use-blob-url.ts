'use client';

import { useEffect, useState } from 'react';

/**
 * 为 IndexedDB 中的图片 Blob 创建 object URL。
 *
 * 用 WeakMap 按 Blob 缓存 URL：列表重渲染、弹窗开关都不会反复创建新的 URL；
 * Blob 被 GC 后缓存条目也随之释放。页面卸载时浏览器会回收全部 object URL，
 * 因此不需要在组件卸载时 revoke —— 否则同一张图在别处会突然变成裂图。
 */
const urlCache = new WeakMap<Blob, string>();

export function useBlobUrl(blob: Blob | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    let cached = urlCache.get(blob);
    if (!cached) {
      cached = URL.createObjectURL(blob);
      urlCache.set(blob, cached);
    }
    setUrl(cached);
  }, [blob]);

  return url;
}
