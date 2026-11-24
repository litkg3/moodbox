/**
 * 陪聊的安全层。
 *
 * 三件事，顺序不能反：
 * 1. **进来先看用户在说什么**（自伤 / 自杀 / 他伤）。命中就不走普通回复，
 *    改发一张固定的关怀卡片 —— 这时候任何"我来陪你分析一下"都是错的；
 * 2. **出去再看模型说了什么**（联系方式、诊断、药物、承诺保密、鼓励依赖）。
 *    模型偶尔会越界，这一层是最后一道闸；
 * 3. **不做判断，只做匹配**。命中不等于这个人处于危险中，所以卡片上的措辞
 *    是"我很在意你刚才说的"，不是任何结论。
 *
 * 关键词先跑：它零延迟、可解释、断网也在。模型分类只作为补充 ——
 * 只有配了 Key、且关键词没命中时才多问一次，问不到就当作 SAFE。
 */

import { CRISIS_PATTERNS, scanForCrisis } from '@/lib/crisis';
import { scanSensitive } from '@/lib/sensitive';
import type { CarePayload, CareResource } from '@/lib/chat/types';
import type { ChatProvider } from '@/lib/chat/config';

export type RiskLevel = 'none' | 'watch' | 'care';

export interface RiskScan {
  level: RiskLevel;
  /** 命中的规则 id，只写进日志，不上界面 */
  matches: string[];
}

/**
 * 他伤：指向别人的表达。
 *
 * 单独一组 —— `crisis.ts` 只管自伤，而"我想杀了他"同样不该得到一段
 * 情绪梳理式的回复。
 */
const HARM_OTHERS: { id: string; pattern: RegExp }[] = [
  { id: 'harm-other', pattern: /杀(了|掉)?(他|她|它|你|人)|弄死(他|她|你)|捅死|砍死/ },
  { id: 'revenge', pattern: /报复社会|同归于尽|让他也(尝尝|不好过)|拉(他|她|所有人)一起/ },
  { id: 'hurt-other', pattern: /想(要)?(伤害|打|揍)(别人|他|她)|控制不住想打人/ },
];

/** 模糊信号：不弹卡片，但值得让模型把语速放慢、多问一句 */
const WATCH_PATTERNS: { id: string; pattern: RegExp }[] = [
  { id: 'hopeless', pattern: /撑不下去|坚持不住|熬不住|看不到(头|希望)|没有意义/ },
  { id: 'vanish', pattern: /想(要)?消失|不想(再)?面对|躲起来再也不出来/ },
  { id: 'alone', pattern: /没有人(在乎|在意|需要)我|一个人都(没有|没)/ },
];

export function scanChatRisk(text: string): RiskScan {
  const normalized = text.replace(/\s+/g, '');
  if (!normalized) return { level: 'none', matches: [] };

  const matches: string[] = [];

  const self = scanForCrisis(text);
  if (self.flagged) matches.push(...self.matches);

  for (const rule of HARM_OTHERS) {
    if (rule.pattern.test(normalized)) matches.push(rule.id);
  }
  if (matches.length > 0) return { level: 'care', matches };

  const watch = WATCH_PATTERNS.filter((rule) => rule.pattern.test(normalized)).map(
    (rule) => rule.id,
  );
  if (watch.length > 0) return { level: 'watch', matches: watch };

  return { level: 'none', matches: [] };
}

/**
 * 用模型再做一次分类。
 *
 * 只在"关键词没命中、但这句话可能有点重"时调用（长度 ≥ 6 字）。
 * 超时或返回格式不对一律当 SAFE：安全层不能因为网络抖动就把每条消息
 * 都变成关怀卡片 —— 那会让人不敢说话。
 */
export async function classifyRiskWithModel(
  text: string,
  provider: ChatProvider,
  signal?: AbortSignal,
): Promise<RiskLevel> {
  if (!provider.apiKey || !provider.classifier) return 'none';
  if (text.trim().length < 6) return 'none';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);

  try {
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: provider.model,
        temperature: 0,
        max_tokens: 4,
        messages: [
          {
            role: 'system',
            content:
              '你是风险分类器。判断这句话的作者是否存在自伤、自杀或伤害他人的意图或计划。' +
              '只输出一个词：CARE（存在风险）或 SAFE（不存在）。不要解释。',
          },
          { role: 'user', content: text.slice(0, 1000) },
        ],
      }),
    });
    if (!response.ok) return 'none';
    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const answer = data.choices?.[0]?.message?.content?.toUpperCase() ?? '';
    return answer.includes('CARE') ? 'care' : 'none';
  } catch {
    return 'none';
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** 关怀卡片。文案固定，不随命中的关键词变化 —— 这时候不该有"个性化" */
export function carePayload(resources: CareResource[]): CarePayload {
  return {
    title: '我很在意你刚才说的',
    body:
      '听起来，你现在承受的东西很重。你不需要一个人扛着：如果身边有信得过的人，' +
      '可以现在就告诉对方；如果此刻你担心自己或别人会受伤，请立刻拨打 120，' +
      '或者去最近的急诊。',
    urgent: true,
    resources,
  };
}

/** 输出审核的结论 */
export interface OutputAudit {
  ok: boolean;
  reason?: string;
  /** 命中时替换成的安全结尾 */
  replacement?: string;
}

const MEDICAL = /(\d+\s*(mg|毫克|片|粒))|处方|剂量|停药|换成(药|这种药)/i;
const OVERREACH = /(我保证|绝对保密|只有我(懂|理解)你|别告诉(任何)?人|你只需要我)/;
/*
 * 两种句式都要抓：
 *   a. 带人称的 —— "你这是抑郁症" / "你得的 是抑郁" / "你患有焦虑障碍"；
 *   b. 不带人称的 —— "确诊为双相"（模型经常这样收尾，主语是省略的）。
 * 早先只写了 `(你(得的)?是)`，第一组内部不允许有空格，于是"你得的 是抑郁"
 * 会漏；拆开成"人称 + 0~6 字连接词 + 判词"才盖得住。
 */
const DIAGNOSIS =
  /((你|您)[^。！？]{0,6}(是|得了|患有|得的|确诊|属于)|确诊(为|是|了))[^。！？]{0,8}(抑郁|焦虑|双相|精神病|躁郁|强迫症|进食障碍|人格障碍)/;

/**
 * 模型输出的最后一道闸。
 *
 * 这里不追求"识别所有问题"，只拦住最不该出现的那几类：
 * 具体药物与剂量、诊断式结论、"只有我懂你/我保证保密"这类把人往 AI 身上
 * 拽的话，以及任何联系方式 —— 后者是站内统一的红线。
 */
export function auditAssistantText(text: string): OutputAudit {
  const compact = text.replace(/\s+/g, '');
  if (!compact) return { ok: true };

  if (MEDICAL.test(compact)) {
    return {
      ok: false,
      reason: 'medical',
      replacement: '涉及具体药物和剂量的事，还是要问医生或药师，我不能替你判断。',
    };
  }
  if (DIAGNOSIS.test(compact)) {
    return {
      ok: false,
      reason: 'diagnosis',
      replacement: '我不能给你下任何诊断。如果这些感受持续困扰你，找专业的人聊一次会更稳妥。',
    };
  }
  if (OVERREACH.test(compact)) {
    return {
      ok: false,
      reason: 'overreach',
      replacement: '我能陪你把话说完，但真正接住你的，还是身边的人。',
    };
  }

  const sensitive = scanSensitive(text);
  if (sensitive.hit && sensitive.reason === '联系方式') {
    return { ok: false, reason: 'contact', replacement: '这里不留联系方式，我们继续聊就好。' };
  }

  if (scanChatRisk(text).level === 'care') {
    return { ok: false, reason: 'risk-echo', replacement: '这部分我不展开说。你现在的安全最重要。' };
  }

  return { ok: true };
}

/** 自检用：把关键词规则暴露出来，单测里逐条跑 */
export const RISK_RULE_COUNT =
  CRISIS_PATTERNS.length + HARM_OTHERS.length + WATCH_PATTERNS.length;
