'use client';

import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { useTheme } from '@/components/layout/theme-provider';

/**
 * 流星雨。
 *
 * 出现条件（三条同时满足）：
 *
 * 1. **深夜** —— 本地时间 22:00 之后、次日 05:00 之前；
 * 2. **星空模式** —— `html[data-theme="night"]`（用户手动切到星空，或「跟随系统」且系统是深色）；
 * 3. **运气** —— 每次页面打开只有 35% 的机会，撞不上就什么都没有。
 *
 * 为什么是这三条：流星属于「深夜抬头刚好看见」的东西，白天、傍晚、
 * 或者在白日模式里划过一条白线，只会像屏幕坏了。概率压得偏低，
 * 也是为了让它保持「偶尔遇见」的分量 —— 每次进首页都有，就成了装饰。
 *
 * 实现上完全不用 JS 逐帧驱动：一条流星就是一个 div，
 * 位移交给 CSS 关键帧（一条 220vmax 的斜线），时间与位置写进 CSS 变量。
 * 随机只发生在挂载那一次，不会因为重渲染而改变位置（否则会「跳」）。
 */

/** 这个点还在夜里吗（22:00–05:00） */
export function isLateNight(date: Date = new Date()): boolean {
  const hour = date.getHours();
  return hour >= 22 || hour < 5;
}

/** 每次进入首页触发一场流星雨的概率 —— 偏低，偶尔遇见才好看 */
export const METEOR_CHANCE = 0.35;

interface Meteor {
  id: number;
  /** 起点：横向百分比 */
  left: number;
  /** 起点：纵向百分比 */
  top: number;
  /** 划过全程的时间（秒） */
  duration: number;
  /** 出发前的等待（秒） */
  delay: number;
  /** 尾巴长度（px） */
  length: number;
}

/** 一场里几颗、各自从哪儿出发 */
function buildMeteors(count: number): Meteor[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    // 从左上游划向右下：起点铺在画面左上 2/3，划过天空主体（文字区除外）
    left: 2 + Math.random() * 62,
    top: 4 + Math.random() * 46,
    duration: 1.6 + Math.random() * 1.5,
    delay: index * (0.6 + Math.random() * 0.9),
    length: 130 + Math.random() * 110,
  }));
}

export function MeteorShower() {
  const { theme } = useTheme();
  const reduceMotion = useReducedMotion();
  const [meteors, setMeteors] = useState<Meteor[]>([]);
  /** 只在挂载时掷一次骰子：重渲染不该重新决定「今晚有没有流星」 */
  const decided = useRef(false);
  /*
   * `useReducedMotion()` 在首帧返回 null（还不知道偏好），要到第二帧才定下来。
   * 而「掷骰子」只跑一次：必须等它真的定下来再掷，否则 null 会被当成
   * 「偏好已关闭动效」，流星就永远不出现。下面 `=== null` 那一行就是这道等待。
   */

  useEffect(() => {
    // 偏好还没读出来：等下一轮
    if (reduceMotion === null) return;
    if (decided.current) return;
    decided.current = true;

    // 减弱动效的偏好优先：不划
    if (reduceMotion) return;
    if (!isLateNight()) return;
    if (Math.random() > METEOR_CHANCE) return;

    const count = 3 + Math.floor(Math.random() * 3); // 3–5 颗
    setMeteors(buildMeteors(count));
  }, [reduceMotion]);

  // 主题由 html[data-theme] 驱动，这里靠 hook 拿到当前值；
  // 不在星空模式时整层不渲染，避免白日模式下出现白线。
  if (theme !== 'night' || meteors.length === 0) return null;

  return (
    <div className="mb-meteor-field" aria-hidden="true">
      {meteors.map((meteor) => (
        <span
          key={meteor.id}
          className="mb-meteor"
          style={
            {
              '--m-left': `${meteor.left}%`,
              '--m-top': `${meteor.top}%`,
              '--m-duration': `${meteor.duration}s`,
              '--m-delay': `${meteor.delay}s`,
              '--m-length': `${meteor.length}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
