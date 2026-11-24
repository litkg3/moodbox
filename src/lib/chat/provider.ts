/**
 * 模型调用的两种实现。
 *
 * - `streamFromModel`：配了 Key 就走 OpenAI 兼容接口，边收边吐；
 * - `streamLocalReply`：没配 Key 时用规则拼一段温和的回应，同样按 SSE
 *   逐段吐出去，节奏与真模型接近 —— 页面、停止按钮、失败重试这些
 *   交互不用因为"没有 Key"而分叉。
 *
 * 两个函数都只产出纯文本片段，SSE 的编码交给 route.ts，
 * 这样测试可以直接对生成器取值，不必起 HTTP 服务。
 */

import { LOCAL_STREAM, type ChatProvider } from '@/lib/chat/config';
import type { ChatMessage } from '@/lib/chat/types';

interface WireMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function toWire(messages: ChatMessage[]): WireMessage[] {
  return messages
    .filter((message) => message.content.trim().length > 0)
    .slice(-24)
    .map((message) => ({ role: message.role, content: message.content.slice(0, 2000) }));
}

/**
 * 状态码 → 一句"接下来该改什么"。
 *
 * 401/403 是最常见的两种情况（Key 填错、Key 没这个模型的权限），
 * 429 是额度或并发，400 通常是模型名写错或该服务商不认 `max_tokens`。
 * 说清楚比说"失败了"有用得多 —— 用户没法从 401 数字里看出要改哪儿。
 */
function statusHint(status: number): string {
  switch (status) {
    case 401:
      return '模型的 Key 没通过验证';
    case 403:
      return '这个 Key 没有调用该模型的权限';
    case 404:
      return '地址或模型名不对，模型那边找不到';
    case 429:
      return '模型额度或并发到上限了，过一会儿再试';
    case 400:
      return '模型没接受这次请求，多半是模型名写错了';
    default:
      return status >= 500 ? '模型那边出了点问题，稍后再试' : '模型暂时没有回应';
  }
}

/**
 * 从上游的错误体里摘一句"短、且不含密钥"的说明。
 *
 * 只取 `error.message` 这一层的字符串，截到 80 字，并且把任何长得像
 * `sk-xxxx` 的串替换掉 —— 有的服务商会把请求头原样回显在错误里。
 * 拿不到就返回空串，宁可不解释也不要漏出去。
 */
async function readUpstreamError(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return '';
    let message = '';
    try {
      const data = JSON.parse(text) as { error?: unknown; message?: unknown };
      const node = (data.error ?? data) as { message?: unknown };
      if (typeof node.message === 'string') message = node.message;
      else if (typeof data.message === 'string') message = data.message;
    } catch {
      message = text.slice(0, 200);
    }
    return message
      .replace(/\b(sk|ak|key)[-_A-Za-z0-9]{6,}/gi, '***')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);
  } catch {
    return '';
  }
}

/**
 * 真模型：解析上游的 SSE。
 *
 * 上游一帧可能是半行、也可能一行里带好几个 data，所以用缓冲把不完整的
 * 尾巴留到下一次；只取 `delta.content`，其余（role、finish_reason）忽略。
 */
export async function* streamFromModel(
  messages: ChatMessage[],
  provider: ChatProvider,
  options: { system: string; signal?: AbortSignal },
): AsyncGenerator<string> {
  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
    },
    signal: options.signal,
    body: JSON.stringify({
      model: provider.model,
      stream: true,
      temperature: 0.7,
      /*
       * 用 `max_tokens` 而不是 `max_completion_tokens`：后者只有新的
       * OpenAI 模型认，而 DeepSeek / 百炼 / GLM 这些兼容接口多数还停在
       * 老字段上。改成一个的名字，另一批就报 400。
       */
      max_tokens: 700,
      messages: [{ role: 'system', content: options.system }, ...toWire(messages)],
    }),
  });

  if (!response.ok || !response.body) {
    /*
     * 上游的错误码要翻译成人话，但**不能把上游的报错原文直出到界面**：
     * 有些服务商会在 401 的 body 里回显一段被截断的 key，那就等于把
     * 密钥贴到了聊天窗口里。这里只按状态码给对应的下一步动作。
     */
    const detail = await readUpstreamError(response);
    throw new Error(`${statusHint(response.status)}${detail ? `（${detail}）` : ''}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        index = buffer.indexOf('\n');

        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const frame = JSON.parse(payload) as {
            choices?: { delta?: { content?: string } }[];
          };
          const text = frame.choices?.[0]?.delta?.content;
          if (text) yield text;
        } catch {
          // 上游偶尔会发心跳或注释行，忽略即可
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

const OPENERS: Record<string, string> = {
  难过: '听起来，这件事压得你挺沉的。',
  委屈: '被这样对待，心里一定很不是滋味。',
  焦虑: '那种悬着放不下来的感觉，确实很耗人。',
  累: '你已经撑了挺久了，累是正常的。',
  生气: '这件事确实让人火大，你的反应不过分。',
  孤独: '一个人扛着这些，会很安静，也很难。',
  麻木: '什么都感觉不到，有时候比难过还让人害怕。',
  开心: '听起来今天有件让你亮起来的事。',
  分手: '结束一段关系，心里会空出一块。',
  考试: '被考试追着跑的日子，很容易喘不过气。',
};

const FOLLOW_UPS = [
  '愿意的话，可以再多说一点 —— 是从哪一刻开始变成这样的？',
  '这件事里，最让你难受的是哪一部分？',
  '你现在更想要一个答案，还是只想有人听你把话说完？',
  '如果此刻有一个信得过的人在旁边，你最想对他说什么？',
];

const GROUNDING = [
  '如果这种感觉一直在，找一个现实里的人说说会更有着落 —— 朋友、家人，或者学校的心理老师都可以。',
  '我能陪你把话说完，但真正能接住你的，还是身边的人。',
  '要是这几天一直这样，去和专业的人聊一次也不丢人。',
];

const REST = '我们已经聊了一会儿了。要不要先放一放，去喝口水、走两步，回来再接着说？';

function detectTopic(text: string): string | null {
  const table: [string, string[]][] = [
    ['难过', ['难过', '伤心', '哭', '低落', '沮丧']],
    ['委屈', ['委屈', '不公平', '凭什么', '被冤枉']],
    ['焦虑', ['焦虑', '紧张', '担心', '慌', '睡不着']],
    ['累', ['累', '疲惫', '撑不住', '没力气']],
    ['生气', ['生气', '愤怒', '气死', '火大', '烦躁']],
    ['孤独', ['孤独', '一个人', '没人', '寂寞']],
    ['麻木', ['麻木', '没感觉', '空的']],
    ['开心', ['开心', '高兴', '好消息', '顺利']],
    ['分手', ['分手', '失恋', '离开我']],
    ['考试', ['考试', '成绩', '复习', '考研']],
  ];
  for (const [topic, words] of table) {
    if (words.some((word) => text.includes(word))) return topic;
  }
  return null;
}

/**
 * 本地陪伴模式。
 *
 * 不假装懂心理治疗，只做四件事：复述一点对方的处境、给一句接住的话、
 * 问一个不冒犯的问题、适时把人往现实里推。轮次多了会主动建议休息 ——
 * 这一条是产品要求，也是这类产品最容易忘的一条。
 */
export async function* streamLocalReply(
  messages: ChatMessage[],
  options: { emotion?: string | null; signal?: AbortSignal },
): AsyncGenerator<string> {
  const userTurns = messages.filter((message) => message.role === 'user');
  const last = userTurns.at(-1)?.content ?? '';
  const topic = detectTopic(last) ?? options.emotion ?? null;

  const opener = topic && OPENERS[topic] ? OPENERS[topic] : '我在听，你慢慢说。';
  const follow = FOLLOW_UPS[userTurns.length % FOLLOW_UPS.length]!;
  const ground = GROUNDING[userTurns.length % GROUNDING.length]!;

  const parts = [opener, follow, ground];
  // 聊到第 6 轮往后再加一句休息的建议，不要每轮都念
  if (userTurns.length >= 6) parts.push(REST);

  const text = parts.join('');
  const chars = Array.from(text);

  for (let index = 0; index < chars.length; index += LOCAL_STREAM.chunk) {
    if (options.signal?.aborted) return;
    await new Promise((resolve) => setTimeout(resolve, LOCAL_STREAM.delayMs));
    if (options.signal?.aborted) return;
    yield chars.slice(index, index + LOCAL_STREAM.chunk).join('');
  }
}
