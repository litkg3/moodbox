'use client';

import { LettersView } from '@/components/letters/letters-view';
import { GlassSheet } from '@/components/ui/glass-sheet';

interface LettersOverlayProps {
  open: boolean;
  onClose: () => void;
}

/** 心事信箱：内容仍由 LettersView 承担，这里只负责把它放进统一卡片。 */
export function LettersOverlay({ open, onClose }: LettersOverlayProps) {
  return (
    <GlassSheet
      open={open}
      onClose={onClose}
      tone="glass"
      width="lg"
      title="心事信箱"
      glowColor="rgba(196, 176, 226, 0.5)"
    >
      <LettersView embedded />
    </GlassSheet>
  );
}
