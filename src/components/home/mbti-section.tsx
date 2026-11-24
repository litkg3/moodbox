'use client';

import { useCallback, useRef, useState, type CSSProperties } from 'react';
import { Images } from 'lucide-react';
import { ScrollScreen } from '@/components/home/scroll-screen';
import { MbtiDetailSheet } from '@/components/home/mbti-detail-sheet';
import { MbtiLightbox } from '@/components/home/mbti-lightbox';
import {
  MBTI_GROUPS,
  MBTI_TYPES,
  mbtiToken,
  typesOfGroup,
  type MbtiGroup,
  type MbtiType,
} from '@/data/mbti';
import { cn } from '@/lib/utils';

/** 手机端左右划动的最小距离，以及"算横向"的斜率要求 */
const SWIPE_MIN = 44;

function MbtiCard({
  type,
  index,
  onOpen,
}: {
  type: MbtiType;
  index: number;
  onOpen: (type: MbtiType) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(type)}
      className={cn('mb-mbti-card', mbtiToken(type))}
      style={{ '--i': index } as CSSProperties}
      aria-label={`${type.code} ${type.name}，查看完整介绍`}
    >
      <img
        className="mb-mbti-avatar"
        src={type.image}
        width={480}
        height={480}
        loading="lazy"
        decoding="async"
        alt={`${type.code} ${type.name} 人物插画`}
      />
      <span className="mb-mbti-meta">
        <span className="mb-mbti-code">{type.code}</span>
        <span className="mb-mbti-name">{type.name}</span>
        <span className="mb-mbti-tagline">{type.tagline}</span>
      </span>
    </button>
  );
}

/**
 * MBTI 十六型。
 *
 * 两套版式，同一份 DOM 结构（卡片只换尺寸）：
 * - 桌面 ≥769px：4×4 十六张一屏铺满，点开是居中弹层；
 * - 手机 ≤768px：按四分组分页，一次只放当前组的 4 张（2×2），
 *   屏内不滚、不截断，点开是从底部升起的详情面板。
 *
 * 为什么手机要分组：十六张压进 375×667 只够放下"代号 + 半句描述"，
 * 头像还会压到字上。分组之后每张卡都能把头像、代号、中文名、一句话
 * 完整地摆出来，一屏四张、一眼看完。
 */
export function MbtiSection() {
  const [detail, setDetail] = useState<MbtiType | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const [group, setGroup] = useState<MbtiGroup>('紫粉');
  const [dir, setDir] = useState<1 | -1>(1);

  const groupIndex = MBTI_GROUPS.findIndex((item) => item.key === group);
  const groupTypes = typesOfGroup(group);

  const openDetail = useCallback((type: MbtiType) => {
    setDetail(type);
    // 从「下一型」翻到别的组时，关掉面板应该停在那一组上
    setGroup((current) => (current === type.group ? current : type.group));
  }, []);

  const selectGroup = useCallback(
    (index: number) => {
      const next = Math.min(Math.max(index, 0), MBTI_GROUPS.length - 1);
      if (next === groupIndex) return;
      setDir(next > groupIndex ? 1 : -1);
      setGroup(MBTI_GROUPS[next]!.key);
    },
    [groupIndex],
  );

  /* ---------------- 左右划动换组 ---------------- */

  const swipe = useRef<{ x: number; y: number } | null>(null);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    swipe.current = { x: event.clientX, y: event.clientY };
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = swipe.current;
    swipe.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    // 以横向为主才算划动，否则是纵向翻屏
    if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * 1.3) return;
    selectGroup(groupIndex + (dx < 0 ? 1 : -1));
  };

  /* ---------------- 详情：上一型 / 下一型 ---------------- */

  const detailIndex = detail ? MBTI_TYPES.findIndex((type) => type.code === detail.code) : -1;
  const prevType = detailIndex > 0 ? MBTI_TYPES[detailIndex - 1] : null;
  const nextType =
    detailIndex >= 0 && detailIndex < MBTI_TYPES.length - 1 ? MBTI_TYPES[detailIndex + 1] : null;

  const closeDetail = useCallback(() => setDetail(null), []);
  const closeLightbox = useCallback(() => setLightboxOpen(false), []);

  return (
    <ScrollScreen id="mbti" label="人格详解" className="mb-mbti">
      <div className="mb-mbti-shell">
        <header className="mb-mbti-head">
          <div className="mb-mbti-heading">
            <h2 id="mbti-title" className="mb-mbti-title">
              MBTI 十六种人格类型 详解
            </h2>
            <p className="mb-mbti-sub">从人格类型中认识自我，调节自我情绪</p>
          </div>
          <button
            type="button"
            className="mb-mbti-full"
            onClick={() => setLightboxOpen(true)}
            aria-label="查看完整图"
          >
            <Images size={15} strokeWidth={1.5} aria-hidden="true" />
            <span className="mb-mbti-full-label">查看完整图</span>
          </button>
        </header>

        {/* 手机端的分组切换：桌面端整屏都看得见，不需要它 */}
        <div className="mb-mbti-segments" role="tablist" aria-label="人格分组">
          {MBTI_GROUPS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={item.key === group}
              onClick={() => selectGroup(MBTI_GROUPS.findIndex((entry) => entry.key === item.key))}
              className={cn(
                'mb-mbti-seg',
                mbtiToken({ group: item.key }),
                item.key === group && 'is-active',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mb-mbti-body" onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
          {/* 桌面：十六张一屏 */}
          <div className="mb-mbti-grid mb-mbti-grid-desktop">
            {MBTI_TYPES.map((type, index) => (
              <MbtiCard key={type.code} type={type} index={index} onOpen={openDetail} />
            ))}
          </div>

          {/* 手机：当前组四张，2×2。key 换了就重挂，动画从头播一遍 */}
          <div
            key={group}
            className="mb-mbti-grid mb-mbti-grid-mobile"
            data-dir={dir > 0 ? 'next' : 'prev'}
          >
            {groupTypes.map((type, index) => (
              <MbtiCard key={type.code} type={type} index={index} onOpen={openDetail} />
            ))}
          </div>
        </div>

        <p className="mb-mbti-note">
          <span className="mb-mbti-note-copy">MBTI 仅供自我探索参考，不具备心理评估或诊断功能。</span>
          <span className="mb-mbti-note-hint">点开卡片，查看完整介绍</span>
        </p>
      </div>

      <MbtiDetailSheet
        type={detail}
        onClose={closeDetail}
        onPrev={() => prevType && openDetail(prevType)}
        onNext={() => nextType && openDetail(nextType)}
        hasPrev={Boolean(prevType)}
        hasNext={Boolean(nextType)}
      />

      <MbtiLightbox open={lightboxOpen} onClose={closeLightbox} />
    </ScrollScreen>
  );
}
