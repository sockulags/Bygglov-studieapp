import {
  BookMarked,
  BookOpen,
  ChartLine,
  FolderOpen,
  Home,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: '/' | '/study' | '/cases' | '/lookup' | '/results' | '/settings';
  label: string;
  icon: LucideIcon;
  /** Keyboard hint shown in tooltip when the sidebar is collapsed. */
  shortcut?: string;
}

/** Primary navigation (docs/04 → Navigation). */
export const primaryNav: NavItem[] = [
  { to: '/', label: 'Hem', icon: Home },
  { to: '/study', label: 'Plugga', icon: BookOpen },
  { to: '/cases', label: 'Ärenden', icon: FolderOpen },
  { to: '/lookup', label: 'Uppslag', icon: BookMarked },
  { to: '/results', label: 'Mina resultat', icon: ChartLine },
];

export const secondaryNav: NavItem[] = [
  { to: '/settings', label: 'Inställningar', icon: Settings },
];
