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

/**
 * 中国大陆常被问到的几家的默认地址。
 *
 * 存在的意义只有一条：用户填了 `CHAT_API_KEY` 却忘了 `CHAT_BASE_URL` 时，
 * 默认值 OpenAI 的地址在国内直连大概率超时，报错还会长得像"Key 不对"。
 * 这里只能认**服务商域名**，认不出模型名 —— `deepseek-chat` 这种名字
 * 在别家可能也有。认不出就如实回到 OpenAI 的默认值，由 health 提示。
 */
const KNOWN_HOSTS: { suffix: string; baseUrl: string; note: string }[] = [
  { suffix: 'deepseek.com', baseUrl: 'https://api.deepseek.com/v1', note: 'DeepSeek' },
  { suffix: 'moonshot.cn', baseUrl: 'https://api.moonshot.cn/v1', note: 'Moonshot' },
  {
    suffix: 'dashscope.aliyuncs.com',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    note: '阿里云百炼',
  },
  { suffix: 'bigmodel.cn', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', note: '智谱 GLM' },
  { suffix: 'volces.com', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', note: '火山方舟' },
  { suffix: 'siliconflow.cn', baseUrl: 'https://api.siliconflow.cn/v1', note: '硅基流动' },
];

export const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
export const DEFAULT_MODEL = 'gpt-4o-mini';

/** 地址里去掉结尾斜杠，顺手去掉手滑粘进来的 `/chat/completions` */
function normalizeBaseUrl(raw: string | undefined): string {
  const value = (raw ?? '').trim().replace(/\/+$/, '');
  if (!value) return DEFAULT_BASE_URL;
  return value.replace(/\/chat\/completions$/, '');
}

/** 从模型名、也可从地址反推一个"像是哪家"的标签，纯展示用 */
export function guessVendor(apiKey: string, baseUrl: string, model: string): string | null {
  for (const host of KNOWN_HOSTS) {
    if (baseUrl.includes(host.suffix)) return host.note;
  }
  if (!baseUrl || baseUrl === DEFAULT_BASE_URL) {
    // 用户只填了 Key：OpenAI 的 key 以 sk- 开头且没有别的线索
    if (apiKey.startsWith('sk-') && /^(gpt|o\d|chatgpt)/i.test(model)) return 'OpenAI';
  }
  return null;
}

/** 只填了 Key、没填地址时，能不能凭模型名认出来 */
function baseUrlForModel(model: string): string | null {
  if (/^deepseek/i.test(model)) return 'https://api.deepseek.com/v1';
  if (/^(moonshot|kimi)/i.test(model)) return 'https://api.moonshot.cn/v1';
  if (/^(glm|chatglm)/i.test(model)) return 'https://open.bigmodel.cn/api/paas/v4';
  if (/^qwen/i.test(model)) return 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  return null;
}

export function chatProvider(): ChatProvider {
  const apiKey = (process.env.CHAT_API_KEY ?? process.env.OPENAI_API_KEY ?? '').trim();
  const model = (process.env.CHAT_MODEL ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL;

  // 地址没配时，先看能不能从模型名认出来，认不出再回 OpenAI
  const baseUrl = normalizeBaseUrl(
    process.env.CHAT_BASE_URL ?? baseUrlForModel(model) ?? DEFAULT_BASE_URL,
  );

  return {
    apiKey,
    baseUrl,
    model,
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
