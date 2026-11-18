/**
 * 回复里的敏感词识别。
 *
 * 定位：这是**体验层的第一道提示**，不是内容安全的全部。
 * 它做两件事：挡住明显不适合出现在广场上的表达，并告诉对方
 * 「换个说法」而不是冷冰冰地报错。真正要上纲上线的场景，
 * 仍然应该在服务端再做一遍（见 supabase/schema.sql 的注释）。
 *
 * 分工说明：自伤 / 自杀相关的表达**不在这里**，交给 `lib/crisis.ts` ——
 * 那里是一段温和的确认，不是拦截。两套规则不要混在一起，
 * 否则一个求助的人会先被"敏感词"挡在门外。
 */

/**
 * 词表按用途分组，命中任意一条即提示修改。
 *
 * 规则：只收「明确不适合公开广场」的词，宁少勿多 ——
 * 误伤一句真心话，比漏掉一句脏话更糟。
 */
const WORD_GROUPS: Record<string, string[]> = {
  辱骂: [
    '傻逼',
    '煞笔',
    '沙比',
    '脑残',
    '弱智',
    '智障',
    '贱人',
    '婊子',
    '狗东西',
    '滚出去',
    '废物点心',
  ],
  威胁: ['弄死你', '打死你', '砍死你', '人肉你', '杀你全家', '等着挨揍'],
  诈骗引流: [
    '加微信',
    '加vx',
    '加v信',
    '私聊领',
    '刷单',
    '日赚',
    '躺赚',
    '带你赚钱',
    '兼职日结',
    '高额返利',
    '稳赚不赔',
    '内部渠道',
    '代开发票',
    '办假证',
    '贷款秒批',
    '高利贷',
    '裸贷',
    '洗钱',
  ],
  赌博: ['博彩', '网赌', '赌博网站', '六合彩', '时时彩', '棋牌代理'],
  色情: ['约炮', '裸聊', '援交', '包养', '一夜情', '成人视频', '黄片', '色情服务'],
  违禁品: ['冰毒', '摇头丸', '大麻', 'k粉', '麻古', '制毒', '炸药配方', '枪支买卖'],
  代考作弊: ['代考', '枪手代考', '答案出售'],
};

const ALL_WORDS = Array.from(new Set(Object.values(WORD_GROUPS).flat()));

/** 词表规模（自检脚本与测试用，避免词表被误删成空）。 */
export const SENSITIVE_WORD_COUNT = ALL_WORDS.length;

export interface SensitiveScan {
  hit: boolean;
  /** 命中的原始词（去重、按词表顺序） */
  words: string[];
  /** 打码后的词，用于给用户提示，不在界面上复述脏话 */
  masked: string[];
  /** 命中的分组，便于将来做更细的文案 */
  categories: string[];
}

const EMPTY: SensitiveScan = { hit: false, words: [], masked: [], categories: [] };

/**
 * 归一化：全角转半角、小写、去掉空白与标点符号。
 * 这样「傻 逼」「傻*逼」「傻。逼」都能被认出来。
 */
export function normalizeForScan(input: string): string {
  if (!input) return '';
  let text = input;
  try {
    text = input.normalize('NFKC');
  } catch {
    // 极老的浏览器不支持 normalize，退回原串
  }
  return text.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}

/** 打码：保留首字，其余用 * 代替。 */
export function maskWord(word: string): string {
  if (word.length <= 1) return '*';
  return `${word[0]}${'*'.repeat(word.length - 1)}`;
}

/** 扫一遍文本。返回命中的词与打码结果，调用方决定是提示还是拦截。 */
export function scanSensitive(input: string): SensitiveScan {
  const text = normalizeForScan(input);
  if (!text) return EMPTY;

  const words: string[] = [];
  const categories: string[] = [];

  for (const [category, group] of Object.entries(WORD_GROUPS)) {
    for (const word of group) {
      if (!words.includes(word) && text.includes(normalizeForScan(word))) {
        words.push(word);
        if (!categories.includes(category)) categories.push(category);
      }
    }
  }

  if (words.length === 0) return EMPTY;
  return { hit: true, words, masked: words.map(maskWord), categories };
}
