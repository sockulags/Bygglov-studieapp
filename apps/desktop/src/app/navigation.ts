import {
  BookMarked,
  BookOpen,
  ChartLine,
  FolderOpen,
  Home,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export type NavPath = '/' | '/study' | '/cases' | '/lookup' | '/results' | '/settings';

export interface NavItem {
  to: NavPath;
  label: string;
  icon: LucideIcon;
  /**
   * Keys pressed one after the other to go to the view, e.g. ["g", "h"] for Hem. Shown as
   * <kbd> in the navigation tooltip and in the shortcuts dialog (docs/tangentbord.md).
   */
  shortcut: readonly [string, string];
}

/** Primary navigation (docs/04 → Navigation). */
export const primaryNav: NavItem[] = [
  { to: '/', label: 'Hem', icon: Home, shortcut: ['g', 'h'] },
  { to: '/study', label: 'Plugga', icon: BookOpen, shortcut: ['g', 'p'] },
  { to: '/cases', label: 'Ärenden', icon: FolderOpen, shortcut: ['g', 'ä'] },
  { to: '/lookup', label: 'Uppslag', icon: BookMarked, shortcut: ['g', 'u'] },
  { to: '/results', label: 'Mina resultat', icon: ChartLine, shortcut: ['g', 'r'] },
];

export const secondaryNav: NavItem[] = [
  { to: '/settings', label: 'Inställningar', icon: Settings, shortcut: ['g', 'i'] },
];

export const allNav: readonly NavItem[] = [...primaryNav, ...secondaryNav];

/**
 * Second key of a "g …" sequence → view. "a" also leads to Ärenden, for keyboards without
 * "ä" (and so that a missed dead key still works).
 */
export function navTargetForKey(key: string): NavItem | undefined {
  const lower = key.toLowerCase();
  const normalized = lower === 'a' ? 'ä' : lower;
  return allNav.find((item) => item.shortcut[1] === normalized);
}
