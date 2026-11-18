'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

type Tone = 'calm' | 'warm' | 'caution';

interface ToastItem {
  id: number;
  message: string;
  tone: Tone;
}

interface ToastContextValue {
  showToast: (message: string, tone?: Tone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast 必须在 ToastProvider 内使用');
  return context;
}

const TONES: Record<Tone, string> = {
  calm: 'text-ink-soft',
  warm: 'text-[#8a6a4a]',
  caution: 'text-[#8a4a45]',
};

/**
 * 极简提示条：底部居中的一片云。
 * 只用于确认类反馈（已保存 / 已删除 / 存储告警），不打断用户操作。
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const timersRef = useRef<number[]>([]);
  const reduceMotion = useReducedMotion();

  const showToast = useCallback((message: string, tone: Tone = 'calm') => {
    idRef.current += 1;
    const id = idRef.current;
    setToasts((prev) => [...prev.slice(-2), { id, message, tone }]);
    const timer = window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3600);
    timersRef.current.push(timer);
  }, []);

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current) window.clearTimeout(timer);
      timersRef.current = [];
    };
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed inset-x-0 bottom-6 z-[120] flex flex-col items-center gap-2 px-4 sm:bottom-8"
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 300, damping: 26 }}
              className={cn(
                'mb-glass max-w-[min(92vw,460px)] rounded-full px-5 py-2.5 text-center text-[13px] leading-relaxed tracking-[0.03em]',
                TONES[toast.tone],
              )}
            >
              {toast.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
