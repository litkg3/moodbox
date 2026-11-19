import {
  Compass,
  Footprints,
  Info,
  Mail,
  MessageCircleHeart,
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
  // 与主页「树洞广场」按钮保持同一颗图标，导航和入口对得上
  square: MessageCircleHeart,
  about: Info,
  clear: Trash2,
};
