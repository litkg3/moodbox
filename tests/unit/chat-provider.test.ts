import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  chatProvider,
  guessVendor,
} from '@/lib/chat/config';
import { streamFromModel } from '@/lib/chat/provider';
import type { ChatMessage } from '@/lib/chat/types';

/**
 * 外部 Key 接入这一段的两块"看不见的接线"：
 *
 * 1. **配置解析** —— 只填 Key 不填地址时能不能猜对服务商、手滑粘进来的
 *    `/chat/completions` 会不会被吃掉；
 * 2. **上游报错的翻译** —— 状态码要变成人话，但上游 body 里如果回显了
 *    密钥片段，绝不能被带进聊天窗口。
 *
 * 真实的 Key 不在测试里出现：`fetch` 全部被替身接管，
 * 这样跑 CI 不发请求、也不花钱。
 */

const ENV_KEYS = ['CHAT_API_KEY', 'OPENAI_API_KEY', 'CHAT_BASE_URL', 'CHAT_MODEL'] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/* ---------------- 配置解析 ---------------- */

describe('陪聊的模型配置', () => {
  it('什么都没配时，回到 OpenAI 的默认值且 key 为空', () => {
    const provider = chatProvider();
    expect(provider.apiKey).toBe('');
    expect(provider.baseUrl).toBe(DEFAULT_BASE_URL);
    expect(provider.model).toBe(DEFAULT_MODEL);
  });

  it('只填 Key 不填地址时，凭模型名认出 DeepSeek / Moonshot / 百炼 / GLM', () => {
    const cases: [string, string][] = [
      ['deepseek-chat', 'https://api.deepseek.com/v1'],
      ['kimi-latest', 'https://api.moonshot.cn/v1'],
      ['glm-4-flash', 'https://open.bigmodel.cn/api/paas/v4'],
      ['qwen-plus', 'https://dashscope.aliyuncs.com/compatible-mode/v1'],
    ];
    for (const [model, expected] of cases) {
      process.env.CHAT_API_KEY = 'sk-test-0123456789abcdef';
      process.env.CHAT_MODEL = model;
      expect(chatProvider().baseUrl, model).toBe(expected);
    }
  });

  it('认不出来的模型名仍然落在 OpenAI 的地址上', () => {
    process.env.CHAT_API_KEY = 'sk-test-0123456789abcdef';
    process.env.CHAT_MODEL = 'some-self-hosted-model';
    expect(chatProvider().baseUrl).toBe(DEFAULT_BASE_URL);
  });

  it('地址结尾的斜杠与手滑粘上的 /chat/completions 都会被吃掉', () => {
    process.env.CHAT_BASE_URL = 'https://api.deepseek.com/v1/chat/completions';
    expect(chatProvider().baseUrl).toBe('https://api.deepseek.com/v1');

    process.env.CHAT_BASE_URL = 'https://api.moonshot.cn/v1///';
    expect(chatProvider().baseUrl).toBe('https://api.moonshot.cn/v1');
  });

  it('CHAT_API_KEY 优先于 OPENAI_API_KEY', () => {
    process.env.OPENAI_API_KEY = 'sk-from-openai-env';
    process.env.CHAT_API_KEY = 'sk-from-chat-env';
    expect(chatProvider().apiKey).toBe('sk-from-chat-env');

    delete process.env.CHAT_API_KEY;
    expect(chatProvider().apiKey).toBe('sk-from-openai-env');
  });

  it('模型名只写空白时回到默认值，不会把空串发给上游', () => {
    process.env.CHAT_MODEL = '   ';
    expect(chatProvider().model).toBe(DEFAULT_MODEL);
  });

  it('认得出来的地址能报出一个服务商名，认不出来就是 null', () => {
    expect(guessVendor('sk-x', 'https://api.deepseek.com/v1', 'deepseek-chat')).toBe('DeepSeek');
    expect(guessVendor('sk-x', 'https://example.internal/v1', 'foo')).toBeNull();
    expect(guessVendor('sk-x', DEFAULT_BASE_URL, 'gpt-4o-mini')).toBe('OpenAI');
  });
});

/* ---------------- 上游链路的替身 ---------------- */

const messages: ChatMessage[] = [
  { id: 'u1', role: 'user', content: '今天有点撑不住。', createdAt: 0 },
];

const provider = {
  apiKey: 'sk-test-0123456789abcdef',
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  classifier: false,
};

function sseBody(frames: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
}

async function drain(generator: AsyncGenerator<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const delta of generator) out.push(delta);
  return out;
}

describe('外部模型的流式链路', () => {
  it('半包的 SSE 帧会被拼回完整，只取 delta.content', async () => {
    const chunk1 = 'data: {"choices":[{"delta":{"content":"我在"}}]}\n\ndata: {"choices":[{"del';
    const chunk2 = 'ta":{"content":"听"}}]}\n\ndata: [DONE]\n\n';

    const fetchMock = vi.fn(async () => {
      const encoder = new TextEncoder();
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode(chunk1));
            controller.enqueue(encoder.encode(chunk2));
            controller.close();
          },
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const out = await drain(streamFromModel(messages, provider, { system: '你是陪聊。' }));
    expect(out).toEqual(['我在', '听']);

    // 请求确实打到了 baseUrl + /chat/completions，且带 Bearer
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.deepseek.com/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${provider.apiKey}`,
    );
    const body = JSON.parse(String(init.body)) as { messages: { role: string }[] };
    expect(body.messages[0]!.role).toBe('system');
  });

  it('401 会被翻成「Key 没通过验证」，而不是原样抛出状态码', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(sseBody([]), { status: 401 })),
    );
    await expect(drain(streamFromModel(messages, provider, { system: '' }))).rejects.toThrow(
      /Key 没通过验证/,
    );
  });

  it('上游错误体里回显的密钥会被替换掉，不会流到界面上', async () => {
    const leaky = JSON.stringify({
      error: {
        message: `Incorrect API key provided: ${provider.apiKey}. Check your account.`,
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(leaky, { status: 401 })),
    );

    let caught = '';
    try {
      await drain(streamFromModel(messages, provider, { system: '' }));
    } catch (error) {
      caught = error instanceof Error ? error.message : String(error);
    }
    expect(caught).toContain('Key 没通过验证');
    expect(caught).not.toContain(provider.apiKey);
    expect(caught).not.toContain('0123456789abcdef');
  });

  it('429 与 404 各自有一句能照着改的提示', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 429 })));
    await expect(drain(streamFromModel(messages, provider, { system: '' }))).rejects.toThrow(
      /额度或并发/,
    );

    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    await expect(drain(streamFromModel(messages, provider, { system: '' }))).rejects.toThrow(
      /地址或模型名不对/,
    );
  });

  it('上游返回一串非 JSON 的 HTML（代理的错误页）也不会把生成器炸掉', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>502 Bad Gateway</html>', { status: 502 })),
    );
    await expect(drain(streamFromModel(messages, provider, { system: '' }))).rejects.toThrow(
      /模型那边出了点问题/,
    );
  });
});

/* ---------------- DeepSeek 的版本号例外 ---------------- */

describe('地址版本号的判断', () => {
  it('DeepSeek 认成"不要求版本号"，其余服务商认成"要求"', async () => {
    const { versionRequired } = await import('@/lib/chat/config');
    // 用户实测反馈：DeepSeek 少写 /v1 也能用，实测 /nope 都返回同样的 401
    expect(versionRequired('https://api.deepseek.com')).toBe(false);
    expect(versionRequired('https://api.deepseek.com/v1')).toBe(false);
    expect(versionRequired('https://api.moonshot.cn')).toBe(true);
    expect(versionRequired('https://dashscope.aliyuncs.com/compatible-mode')).toBe(true);
    // 认不出的自建网关：按"要"处理，提示一下无害
    expect(versionRequired('https://gateway.internal/llm')).toBe(true);
  });
});

describe('上游错误体里的密钥擦除', () => {
  it('服务商回显的尾号（****uvwx 这种）也会被抹掉', async () => {
    // DeepSeek 的真实措辞：Your api key: ****uvwx is invalid
    const leaky = JSON.stringify({
      error: { message: 'Authentication Fails, Your api key: ****uvwx is invalid', type: 'authentication_error' },
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(leaky, { status: 401 })));

    let caught = '';
    try {
      await drain(streamFromModel(messages, { ...provider, apiKey: 'sk-abcdefghijklmnopqrstuvwx' }, { system: '' }));
    } catch (error) {
      caught = error instanceof Error ? error.message : String(error);
    }
    expect(caught).toContain('Key 没通过验证');
    expect(caught).not.toContain('uvwx');
    expect(caught).not.toContain('****');
    // 还是句人话，不是"（***）"这种残句
    expect(caught).toContain('api key *** is invalid');
  });

  it('不带分隔符的普通英文不会被误伤', async () => {
    // "the key is missing" 里 "key is" 不是密钥，不能被咬掉
    const plain = JSON.stringify({ error: { message: 'the key is missing from the request' } });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(plain, { status: 401 })));

    let caught = '';
    try {
      await drain(streamFromModel(messages, provider, { system: '' }));
    } catch (error) {
      caught = error instanceof Error ? error.message : String(error);
    }
    expect(caught).toContain('the key is missing');
  });
});
