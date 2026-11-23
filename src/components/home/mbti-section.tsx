'use client';

import { useCallback, useState, type CSSProperties } from 'react';
import { ArrowLeft, Images } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { MBTI_TYPES, type MbtiType } from '@/data/mbti';
import { cn } from '@/lib/utils';
import { MbtiLightbox } from '@/components/home/mbti-lightbox';
import { ScrollScreen } from '@/components/home/scroll-screen';

/** 四组 → CSS 变量后缀。颜色本身写在 globals.css 的 --mbti-* 里，跟着主题走。 */
const GROUP_TOKEN: Record<string, string> = {
  紫粉: 'analyst',
  蓝青: 'sentinel',
  绿: 'diplomat',
  橙黄: 'explorer',
};

const tokenOf = (type: MbtiType) => `mb-mbti-${GROUP_TOKEN[type.group] ?? 'analyst'}`;

/**
 * MBTI 十六型：一屏 4×4。
 *
 * 桌面端要把十六张压进一屏，所以卡片是"小报式"的：代号与中文名并排，
 * 插画缩成一枚头像贴在右上角，描述按屏幕高度裁 2~4 行（完整文案在弹层里）。
 * 手机上改成两列、屏内纵向滚动 —— 一屏塞八行，字会小到看不清。
 */
export function MbtiSection() {
  const [detail, setDetail] = useState<MbtiType | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);

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
            <p className="mb-mbti-sub">认识自我 · 理解他人 · 成就更好的关系</p>
          </div>
          <button type="button" className="mb-mbti-full" onClick={() => setLightboxOpen(true)}>
            <Images size={15} strokeWidth={1.5} aria-hidden="true" />
            查看完整图
          </button>
        </header>

        <div className="mb-mbti-scroll" data-screen-scroll>
          <div className="mb-mbti-grid">
            {MBTI_TYPES.map((type, index) => (
              <button
                key={type.code}
                type="button"
                onClick={() => setDetail(type)}
                className={cn('mb-mbti-card', tokenOf(type))}
                style={{ '--i': index } as CSSProperties}
                aria-label={`${type.code} ${type.name}，查看完整介绍`}
              >
                <span className="mb-mbti-head-row">
                  <span className="mb-mbti-code">{type.code}</span>
                  <span className="mb-mbti-name">{type.name}</span>
                </span>
                <span className="mb-mbti-desc">{type.desc}</span>
                <img
                  className="mb-mbti-art"
                  src={type.image}
                  width={480}
                  height={480}
                  loading="lazy"
                  decoding="async"
                  alt={`${type.code} ${type.name} 人物插画`}
                />
              </button>
            ))}
          </div>
        </div>

        <p className="mb-mbti-note">
          MBTI 仅供自我探索参考，不具备心理评估或诊断功能。
          <span className="mb-mbti-hint">上下滑动查看全部 16 型</span>
        </p>
      </div>

      <Dialog
        open={detail !== null}
        onClose={closeDetail}
        title={detail ? `${detail.code} ${detail.name}` : '人格详解'}
        width="sm"
        footer={
          <button type="button" onClick={closeDetail} className="mb-mbti-back">
            <ArrowLeft size={15} strokeWidth={1.5} aria-hidden="true" />
            返回
          </button>
        }
      >
        {detail ? (
          <div className={cn('mb-mbti-detail', tokenOf(detail))}>
            <div className="mb-mbti-detail-hero">
              <img
                src={detail.image}
                width={480}
                height={480}
                alt={`${detail.code} ${detail.name} 人物插画`}
                className="mb-mbti-detail-art"
              />
              <p>{detail.desc}</p>
            </div>
            <p className="mb-mbti-detail-note">
              十六种类型没有优劣，只是一种偏好：你更习惯用哪只手拿杯子。
            </p>
          </div>
        ) : null}
      </Dialog>

      <MbtiLightbox open={lightboxOpen} onClose={closeLightbox} />
    </ScrollScreen>
  );
}
