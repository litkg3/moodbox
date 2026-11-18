/**
 * 自伤 / 自杀倾向的文本识别。
 *
 * 三条原则：
 * 1. **只做提示，不做拦截**。识别到相关内容时，绝不阻止用户表达，
 *    也不会把内容藏起来 —— 强行消音通常是更糟的选择；
 * 2. **不做判断，只做匹配**。命中关键词不等于这个人处于危险中，
 *    所以界面上说的是「我有点担心你」，而不是任何结论性的措辞；
 * 3. **给出真实的求助路径**。只提醒"要寻求帮助"而不给出具体电话，
 *    等于把责任推回给已经在困境里的人。
 */

export interface CrisisPattern {
  id: string;
  /** 给管理员看的中性描述，不写"自杀倾向"这类诊断式措辞 */
  label: string;
  pattern: RegExp;
}

export const CRISIS_PATTERNS: readonly CrisisPattern[] = [
  { id: 'want-die', label: '提到想死 / 不想活', pattern: /想死|不想活|活不下去|不想再活|死了算了|不如死/ },
  { id: 'suicide', label: '提到自杀 / 轻生', pattern: /自杀|轻生|结束(自己的)?(生命|命)|了结自己/ },
  { id: 'self-harm', label: '提到自伤', pattern: /自残|自伤|割腕|划手腕|伤害自己|烫自己|惩罚自己/ },
  { id: 'method', label: '提到具体方式', pattern: /跳楼|上吊|吞药|烧炭|割(动脉|手腕)|服药(自杀|过量)/ },
  { id: 'farewell', label: '像是告别的话', pattern: /最后一次(说|写)|永别|交代一下后事|别找我了|以后不会再有我/ },
  { id: 'worthless', label: '强烈的无价值感', pattern: /活着(没|没有)(有)?(意思|意义)|我是个(累赘|废物)|没有我(会)?更好|不值得活/ },
];

export interface CrisisScanResult {
  flagged: boolean;
  /** 命中的规则 id，用于管理员视图里给出中性提示 */
  matches: string[];
}

export function scanForCrisis(text: string): CrisisScanResult {
  const normalized = text.replace(/\s+/g, '');
  if (!normalized) return { flagged: false, matches: [] };
  const matches = CRISIS_PATTERNS.filter((item) => item.pattern.test(normalized)).map(
    (item) => item.id,
  );
  return { flagged: matches.length > 0, matches };
}

export interface CrisisResource {
  name: string;
  contact: string;
  note: string;
}

/**
 * 求助资源。
 *
 * 这些都是公开可查的公益热线；产品里只做展示，不承诺接通率，
 * 也不把它们包装成"一定能解决问题"。
 */
export const CRISIS_RESOURCES: readonly CrisisResource[] = [
  { name: '全国心理援助热线', contact: '12356', note: '24 小时，免费' },
  { name: '北京心理危机研究与干预中心', contact: '010-82951332', note: '24 小时' },
  { name: '希望 24 热线', contact: '400-161-9995', note: '24 小时' },
];

/** 通用的那一句提醒，多处复用保持措辞一致。 */
export const CRISIS_CARE_LINE =
  '如果你此刻觉得自己可能没办法保证安全，请立刻联系身边可信任的人，或拨打 120。';
