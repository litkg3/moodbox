import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CalendarGrid, type DayMarkers } from '@/components/calendar/calendar-grid';
import { MiniCalendar } from '@/components/memories/mini-calendar';
import { BackendNote } from '@/components/square/square-view';

describe('日历网格', () => {
  const month = new Date(2026, 10, 1); // 2026 年 11 月
  const markers = new Map<string, DayMarkers>([
    ['2026-11-12', { emotions: ['joy', 'anxiety'], memoryCount: 2 }],
  ]);

  it('渲染完整的 6 行日期格，并标注选中日期', () => {
    render(
      <CalendarGrid month={month} selectedKey="2026-11-12" markers={markers} onSelect={() => {}} />,
    );
    const cells = screen.getAllByRole('button');
    expect(cells.length % 7).toBe(0);
    expect(cells.length).toBeGreaterThanOrEqual(35);

    const selected = screen.getByRole('button', { name: /11月12日/ });
    expect(selected).toHaveAttribute('aria-pressed', 'true');
  });

  it('把情绪与快乐记忆写进无障碍标签', () => {
    render(<CalendarGrid month={month} selectedKey={null} markers={markers} onSelect={() => {}} />);
    const cell = screen.getByRole('button', { name: /开心/ });
    expect(cell.getAttribute('aria-label')).toContain('2 份快乐记忆');
  });

  it('点击日期时回传 yyyy-MM-dd', () => {
    const onSelect = vi.fn();
    render(<CalendarGrid month={month} selectedKey={null} markers={markers} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /11月14日/ }));
    expect(onSelect).toHaveBeenCalledWith('2026-11-14');
  });
});

describe('表单里的小日历', () => {
  it('渲染当月日期，并高亮当前选中的一天', () => {
    render(<MiniCalendar value="2026-11-12" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: '2026 年 11 月 12 日' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('2026 年 11 月')).toBeInTheDocument();
  });

  it('点击日期时回传 yyyy-MM-dd', () => {
    const onChange = vi.fn();
    render(<MiniCalendar value="2026-11-12" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: '2026 年 11 月 20 日' }));
    expect(onChange).toHaveBeenCalledWith('2026-11-20');
  });

  it('超过上限的日期不可选', () => {
    render(<MiniCalendar value="2026-11-12" onChange={() => {}} maxKey="2026-11-12" />);
    expect(screen.getByRole('button', { name: '2026 年 11 月 20 日' })).toBeDisabled();
  });
});

describe('广场「数据去向」那一行', () => {
  /*
   * 这两句话说的不是一件事，图标也不能混：
   * - 云端：「所有人都能看见」→ 地球，字号放大一档；
   * - 本机：「只存在这台设备上」→ 数据库。
   * e2e 固定跑在本机模式，拿不到上面那条，所以放这里逐条验。
   */
  it('公开时用地球图标，并把这句话原样写出来', () => {
    const { container } = render(<BackendNote label="广场上的帖子所有人都能看见" />);
    const note = container.querySelector('.mb-square-note');
    expect(note).not.toBeNull();
    expect(note!.textContent).toContain('所有人都能看见');
    // lucide 的 Globe 里有一个圆形经纬球
    expect(note!.querySelector('svg circle')).not.toBeNull();
  });

  it('本机模式换成数据库图标，措辞也跟着换', () => {
    const { container } = render(<BackendNote label="这些帖子只存在这台设备上" />);
    const note = container.querySelector('.mb-square-note');
    expect(note!.textContent).toContain('只存在这台设备上');
    expect(note!.textContent).not.toContain('所有人都能看见');
    // 不再是地球：没有圆形，换成 Database 的椭圆顶
    expect(note!.querySelector('svg circle')).toBeNull();
    expect(note!.querySelector('svg ellipse')).not.toBeNull();
  });

  it('字号是 13px，不是原来那档 12px 小字', () => {
    const { container } = render(<BackendNote label="广场上的帖子所有人都能看见" />);
    const note = container.querySelector('.mb-square-note')!;
    expect(note.className).toContain('text-[13px]');
    // 颜色用 ink-soft，而不是最浅的 ink-ghost
    expect(note.className).toContain('text-ink-soft');
  });
});
