import { NextResponse } from 'next/server';
import {
  CHAT_LIMITS,
  chatProvider,
  crisisResources,
} from '@/lib/chat/config';
import { CHAT_SYSTEM_PROMPT, emotionContextLine } from '@/lib/chat/prompt';
import { streamFromModel, streamLocalReply } from '@/lib/chat/provider';
import {
  auditAssistantText,
  carePayload,
  classifyRiskWithModel,
  scanChatRisk,
} from '@/lib/chat/safety';
import type { ChatEvent, ChatMessage } from '@/lib/chat/types';

/**
 * 陪聊接口。
 *
 * 协议是一层很薄的 SSE：每帧一行 `data: {json}`，事件类型见 ChatEvent。
 * 用 SSE 而不是 WebSocket，是因为它只要一个 POST、天然支持断线重连式的
 * 重试，而且流到一半被用户按「停止」时直接 abort 连接就行。
 *
 * 这个文件里没有任何模型 Key 的痕迹 —— Key 只在 chatProvider() 里读，
 * 而 chatProvider 只在服务端执行。
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ---------------- 频率限制 ---------------- */

/**
 * 进程内的滑动窗口。
 *
 * 单实例够用；多实例部署时这层会被打散，真正的限流要放到网关或 Redis。
 * 这里的目标不是"挡住攻击"，而是"一个手滑的循环不要把额度刷光"。
 */
const hits = new Map<string, { count: number; resetAt: number }>();

function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return request.headers.get('x-real-ip')?.trim() || 'local';
}

function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now >= entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count += 1;
  return entry.count > CHAT_LIMITS.requestsPerMinute;
}

/* ---------------- 入参 ---------------- */

interface ParsedBody {
  messages: ChatMessage[];
  emotion: string | null;
}

function parseBody(raw: unknown): { ok: true; value: ParsedBody } | { ok: false; reason: string } {
  if (typeof raw !== 'object' || raw === null) return { ok: false, reason: '请求格式不对。' };
  const input = raw as { messages?: unknown; emotion?: unknown };

  if (!Array.isArray(input.messages) || input.messages.length === 0) {
    return { ok: false, reason: '还没有可以回复的消息。' };
  }
  if (input.messages.length > CHAT_LIMITS.maxMessages) {
    return { ok: false, reason: '这段对话太长了，开一段新的吧。' };
  }

  const messages: ChatMessage[] = [];
  for (const item of input.messages) {
    if (typeof item !== 'object' || item === null) continue;
    const node = item as { role?: unknown; content?: unknown };
    if (node.role !== 'user' && node.role !== 'assistant') continue;
    if (typeof node.content !== 'string') continue;
    const content = node.content.trim();
    if (!content) continue;
    if (content.length > CHAT_LIMITS.maxCharsPerMessage) {
      return { ok: false, reason: `一条消息最多 ${CHAT_LIMITS.maxCharsPerMessage} 字。` };
    }
    messages.push({
      id: typeof (item as { id?: unknown }).id === 'string' ? (item as { id: string }).id : '',
      role: node.role,
      content,
      createdAt: 0,
    });
  }

  const total = messages.reduce((sum, message) => sum + message.content.length, 0);
  if (total > CHAT_LIMITS.maxTotalChars) {
    return { ok: false, reason: '这段对话太长了，开一段新的吧。' };
  }
  if (!messages.some((message) => message.role === 'user')) {
    return { ok: false, reason: '还没有可以回复的消息。' };
  }

  const emotion = typeof input.emotion === 'string' ? input.emotion.slice(0, 20) : null;
  return { ok: true, value: { messages, emotion } };
}

/* ---------------- SSEC ---------------- */

const encoder = new TextEncoder();

function frame(event: ChatEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

function sseHeaders(): HeadersInit {
  return {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Nginx 默认会把响应缓冲起来，攒满一屏才吐给浏览器 —— 关掉它
    'X-Accel-Buffering': 'no',
  };
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/* ---------------- 路由 ---------------- */

export async function POST(request: Request) {
  const key = clientKey(request);
  if (rateLimited(key)) {
    return jsonError('说得有点快，先歇一口气，稍后再试。', 429);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonError('请求格式不对。', 400);
  }

  const parsed = parseBody(raw);
  if (!parsed.ok) return jsonError(parsed.reason, 400);
  const { messages, emotion } = parsed.value;

  const provider = chatProvider();
  const lastUser = [...messages].reverse().find((message) => message.role === 'user');
  const text = lastUser?.content ?? '';

  /*
   * 风险识别：关键词先跑（零延迟、断网也在），没命中再问一次模型。
   * 命中时不进入任何"生成"路径 —— 直接下发固定的关怀卡片。
   */
  let risk = scanChatRisk(text);
  if (risk.level !== 'care') {
    const classified = await classifyRiskWithModel(text, provider);
    if (classified === 'care') risk = { level: 'care', matches: ['model'] };
  }

  if (risk.level === 'care') {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(frame({ type: 'care', care: carePayload(crisisResources()) }));
        controller.close();
      },
    });
    return new Response(body, { headers: sseHeaders() });
  }

  const system = [CHAT_SYSTEM_PROMPT, emotionContextLine(emotion)].filter(Boolean).join('\n\n');
  const abort = new AbortController();
  // 客户端断开（关页面 / 按停止）时把上游也掐掉，别让模型白跑
  request.signal.addEventListener('abort', () => abort.abort());

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let produced = '';
      let auditedAt = 0;
      let replaced = false;

      const push = (value: string) => {
        produced += value;
        controller.enqueue(frame({ type: 'delta', text: value }));
      };

      try {
        const generator = provider.apiKey
          ? streamFromModel(messages, provider, { system, signal: abort.signal })
          : streamLocalReply(messages, { emotion, signal: abort.signal });

        for await (const delta of generator) {
          if (abort.signal.aborted) break;

          /*
           * 输出审核不必每个字都跑：每多出 60 字查一次，
           * 既能拦住连续跑偏，又不会把生成速度拖成幻灯片。
           */
          if (produced.length - auditedAt >= 60) {
            auditedAt = produced.length;
            const audit = auditAssistantText(produced);
            if (!audit.ok && audit.replacement) {
              controller.enqueue(frame({ type: 'notice', text: audit.replacement }));
              replaced = true;
              break;
            }
          }
          push(delta);
        }

        if (!replaced) {
          const audit = auditAssistantText(produced);
          if (!audit.ok && audit.replacement) {
            controller.enqueue(frame({ type: 'notice', text: audit.replacement }));
            replaced = true;
          }
        }

        if (!replaced && !abort.signal.aborted) {
          controller.enqueue(frame({ type: 'done' }));
        }
      } catch (error) {
        if (!abort.signal.aborted) {
          controller.enqueue(
            frame({
              type: 'error',
              message: error instanceof Error ? error.message : '刚才没接上，试一次看看。',
            }),
          );
        }
      } finally {
        controller.close();
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, { headers: sseHeaders() });
}
