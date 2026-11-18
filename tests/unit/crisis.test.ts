import { describe, expect, it } from 'vitest';
import { CRISIS_CARE_LINE, CRISIS_PATTERNS, CRISIS_RESOURCES, scanForCrisis } from '@/lib/crisis';

/**
 * 自伤倾向识别。
 *
 * 这块代码的价值不在"抓得准"，而在"抓到了以后不做什么"：
 * 它只返回一个标记，绝不修改、删除、隐藏用户的文字。
 */

describe('自伤 / 自杀倾向识别', () => {
  it('普通的难过不会被误标', () => {
    const sad = [
      '今天有点累，什么都不想做。',
      '又被领导说了，心情很差。',
      '我好想消失一天，就一天。',
      '感觉自己最近状态不太对。',
    ];
    for (const text of sad) {
      expect(scanForCrisis(text).flagged, text).toBe(false);
    }
  });

  it('明确的想死表达会被标出来', () => {
    const result = scanForCrisis('真的不想活了，想死。');
    expect(result.flagged).toBe(true);
    expect(result.matches).toContain('want-die');
  });

  it('提到具体方式时能识别到对应规则', () => {
    expect(scanForCrisis('查了一下上吊').matches).toContain('method');
    expect(scanForCrisis('想吞药').matches).toContain('method');
  });

  it('插入了空格或换行的文字同样能识别', () => {
    expect(scanForCrisis('我 想\n死 了').flagged).toBe(true);
  });

  it('空字符串与纯空白返回未命中', () => {
    expect(scanForCrisis('')).toEqual({ flagged: false, matches: [] });
    expect(scanForCrisis('   \n\t  ')).toEqual({ flagged: false, matches: [] });
  });

  it('一句话命中多条规则时全部返回，且不重复', () => {
    const result = scanForCrisis('我想死，也想过自杀，我是个废物。');
    expect(result.matches.length).toBeGreaterThanOrEqual(3);
    expect(new Set(result.matches).size).toBe(result.matches.length);
  });

  it('每条规则都有可读的中性标签，不写诊断式措辞', () => {
    for (const pattern of CRISIS_PATTERNS) {
      expect(pattern.label.length).toBeGreaterThan(2);
      expect(pattern.label).not.toMatch(/自杀倾向|抑郁症|精神病/);
    }
  });

  it('求助资源是可拨打的具体号码，而不是一句空话', () => {
    expect(CRISIS_RESOURCES.length).toBeGreaterThanOrEqual(3);
    for (const resource of CRISIS_RESOURCES) {
      expect(resource.contact).toMatch(/[\d-]{5,}/);
      expect(resource.name.length).toBeGreaterThan(2);
    }
    expect(CRISIS_CARE_LINE).toContain('120');
  });
});
