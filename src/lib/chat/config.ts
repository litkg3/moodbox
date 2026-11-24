/**
 * 陪聊的服务端配置。
 *
 * 这里的每一项都只在服务端读（`process.env` 不带 NEXT_PUBLIC_ 前缀），
 * API Key 不会被打进客户端 bundle。
 *
 * 没有配置模型时，接口退到「本地陪伴模式」：用规则生成一段温和的回应，
 * 仍然按 SSE 逐段吐出去。这样在离线演示、自动化测试、以及用户还没
 * 申请到模型额度时，整个页面都是可用的 —— 而不是先给一个红色报错。
 */

export interface ChatProvider {
  apiKey: string;
  baseUrl: string;
  model: string;
  /** 是否用模型做一次"这句话危险吗"的分类（关键词未命中时） */
  classifier: boolean;
}

export const CHAT_LIMITS = {
  /** 一次请求最多带多少条历史 */
  maxMessages: 40,
  /** 单条消息最多多少字 */
  maxCharsPerMessage: 2000,
  /** 一次请求的总字数上限 */
  maxTotalChars: 12000,
  /** 每个 IP 每分钟最多几次 */
  requestsPerMinute: 12,
  /** 模型输出上限，防止它自己写成一篇论文 */
  maxOutputTokens: 700,
} as const;

export function chatProvider(): ChatProvider {
  return {
    apiKey: (process.env.CHAT_API_KEY ?? process.env.OPENAI_API_KEY ?? '').trim(),
    baseUrl: (process.env.CHAT_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/+$/, ''),
    model: (process.env.CHAT_MODEL ?? 'gpt-4o-mini').trim(),
    classifier: process.env.CHAT_CLASSIFIER !== 'off',
  };
}

/**
 * 求助热线。
 *
 * 需求里写得很清楚：从配置读取，**缺省时不显示号码**。所以默认返回空数组，
 * 由运维在部署环境里用一段 JSON 填上当地核实过的热线：
 *
 *   CHAT_CRISIS_RESOURCES='[{"name":"...","contact":"...","note":"24 小时"}]'
 *
 * 解析失败就当作没配置 —— 宁可只显示「联系身边的人或拨打 120」，
 * 也不要把一条可能已经停机的号码摆在最需要它的人面前。
 */
export function crisisResources(): { name: string; contact: string; note?: string }[] {
  const raw = process.env.CHAT_CRISIS_RESOURCES;
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is { name: string; contact: string; note?: string } =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as { name?: unknown }).name === 'string' &&
          typeof (item as { contact?: unknown }).contact === 'string',
      )
      .slice(0, 4);
  } catch {
    return [];
  }
}

/** 本地模式的节奏：每块多少个字、间隔多久。数值偏慢一点，读起来才像在"想说" */
export const LOCAL_STREAM = { chunk: 3, delayMs: 26 } as const;
