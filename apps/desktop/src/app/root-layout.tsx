import { Outlet } from '@tanstack/react-router';
import { Sidebar } from '@/components/layout/sidebar';
import { UpdatePrompt, WhatsNewDialog } from '@/features/updates';
import { useUiStore } from '@/store/ui';
import { cn } from '@/lib/cn';

export function RootLayout() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
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
          'min-w-0 flex-1 transition-[padding] duration-[var(--duration-base)] ease-[var(--ease-out)]',
          collapsed ? 'pl-[var(--sidebar-width-collapsed)]' : 'pl-[var(--sidebar-width)]',
        )}
      >
        <div className="mx-auto w-full max-w-6xl px-8 py-10">
          <UpdatePrompt className="mb-6" />
          <Outlet />
        </div>
      </main>
      <WhatsNewDialog />
    </div>
  );
}
