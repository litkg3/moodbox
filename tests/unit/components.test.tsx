import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CalendarGrid, type DayMarkers } from '@/components/calendar/calendar-grid';
import { MiniCalendar } from '@/components/memories/mini-calendar';

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
