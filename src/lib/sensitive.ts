/**
 * 广场内容的内容安全识别。
 *
 * 定位：这是**体验层的第一道提示**，不是内容安全的全部。
 * 它做两件事：挡住明显不适合出现在广场上的表达，并告诉对方
 * 「换个说法」而不是冷冰冰地报错。真正要上纲上线的场景，
 * 仍然应该在服务端再做一遍（见 supabase/schema.sql 的注释）。
 *
 * 分工说明：自伤 / 自杀相关的表达**不在这里**，交给 `lib/crisis.ts` ——
 * 那里是一段温和的确认，不是拦截。两套规则不要混在一起，
 * 否则一个求助的人会先被"敏感词"挡在门外。
 *
 * 三类判定，按「是不是肯定不该发」排序：
 * 1. 硬词表（黄赌毒、诈骗引流、辱骂、违禁品……）—— 命中一条即拦；
 * 2. 联系方式（手机号、微信号、二维码、站外链接）—— 命中即拦，
 *    这是广告与拉人最主要的载体，且几乎不存在「正常倾诉」的用法；
 * 3. 广告特征 / 引战特征 —— 攒够两处才拦。单说「出」「招人」太常见，
 *    一条就判会误伤真心话。
 * 宁少勿多：误伤一句真心话，比漏掉一句脏话更糟。
 */

/** 词表条目：字符串即「包含匹配」，正则用于需要词形约束的说法。 */
type Rule = string | RegExp;

/** 词表按用途分组。 */
const WORD_GROUPS: Record<string, Rule[]> = {
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
    '废物点心',
    '滚出去',
    '去死吧',
    '死全家',
    /你妈(死|没)了/u,
  ],
  威胁: ['弄死你', '打死你', '砍死你', '人肉你', '杀你全家', '等着挨揍', '让你好看'],
  诈骗引流: [
    /*
     * 「私聊我」「私信我」不在这里。
     *
     * 它们确实是引流的常见话术，但广场上「你愿意的话私聊我」是
     * 一句再正常不过的安慰 —— 单凭这三个字判死会伤到最该被留下的话。
     * 它们改放到 AD_RULES 里按「攒够两处」处理：单独出现不拦，
     * 和「日赚」「优惠」凑在一起才拦。
     */
    '私我领',
    '私信我领',
    '私聊领',
    '私我领取',
    '刷单',
    '日赚',
    '躺赚',
    '带你赚钱',
    '带你上岸',
    '兼职日结',
    '高额返利',
    '稳赚不赔',
    '内部渠道',
    '内部名额',
    '代开发票',
    '办假证',
    '贷款秒批',
    '高利贷',
    '裸贷',
    '洗钱',
    '洗白',
    '刷流水',
    '跑分',
    '引流',
    '推广位',
    '代理招人',
  ],
  赌博: [
    '博彩',
    '网赌',
    '赌博网站',
    '六合彩',
    '时时彩',
    '棋牌代理',
    '彩票代理',
    '下注赢',
    '下注平台',
    '下注网址',
    '百家乐',
    'AG真人',
    '澳门赌场',
    '菠菜',
    '开奖结果',
    '稳赚包赔',
  ],
  色情: [
    '约炮',
    '裸聊',
    '援交',
    '包养',
    '一夜情',
    '成人视频',
    '黄片',
    '看片',
    '色情服务',
    '上门服务',
    '小姐上门',
    '福利姬',
    '楼凤',
    '外围女',
    '同城约',
    '激情视频',
    '黄色网站',
    '裸照',
    '色图',
    '成人网站',
  ],
  毒品: [
    '冰毒',
    '摇头丸',
    '大麻',
    'k粉',
    '麻古',
    '制毒',
    '卖药',
    '上头电子烟',
    '违禁药品',
  ],
  违禁品: ['炸药配方', '枪支买卖', '仿真枪', '迷药', '听话水', '管制刀具'],
  代考作弊: ['代考', '枪手代考', '答案出售', '考试答案', '包过班'],
};

/**
 * 联系方式：命中即拦。
 *
 * 这些不是"脏话"，但广场是给人倾诉的地方，一旦允许留联系方式，
 * 很快就会变成拉群、卖课、发广告的布告栏。
 */
const PHONE_RULE = /(?<!\d)1[3-9]\d{9}(?!\d)/u;
const WECHAT_RULE = /(加|\+)?(微信|v信|vx|weixin|qq|扣扣|企鹅|telegram|电报|whatsapp)(号)?([:：]?\s*[a-z0-9_-]{3,})?/iu;
const QR_RULE = /(扫码|扫下方|二维码|扫我头像)/u;
const LINK_RULE = /(https?:\/\/|www\.)[a-z0-9-]+(\.[a-z0-9-]+)+/iu;
const EMAIL_RULE = /[a-z0-9._%+-]+@[a-z0-9-]+\.[a-z]{2,}/iu;

const CONTACT_RULES: { rule: Rule; label: string }[] = [
  { rule: PHONE_RULE, label: '手机号' },
  { rule: WECHAT_RULE, label: '微信号' },
  { rule: QR_RULE, label: '二维码' },
  { rule: LINK_RULE, label: '外部链接' },
  { rule: EMAIL_RULE, label: '邮箱' },
];

/**
 * 广告特征：像在卖东西 / 招人 / 拉客。
 * 单条不拦，攒够 2 处才拦 —— 「今天终于把这事儿出了」不该被当成广告。
 */
const AD_RULES: Rule[] = [
  '私聊我',
  '私信我',
  '低价出',
  '优惠价',
  '特价',
  '现货',
  '正品',
  '下单',
  '包邮',
  '秒发',
  '求带',
  '招代理',
  '招兼职',
  '日结',
  '免费领',
  '限时',
  '优惠券',
  '返现',
  '一手货源',
  '工厂直供',
  '详情私聊',
  '有意者',
  '本店',
  '本平台',
  '戳我头像',
  '点我主页',
  '主页有惊喜',
  '评论区扣1',
  '回复666',
];

/**
 * 引战特征：地域黑、性别对立、号召攻击。
 * 同样攒够 2 处才拦，避免「我好讨厌地域黑」这类话被误判。
 */
const REGION_RULE = /(河南|东北|上海|北京|广东|安徽|苏北|新疆|云南|四川|湖南|湖北)人?(都)?(是)?(骗子|小偷|穷鬼|垃圾|恶心|低素质)/u;
const GENDER_RULE = /(女的|男的)(都)?(是)?(傻子|骗子|舔狗|捞女|渣男)/u;

const FLAME_RULES: Rule[] = [
  '地域黑',
  '都是穷鬼',
  '都该滚',
  '外地人滚',
  '本地人滚',
  '女拳',
  '打拳',
  '普信男',
  '普信女',
  '男人没一个',
  '女人都一个',
  '仇女',
  '仇男',
  '一起骂',
  '开撕',
  '对线',
  '挂人',
  '人肉',
  '网络暴力',
  '拉黑所有人',
  REGION_RULE,
  GENDER_RULE,
];

const HEAVY_GROUPS = new Set([
  '辱骂',
  '威胁',
  '诈骗引流',
  '赌博',
  '色情',
  '毒品',
  '违禁品',
  '代考作弊',
]);

/** 广告 / 引战这类软规则，命中几处才拦。 */
const SOFT_THRESHOLD = 2;

const ALL_WORDS: string[] = Object.entries(WORD_GROUPS)
  .filter(([category]) => HEAVY_GROUPS.has(category))
  .flatMap(([, rules]) => rules.filter((rule): rule is string => typeof rule === 'string'));

/** 词表规模（自检脚本与测试用，避免词表被误删成空）。 */
export const SENSITIVE_WORD_COUNT = ALL_WORDS.length;

export type SensitiveReason =
  | '辱骂'
  | '威胁'
  | '诈骗引流'
  | '赌博'
  | '色情'
  | '毒品'
  | '违禁品'
  | '代考作弊'
  | '联系方式'
  | '广告'
  | '引战';

export interface SensitiveScan {
  hit: boolean;
  /** 命中的原始词 / 规则描述（去重、按规则顺序） */
  words: string[];
  /** 打码后的词，用于给用户提示，不在界面上复述脏话 */
  masked: string[];
  /** 命中的分组，便于将来做更细的文案 */
  categories: string[];
  /** 最能说明问题的那一类，界面据此换措辞 */
  reason: SensitiveReason | null;
}

const EMPTY: SensitiveScan = {
  hit: false,
  words: [],
  masked: [],
  categories: [],
  reason: null,
};

/**
 * 归一化：全角转半角、小写、去掉空白与标点符号。
 * 这样「傻 逼」「傻*逼」「傻。逼」「傻-逼」都能被认出来。
 *
 * 注意：只去掉**标点与符号**，保留数字和字母 ——
 * 手机号、微信号正是靠它们认出来的。
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

/** 正则规则也要有一句能给用户看的话。 */
function describeRule(rule: Rule): string {
  if (typeof rule === 'string') return rule;
  if (rule === PHONE_RULE) return '手机号';
  if (rule === WECHAT_RULE) return '微信号';
  if (rule === QR_RULE) return '二维码';
  if (rule === LINK_RULE) return '外部链接';
  if (rule === EMAIL_RULE) return '邮箱';
  if (rule === REGION_RULE) return '地域攻击';
  if (rule === GENDER_RULE) return '性别攻击';
  return '辱骂';
}

function matches(rule: Rule, text: string): boolean {
  if (typeof rule === 'string') return text.includes(normalizeForScan(rule));
  return rule.test(text);
}

/**
 * 扫一遍文本。返回命中的词与打码结果，调用方决定是提示还是拦截。
 */
export function scanSensitive(input: string): SensitiveScan {
  const text = normalizeForScan(input);
  if (!text) return EMPTY;

  const words: string[] = [];
  const categories: string[] = [];
  let reason: SensitiveReason | null = null;

  const record = (category: SensitiveReason, word: string) => {
    const label = word;
    if (!words.includes(label)) words.push(label);
    if (!categories.includes(category)) categories.push(category);
    if (!reason) reason = category;
  };

  // 1. 硬词表：一条即拦
  for (const [category, rules] of Object.entries(WORD_GROUPS)) {
    if (!HEAVY_GROUPS.has(category)) continue;
    for (const rule of rules) {
      if (matches(rule, text)) record(category as SensitiveReason, describeRule(rule));
    }
  }

  // 2. 联系方式：一条即拦
  for (const { rule, label } of CONTACT_RULES) {
    if (matches(rule, text)) record('联系方式', label);
  }

  // 3. 广告 / 引战：攒够 SOFT_THRESHOLD 处才拦
  const ads = AD_RULES.filter((rule) => matches(rule, text));
  if (ads.length >= SOFT_THRESHOLD) {
    for (const rule of ads) record('广告', describeRule(rule));
  }
  const flames = FLAME_RULES.filter((rule) => matches(rule, text));
  if (flames.length >= SOFT_THRESHOLD) {
    for (const rule of flames) record('引战', describeRule(rule));
  }

  if (words.length === 0) return EMPTY;

  /*
   * 联系方式优先 —— 一句话里既有「加微信」又有别的问题时，
   * 更该说的是「这里不留联系方式」，它解释得最清楚、也最容易改。
   */
  if (categories.includes('联系方式')) reason = '联系方式';

  return {
    hit: true,
    words,
    masked: words.map(maskWord),
    categories,
    reason,
  };
}

/** 给用户看的一句话：说明命中了什么类别，并把可疑词打码。 */
export function describeSensitive(scan: SensitiveScan): string {
  if (!scan.hit) return '';
  const shown = scan.masked.slice(0, 3).join('、');
  if (scan.reason === '联系方式') {
    return `广场上不留联系方式（${shown}），想说的话写在正文里就好。`;
  }
  if (scan.reason === '广告') {
    return '这段看起来像广告。广场是给人倾诉的地方，卖东西请换个地方。';
  }
  if (scan.reason === '引战') {
    return '这段有引战的意味，换个说法再发吧。';
  }
  return `这段话里有不适合出现在广场上的内容（${shown}），换个说法再发吧。`;
}
