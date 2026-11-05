import { Outlet } from '@tanstack/react-router';
import { Sidebar } from '@/components/layout/sidebar';
import {
  CommandPalette,
  GlobalTutor,
  ShortcutsHelpDialog,
  useGlobalShortcuts,
} from '@/features/command-palette';
import { UpdatePrompt, WhatsNewDialog } from '@/features/updates';
import { useUiStore } from '@/store/ui';
import { cn } from '@/lib/cn';
import { isTauri } from '@/lib/tauri';

export function RootLayout() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  useGlobalShortcuts();
  return (
    <div className="flex min-h-screen bg-bg text-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-md focus:bg-paper focus:px-3 focus:py-2 focus:shadow-paper"
      >
        Hoppa till innehållet
      </a>
      <Sidebar />
      <main
        id="main"
        tabIndex={-1}
        className={cn(
          // Focused only as a target (skip link, after the palette changes view), never by Tab.
          'min-w-0 flex-1 transition-[padding] duration-[var(--duration-base)] ease-[var(--ease-out)] focus-visible:outline-none',
          collapsed ? 'pl-[var(--sidebar-width-collapsed)]' : 'pl-[var(--sidebar-width)]',
        )}
      >
        <div className="mx-auto w-full max-w-6xl px-8 py-10">
          <UpdatePrompt className="mb-6" />
          <Outlet />
        </div>
      </main>
      <WhatsNewDialog />
      <CommandPalette />
      <ShortcutsHelpDialog />
      <GlobalTutor />
      {!isTauri() && <BrowserModeBanner />}
    </div>
  );
}

/**
 * In the browser (pnpm dev) the data layer falls back to an in-memory store, so nothing is
 * kept after a reload. A discreet strip at the bottom says so.
 */
function BrowserModeBanner() {
  return (
    <footer className="pointer-events-none fixed right-3 bottom-3 z-40">
      <p
        role="note"
        className="rounded-full border border-line-strong bg-paper px-3 py-1 text-xs text-ink shadow-paper"
      >
        Testläge i webbläsaren: inget sparas
      </p>
    </footer>
  );
}
