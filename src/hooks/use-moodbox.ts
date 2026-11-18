'use client';

import { useEffect } from 'react';
import { moodBoxStore, useMoodBoxData, type MoodBoxSnapshot } from '@/lib/moodbox-store';

/**
 * 页面级数据钩子：首次挂载时打开数据库，并订阅快照。
 * `ready` 之前组件应展示骨架 / 加载态，避免把“空的本地数据”
 * 误当成“用户确实没有记录”。
 */
export function useMoodBox(): MoodBoxSnapshot {
  const snapshot = useMoodBoxData();

  useEffect(() => {
    void moodBoxStore.init();
  }, []);

  return snapshot;
}
