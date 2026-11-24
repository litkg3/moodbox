import { describe, expect, it } from 'vitest';
import { auditAssistantText, carePayload, RISK_RULE_COUNT, scanChatRisk } from '@/lib/chat/safety';
import { parseSseBuffer } from '@/lib/chat/sse';
import {
  clearAllSessions,
  isSaveEnabled,
  loadSessions,
  newSessionId,
  persistSession,
  setSaveEnabled,
  titleOf,
} from '@/lib/chat/store';
import type { ChatMessage, ChatSession } from '@/lib/chat/types';

/**
 * AI 陪聊的安全层与链路上的两个"容易悄悄坏掉"的地方：
 * SSE 半包解析、本地存储的开关语义。
 *
 * 这三块都不用开浏览器就能验证，所以全部放在单测里 ——
 * 浏览器只留给真正的交互（键盘、滚动、主题切换）。
 */

/* ---------------- 风险识别 ---------------- */

describe('陪聊的风险识别', () => {
  it('普通的难过与抱怨不会被标成风险', () => {
    const everyday = [
      '今天加班到十点，累得说不出话。',
      '跟室友吵架了，觉得自己很没用。',
      '最近总是睡不着，脑子里乱乱的。',
      '我想一个人待着，不太想说话。',
    ];
    for (const text of everyday) {
      expect(scanChatRisk(text).level, text).toBe('none');
    }
  });

  it('明确的自伤 / 自杀表达会命中 care', () => {
    for (const text of ['真的不想活了，想死', '查了一下怎么上吊', '我想自杀']) {
      expect(scanChatRisk(text).level, text).toBe('care');
    }
  });

  it('他伤同样按 care 处理 —— 这时候不该回一段情绪梳理', () => {
    expect(scanChatRisk('我想杀了他').level).toBe('care');
    expect(scanChatRisk('真想跟他同归于尽').level).toBe('care');
    expect(scanChatRisk('我控制不住想打人').level).toBe('care');
  });

  it('模糊信号只标 watch，不弹卡片', () => {
    for (const text of ['真的撑不下去了', '好想消失', '好像没有人需要我']) {
      expect(scanChatRisk(text).level, text).toBe('watch');
    }
  });

  it('空白输入不产生任何标记', () => {
    expect(scanChatRisk('')).toEqual({ level: 'none', matches: [] });
    expect(scanChatRisk('   \n\t ')).toEqual({ level: 'none', matches: [] });
  });

  it('命中时给出的规则 id 不重复', () => {
    const result = scanChatRisk('我想死，也想杀了他');
    expect(result.level).toBe('care');
    expect(new Set(result.matches).size).toBe(result.matches.length);
  });

  it('规则表不是空的（防止有人手滑删空）', () => {
    expect(RISK_RULE_COUNT).toBeGreaterThan(10);
  });
});

/* ---------------- 关怀卡片 ---------------- */

describe('关怀卡片', () => {
  it('文案是固定的，不随命中的关键词变化', () => {
    const a = carePayload([]);
    const b = carePayload([]);
    expect(a).toEqual(b);
    // 不说"你有抑郁"，只说"我很在意你刚才说的"
    expect(a.title).toBe('我很在意你刚才说的');
    expect(a.urgent).toBe(true);
  });

  it('卡片里不会凭空出现热线号码 —— 电话只能来自配置', () => {
    const payload = carePayload([]);
    expect(payload.resources).toEqual([]);
    // 正文里唯一允许出现的数字是急救电话 120
    expect(payload.body.replace(/120/g, '')).not.toMatch(/\d/);
  });

  it('配置了资源就原样带上', () => {
    const payload = carePayload([{ name: '示例热线', contact: '000-0000' }]);
    expect(payload.resources).toHaveLength(1);
    expect(payload.resources[0]!.contact).toBe('000-0000');
  });
});

/* ---------------- 输出审核 ---------------- */

describe('模型输出审核', () => {
  it('正常的共情回复放行', () => {
    const normal = [
      '听起来这一天把你耗得够呛。要不要先喝口水，慢慢说？',
      '被那样说确实会难受，这不是你太敏感。',
    ];
    for (const text of normal) {
      expect(auditAssistantText(text).ok, text).toBe(true);
    }
  });

  it('具体药物与剂量被拦下', () => {
    expect(auditAssistantText('你可以先吃 20mg 的那个药试试').reason).toBe('medical');
    expect(auditAssistantText('建议停药').reason).toBe('medical');
  });

  it('诊断式结论被拦下', () => {
    for (const text of [
      '你这是抑郁症',
      '你得的 是抑郁',
      '你患有广泛性焦虑障碍',
      '确诊为双相',
      '你是躁郁症吧',
    ]) {
      expect(auditAssistantText(text).reason, text).toBe('diagnosis');
    }
  });

  it('"我保证保密 / 只有我懂你"这类把人往 AI 身上拽的话被拦下', () => {
    expect(auditAssistantText('我保证不告诉任何人').reason).toBe('overreach');
    expect(auditAssistantText('只有我理解你').reason).toBe('overreach');
  });

  it('任何联系方式都不出现在回复里', () => {
    const audit = auditAssistantText('你可以加我微信 13800138000');
    expect(audit.ok).toBe(false);
    expect(['contact', 'medical']).toContain(audit.reason);
  });

  it('回复里不该复述风险细节', () => {
    const audit = auditAssistantText('你说的想死，是不是觉得自己撑不住了');
    expect(audit.ok).toBe(false);
    expect(audit.reason).toBe('risk-echo');
  });

  it('拦下时一定给一句可以顶上来的安全结尾', () => {
    const audit = auditAssistantText('你这是双相情感障碍');
    expect(audit.ok).toBe(false);
    expect(audit.replacement).toBeTruthy();
    expect(audit.replacement!.length).toBeGreaterThan(8);
  });
});

/* ---------------- SSE 解析 ---------------- */

describe('SSE 解析', () => {
  const frame = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;

  it('一次拿到完整的三帧', () => {
    const buffer =
      frame({ type: 'delta', text: '你' }) +
      frame({ type: 'delta', text: '好' }) +
      frame({ type: 'done' });
    const { events, rest } = parseSseBuffer(buffer);
    expect(events).toEqual([
      { type: 'delta', text: '你' },
      { type: 'delta', text: '好' },
      { type: 'done' },
    ]);
    expect(rest).toBe('');
  });

  it('被切断的半帧留到下一次，不丢字也不报错', () => {
    const buffer = frame({ type: 'delta', text: '前半句' }) + 'data: {"type":"delta","text":"后';
    const first = parseSseBuffer(buffer);
    expect(first.events).toHaveLength(1);
    expect(first.rest.startsWith('data:')).toBe(true);

    // 下一次 read 把剩下的补齐
    const second = parseSseBuffer(first.rest + '半句"}\n\n');
    expect(second.events).toEqual([{ type: 'delta', text: '后半句' }]);
    expect(second.rest).toBe('');
  });

  it('坏帧被跳过，好帧照常出来', () => {
    const buffer =
      'data: {不是 json}\n\n' + frame({ type: 'delta', text: '在' }) + 'data: \n\n' + 'ping\n\n';
    const { events } = parseSseBuffer(buffer);
    expect(events).toEqual([{ type: 'delta', text: '在' }]);
  });

  it('没有 type 字段的对象被当作坏帧', () => {
    const { events } = parseSseBuffer(frame({ text: '误入' }));
    expect(events).toHaveLength(0);
  });

  it('空缓冲区返回空结果', () => {
    expect(parseSseBuffer('')).toEqual({ events: [], rest: '' });
  });

  it('关怀帧能原样解析出来', () => {
    const care = {
      type: 'care',
      payload: { title: '我很在意你刚才说的', body: '…', urgent: true, resources: [] },
    };
    const { events } = parseSseBuffer(frame(care));
    expect(events[0]).toEqual(care);
  });
});

/* ---------------- 本地对话存储 ---------------- */

const message = (content: string): ChatMessage => ({
  id: 'm-1',
  role: 'user',
  content,
  createdAt: 1_700_000_000_000,
});

const session = (id: string, content: string, updatedAt: number): ChatSession => ({
  id,
  title: content,
  createdAt: updatedAt,
  updatedAt,
  messages: [message(content)],
});

describe('本地对话存储的开关语义', () => {
  it('默认是关的 —— 打开就聊，什么都不写进浏览器', () => {
    expect(isSaveEnabled()).toBe(false);
    persistSession(session('s1', '今天很累', 1));
    expect(window.localStorage.getItem('moodbox-chat-sessions-v1')).toBeNull();
    expect(loadSessions()).toEqual([]);
  });

  it('打开开关后才开始保存', () => {
    setSaveEnabled(true);
    expect(isSaveEnabled()).toBe(true);
    const saved = persistSession(session('s1', '今天很累', 1));
    expect(saved).toHaveLength(1);
    expect(loadSessions()[0]!.id).toBe('s1');
  });

  it('关掉开关会顺手把之前存的也删掉', () => {
    setSaveEnabled(true);
    persistSession(session('s1', '今天很累', 1));
    setSaveEnabled(false);
    expect(isSaveEnabled()).toBe(false);
    expect(loadSessions()).toEqual([]);
  });

  it('同一会话再次保存是覆盖，不是追加', () => {
    setSaveEnabled(true);
    persistSession(session('s1', '第一句', 1));
    persistSession(session('s1', '第一句', 5));
    expect(loadSessions()).toHaveLength(1);
  });

  it('新会话排在前面，最多留 12 个', () => {
    setSaveEnabled(true);
    for (let i = 0; i < 15; i += 1) {
      persistSession(session(`s${i}`, `第 ${i} 句`, i));
    }
    const list = loadSessions();
    expect(list).toHaveLength(12);
    expect(list[0]!.id).toBe('s14');
  });

  it('一键删除能清空所有记录', () => {
    setSaveEnabled(true);
    persistSession(session('s1', '今天很累', 1));
    clearAllSessions();
    expect(loadSessions()).toEqual([]);
    // 开关本身还在：删的是记录，不是用户的偏好
    expect(isSaveEnabled()).toBe(true);
  });

  it('存进去的坏数据不会让页面崩', () => {
    window.localStorage.setItem('moodbox-chat-sessions-v1', '{坏 json');
    expect(loadSessions()).toEqual([]);
    window.localStorage.setItem('moodbox-chat-sessions-v1', JSON.stringify([{ id: 1 }]));
    expect(loadSessions()).toEqual([]);
  });
});

describe('会话标题', () => {
  it('取第一句用户消息，太长就截断', () => {
    expect(titleOf([message('今天被领导说了')])).toBe('今天被领导说了');
    const long = titleOf([message('今天被领导说了之后我一个人在楼下坐了很久很久')]);
    expect(long.endsWith('…')).toBe(true);
    expect(long.length).toBe(19);
  });

  it('还没有用户消息时给一个中性标题', () => {
    expect(titleOf([])).toBe('新的对话');
  });

  it('会话 id 每次都不一样', () => {
    const ids = new Set(Array.from({ length: 20 }, () => newSessionId()));
    expect(ids.size).toBe(20);
  });
});
