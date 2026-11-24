import type { ChatEvent } from '@/lib/chat/types';

/**
 * 解析 SSE。
 *
 * 单独拎出来，是因为"一帧被切成两半"这种情况只能靠单测覆盖：
 * 真在网络里复现一次半包很难，而错误一旦出现就是少半句话。
 *
 * 约定：帧之间用空行分隔（`\n\n`）。一次 read 可能拿到三帧半，
 * 剩下的半截留给下一次 —— 所以返回 `rest` 而不是就地丢弃。
 */
export function parseSseBuffer(buffer: string): { events: ChatEvent[]; rest: string } {
  const events: ChatEvent[] = [];
  const parts = buffer.split('\n\n');
  const rest = parts.pop() ?? '';

  for (const part of parts) {
    const line = part
      .split('\n')
      .map((item) => item.trim())
      .find((item) => item.startsWith('data:'));
    if (!line) continue;

    const payload = line.slice(5).trim();
    if (!payload) continue;
    try {
      const parsed: unknown = JSON.parse(payload);
      if (typeof parsed === 'object' && parsed !== null && typeof (parsed as ChatEvent).type === 'string') {
        events.push(parsed as ChatEvent);
      }
    } catch {
      // 坏帧直接跳过：宁可少一句，也不要把整段对话判死
    }
  }

  return { events, rest };
}
