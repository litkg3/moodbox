import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="relative z-10 flex min-h-[100dvh] flex-col items-center justify-center px-6 text-center">
      <span
        aria-hidden="true"
        className="h-24 w-24 rounded-full bg-[radial-gradient(120%_120%_at_30%_22%,#ffffff_0%,#e9dff8_42%,#c2aede_100%)] opacity-80 shadow-[0_30px_60px_-40px_rgba(142,118,184,0.9)]"
      />
      <p className="mt-8 text-[11px] uppercase tracking-[0.42em] text-ink-ghost">Lost in the sky</p>
      <h1 className="mt-4 font-display text-[22px] font-light tracking-[0.08em] text-ink">
        这颗球好像飘走了
      </h1>
      <p className="mt-3 max-w-[30ch] text-[12.5px] leading-[1.95] text-ink-faint">
        你想找的页面不在这里。没关系，回情绪空间看看别的。
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex h-11 items-center gap-2 rounded-full bg-[linear-gradient(135deg,#efe6fa,#f9e8e6)] px-6 text-[12.5px] tracking-[0.05em] text-ink shadow-[0_14px_30px_-22px_rgba(130,105,170,0.9)] transition-transform duration-500 hover:scale-[1.02]"
      >
        <ArrowLeft size={14} strokeWidth={1.6} />
        回到情绪空间
      </Link>
    </main>
  );
}
