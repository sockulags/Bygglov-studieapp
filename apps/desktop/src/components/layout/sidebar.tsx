import { Link } from '@tanstack/react-router';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { primaryNav, secondaryNav, type NavItem } from '@/app/navigation';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { KeyCombo } from '@/components/ui/kbd';
import { modKey, setPaletteOpen } from '@/features/command-palette';
import { AppMark } from '@/components/layout/app-mark';
import { useUiStore } from '@/store/ui';
import { cn } from '@/lib/cn';

function SideTooltip({
  label,
  enabled,
  children,
}: {
  label: ReactNode;
  enabled: boolean;
  children: ReactNode;
}) {
  if (!enabled) return <>{children}</>;
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      {/* No portal: the tooltip stays inside the navigation landmark. */}
      <TooltipPrimitive.Content
        side="right"
        sideOffset={8}
        className="z-50 flex items-center gap-2 rounded-sm border border-line bg-paper px-2 py-1 text-xs text-ink shadow-paper"
      >
        {label}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Root>
  );
}

/** Tooltip text for a navigation link: the name (when collapsed) and the shortcut as <kbd>. */
function NavTooltip({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  return (
    <>
      {collapsed ? <span>{item.label}</span> : <span className="sr-only">{item.label}</span>}
      <KeyCombo keys={item.shortcut} mode="sequence" size="sm" />
    </>
  );
}

function NavLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const Icon = item.icon;
  return (
    <SideTooltip label={<NavTooltip item={item} collapsed={collapsed} />} enabled>
      <Link
        to={item.to}
        activeOptions={{ exact: item.to === '/' }}
        className={cn(
          'group flex h-10 items-center gap-3 rounded-md px-3 text-[0.9375rem] font-medium text-muted',
          'transition-colors duration-[var(--duration-fast)] hover:bg-accent-soft hover:text-ink',
          'data-[status=active]:bg-accent-soft data-[status=active]:text-accent',
          collapsed && 'justify-center px-0',
        )}
        aria-label={collapsed ? item.label : undefined}
      >
        <Icon className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </Link>
    </SideTooltip>
  );
}

export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  return (
    <aside
      aria-label="Huvudnavigation"
      className={cn(
        'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-line bg-paper',
        'transition-[width] duration-[var(--duration-base)] ease-[var(--ease-out)]',
        collapsed ? 'w-[var(--sidebar-width-collapsed)]' : 'w-[var(--sidebar-width)]',
      )}
    >
      <div
        className={cn(
          'flex h-16 items-center gap-3 border-b border-line px-4',
          collapsed && 'justify-center px-0',
        )}
      >
        <AppMark className="size-8 shrink-0" />
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold">Bygglov-studieapp</p>
            <p className="truncate text-xs text-muted">Stadsbyggnadskontoret</p>
          </div>
        )}
      </div>

      <div className="p-2 pb-0">
        <SideTooltip label="Sök i appen" enabled={collapsed}>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-haspopup="dialog"
            aria-keyshortcuts={modKey() === '⌘' ? 'Meta+K' : 'Control+K'}
            aria-label={collapsed ? 'Sök i appen' : undefined}
            className={cn(
              'flex h-9 w-full items-center gap-2 rounded-md border border-line-strong bg-bg px-3 text-sm text-muted',
              'transition-colors duration-[var(--duration-fast)] hover:border-accent/50 hover:text-ink',
              collapsed && 'justify-center px-0',
            )}
          >
            <Search className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            {!collapsed && (
              <>
                <span className="flex-1 text-left">Sök …</span>
                <span aria-hidden="true">
                  <KeyCombo keys={[modKey(), 'K']} size="sm" />
                </span>
              </>
            )}
          </button>
        </SideTooltip>
      </div>

      <nav aria-label="Vyer" className="flex flex-1 flex-col gap-1 p-2 pt-3">
        {primaryNav.map((item) => (
          <NavLink key={item.to} item={item} collapsed={collapsed} />
        ))}
        <div className="my-2 border-t border-line" role="presentation" />
        {secondaryNav.map((item) => (
          <NavLink key={item.to} item={item} collapsed={collapsed} />
        ))}
      </nav>

      <div
        className={cn(
          'flex items-center gap-1 border-t border-line p-2',
          collapsed ? 'flex-col' : 'justify-between',
        )}
      >
        <ThemeToggle collapsed={collapsed} />
        <SideTooltip
          label={collapsed ? 'Visa sidopanel' : 'Fäll ihop sidopanel'}
          enabled={collapsed}
        >
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={collapsed ? 'Visa sidopanel' : 'Fäll ihop sidopanel'}
            aria-expanded={!collapsed}
            className="inline-flex size-9 items-center justify-center rounded-md text-muted hover:bg-accent-soft hover:text-ink"
          >
            {collapsed ? (
              <PanelLeftOpen className="size-[18px]" strokeWidth={1.75} />
            ) : (
              <PanelLeftClose className="size-[18px]" strokeWidth={1.75} />
            )}
          </button>
        </SideTooltip>
      </div>
    </aside>
  );
}
