import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'glass' | 'ghost' | 'warm' | 'danger';
type Size = 'sm' | 'md' | 'lg';

/**
 * 底色统一由 globals.css 里的 `.mb-btn-*` 控制，
 * 这样夜间主题只要覆写那几个类即可，组件本身不需要知道当前是哪个主题。
 */
const VARIANTS: Record<Variant, string> = {
  primary: 'mb-btn-primary',
  glass: 'mb-glass-soft text-ink-soft hover:text-ink hover:bg-white/60',
  ghost: 'text-ink-soft hover:text-ink hover:bg-white/45',
  warm: 'mb-btn-warm',
  danger: 'mb-btn-danger',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-4 text-[13px] gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-13 px-7 text-[15px] gap-2.5',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

export function Button({
  variant = 'glass',
  size = 'md',
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex select-none items-center justify-center rounded-full font-normal tracking-[0.04em]',
        'transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
        'active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
