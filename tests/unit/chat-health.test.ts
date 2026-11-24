import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET } from '@/app/api/chat/health/route';

/**
 * `/api/chat/health` 是用户配完 Key 之后第一个打开的地址。
 *
 * 它只有一条硬约束值得钉死：**不能把 Key 露出去**。这条路由在公网上
 * 匿名可访问，回显头尾就等于把爆破空间从 40 位缩到 4 位。
 * 其余断言都在验"提示说得对不对"—— 这是它存在的全部理由。
 */

const ENV_KEYS = [
  'CHAT_API_KEY',
  'OPENAI_API_KEY',
  'CHAT_BASE_URL',
  'CHAT_MODEL',
  'CHAT_CLASSIFIER',
  'CHAT_CRISIS_RESOURCES',
] as const;

const saved: Record<string, string | undefined> = {};

const KEY = 'sk-proj-abcdefghijklmnopqrstuvwxyz012345';

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
});

async function readHealth() {
  const response = await GET();
  const text = await response.text();
  return {
    status: response.status,
    text,
    json: JSON.parse(text) as {
      configured: boolean;
      mode: string;
      vendor: string | null;
      baseUrl: string;
      model: string;
      classifier: boolean;
      crisisResources: number;
      hints: string[];
    },
    cacheControl: response.headers.get('Cache-Control'),
  };
}

describe('陪聊配置自检', () => {
  it('没配 Key 时明确说是本地模式，并提醒要重启 dev server', async () => {
    const { json, status } = await readHealth();
    expect(status).toBe(200);
    expect(json.configured).toBe(false);
    expect(json.mode).toBe('local');
    expect(json.classifier).toBe(false);
    expect(json.hints.join('\n')).toContain('本地陪伴模式');
    expect(json.hints.join('\n')).toContain('重启 dev server');
  });

  it('配好之后报 model 模式，并带上服务商与模型名', async () => {
    process.env.CHAT_API_KEY = KEY;
    process.env.CHAT_MODEL = 'deepseek-chat';
    const { json } = await readHealth();
    expect(json.configured).toBe(true);
    expect(json.mode).toBe('model');
    expect(json.vendor).toBe('DeepSeek');
    expect(json.baseUrl).toBe('https://api.deepseek.com/v1');
    expect(json.model).toBe('deepseek-chat');
  });

  it('响应体与响应头里都不出现 Key 的任何片段', async () => {
    process.env.CHAT_API_KEY = KEY;
    const { text } = await readHealth();
    expect(text).not.toContain(KEY);
    expect(text).not.toContain(KEY.slice(0, 8));
    expect(text).not.toContain(KEY.slice(-6));
  });

  it('结果不能被缓存 —— 改完 Key 刷新就要看到变化', async () => {
    const { cacheControl } = await readHealth();
    expect(cacheControl).toContain('no-store');
  });

  it('把整行 `CHAT_API_KEY=sk-…` 粘进值里会被点出来', async () => {
    process.env.CHAT_API_KEY = `CHAT_API_KEY=${KEY}`;
    const { json } = await readHealth();
    expect(json.hints.join('\n')).toContain('出现了「=」');
  });

  it('带引号、太短、填成网址都会被分别点出来', async () => {
    process.env.CHAT_API_KEY = `"${KEY}"`;
    expect((await readHealth()).json.hints.join('\n')).toContain('带着引号');

    process.env.CHAT_API_KEY = 'sk-short';
    expect((await readHealth()).json.hints.join('\n')).toContain('太短');

    process.env.CHAT_API_KEY = 'https://api.deepseek.com/v1';
    expect((await readHealth()).json.hints.join('\n')).toContain('填反了');
  });

  it('baseUrl 少了版本号会被提示', async () => {
    process.env.CHAT_API_KEY = KEY;
    process.env.CHAT_BASE_URL = 'https://api.deepseek.com';
    const { json } = await readHealth();
    expect(json.baseUrl).toBe('https://api.deepseek.com');
    expect(json.hints.join('\n')).toContain('版本号');
  });

  it('认不出的域名会提示核对，认得出来的不提示', async () => {
    process.env.CHAT_API_KEY = KEY;
    process.env.CHAT_BASE_URL = 'https://gateway.internal/v1';
    expect((await readHealth()).json.hints.join('\n')).toContain('认不出这个地址');

    process.env.CHAT_BASE_URL = 'https://api.moonshot.cn/v1';
    expect((await readHealth()).json.hints.join('\n')).not.toContain('认不出这个地址');
  });

  it('CHAT_CLASSIFIER=off 时分类器关闭，但仍算 model 模式', async () => {
    process.env.CHAT_API_KEY = KEY;
    process.env.CHAT_CLASSIFIER = 'off';
    const { json } = await readHealth();
    expect(json.mode).toBe('model');
    expect(json.classifier).toBe(false);
  });

  it('没配热线时提醒关怀卡片上不会有号码；配了则计数', async () => {
    expect((await readHealth()).json.crisisResources).toBe(0);

    process.env.CHAT_CRISIS_RESOURCES = JSON.stringify([
      { name: '心理援助热线', contact: '000-0000' },
    ]);
    const { json } = await readHealth();
    expect(json.crisisResources).toBe(1);
    expect(json.hints.join('\n')).not.toContain('不显示热线号码');
  });
});
