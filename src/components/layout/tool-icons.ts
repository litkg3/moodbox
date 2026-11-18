import {
  Compass,
  Footprints,
  Info,
  Mail,
  MessagesSquare,
  Sparkles,
  Trash2,
  Wind,
  type LucideIcon,
} from 'lucide-react';
import type { ToolKey } from '@/lib/tools';

/** 工具入口的图标映射。集中在这里，避免每个导航组件各写一份。 */
export const TOOL_ICONS: Record<ToolKey, LucideIcon> = {
  jar: Sparkles,
  letters: Mail,
  calendar: Footprints,
  breathe: Wind,
  quiz: Compass,
  square: MessagesSquare,
  about: Info,
  clear: Trash2,
};
