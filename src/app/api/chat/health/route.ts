import { NextResponse } from 'next/server';
import {
  CHAT_LIMITS,
  chatProvider,
  crisisResources,
  guessVendor,
  versionRequired,
} from '@/lib/chat/config';

/**
 * 陪聊配置的自检。
 *
 * 存在的理由很实际：配了 Key 却还在说"本地陪伴"的话，用户没法判断是
 * 代码没生效、Key 填错了、还是 baseUrl 少了 `/v1`。这个接口把判断依据
 * 直接摆出来，省掉一轮"我明明配了啊"。
 *
 * **不返回 Key 本身，也不返回它的任何片段** —— 这条路由在公网上是匿名可访问的，
 * 露头尾等于把爆破空间从 40 位缩到 4 位。只回"有没有配、格式像不像"。
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const provider = chatProvider();
  const resources = crisisResources();
  const configured = provider.apiKey.length > 0;
  const vendor = guessVendor(provider.apiKey, provider.baseUrl, provider.model);

  const hints: string[] = [];

  if (!configured) {
    hints.push(
      '没有读到 CHAT_API_KEY（或 OPENAI_API_KEY），当前走本地陪伴模式：回复由规则生成，不调用模型。',
    );
    hints.push(
      '改完 .env.local 要重启 dev server —— Next 只在启动时读一次环境变量，热更新不会重新加载它。',
    );
  } else {
    /*
     * 几个最常见的填错方式。都只给"像不像"，不回显内容：
     * - 把整行 `CHAT_API_KEY=sk-...` 粘进了值里；
     * - 粘的时候带上了引号；
     * - 长度明显不对（正常 key 至少 20 位）。
     */
    if (provider.apiKey.includes('=')) {
      hints.push('CHAT_API_KEY 里出现了「=」，可能把 `CHAT_API_KEY=` 这段也一起粘进去了。');
    }
    if (/^["']|["']$/.test(provider.apiKey)) {
      hints.push('CHAT_API_KEY 带着引号，值里不要加引号。');
    }
    if (provider.apiKey.length < 20) {
      hints.push('CHAT_API_KEY 太短，正常长度在 20 位以上。');
    }
    if (/^https?:\/\//.test(provider.apiKey)) {
      hints.push('CHAT_API_KEY 看起来是一个网址 —— 可能把 baseUrl 和 Key 填反了。');
    }
    if (/\s/.test(provider.apiKey)) {
      hints.push('CHAT_API_KEY 中间有空格或换行，可能复制时断行了。');
    }
    /*
     * 地址是否缺版本号。
     *
     * 只在"这家服务商确实要求版本号"时才提示：DeepSeek 两种写法都收
     * （实测 `/v1/chat/completions` 与 `/chat/completions` 等价），
     * 对它念这句只会让人白跑一趟。
     */
    if (versionRequired(provider.baseUrl) && !/\/v?\d/i.test(provider.baseUrl)) {
      hints.push(
        `CHAT_BASE_URL 现在是 ${provider.baseUrl}，多数服务要以版本号结尾（如 /v1）。确认一下再试。`,
      );
    }
    if (!vendor) {
      hints.push(
        '认不出这个地址是哪家服务商。如果用的是自建网关或代理，忽略这条；否则核对 CHAT_BASE_URL 是否填成了别家的。',
      );
    }
  }

  if (resources.length === 0) {
    hints.push(
      '没有配置 CHAT_CRISIS_RESOURCES，关怀卡片只显示「联系身边的人或拨打 120」，不显示热线号码。',
    );
  }

  return NextResponse.json(
    {
      /* 能不能用真模型说话 */
      configured,
      mode: configured ? 'model' : 'local',
      vendor,
      baseUrl: provider.baseUrl,
      model: provider.model,
      /* 关键词没命中时，是否再用模型判一次风险 */
      classifier: configured && provider.classifier,
      crisisResources: resources.length,
      limits: CHAT_LIMITS,
      hints,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
