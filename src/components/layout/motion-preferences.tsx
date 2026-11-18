'use client';

import type { ReactNode } from 'react';
import { MotionConfig } from 'motion/react';

/**
 * 让 Motion 的动画也尊重系统的“减少动效”偏好。
 *
 * CSS 里的 `prefers-reduced-motion` 只能盖住 CSS 动画与过渡，
 * Motion 是通过 requestAnimationFrame 直接写内联样式的，盖不住。
 * `reducedMotion="user"` 会让位移、缩放类动画直接跳到终态，只保留透明度过渡。
 *
 * 这里只是包一层 Provider，children 仍然是服务端组件。
 */
export function MotionPreferences({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
