import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'system' | 'light' | 'dark';
export type TextSize = 'normal' | 'large' | 'xlarge';

interface UiState {
  theme: Theme;
  textSize: TextSize;
  sidebarCollapsed: boolean;
  setTheme: (theme: Theme) => void;
  setTextSize: (size: TextSize) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

/** Storage key; index.html reads the same key before first paint. */
export const UI_STORAGE_KEY = 'bygglov-ui';

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: 'system',
      textSize: 'normal',
      sidebarCollapsed: false,
      setTheme: (theme) => set({ theme }),
      setTextSize: (textSize) => set({ textSize }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
    }),
    { name: UI_STORAGE_KEY },
  ),
);

/** Reflect theme and text size on <html> so tokens.css can react. */
export function applyUiPreferences(theme: Theme, textSize: TextSize): void {
  const root = document.documentElement;
  if (theme === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
  if (textSize === 'normal') {
    root.removeAttribute('data-text-size');
  } else {
    root.setAttribute('data-text-size', textSize);
  }
}

/** Resolve 'system' to the actual theme currently shown. */
export function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
