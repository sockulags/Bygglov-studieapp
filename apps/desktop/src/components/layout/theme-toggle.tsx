import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useUiStore, type Theme } from '@/store/ui';
import { cn } from '@/lib/cn';

const order: Theme[] = ['system', 'light', 'dark'];

const meta: Record<Theme, { label: string; icon: typeof Sun }> = {
  system: { label: 'Följer systemet', icon: Monitor },
  light: { label: 'Ljust läge', icon: Sun },
  dark: { label: 'Mörkt läge', icon: Moon },
};

/** Cycles system → ljust → mörkt. Full control lives in Inställningar → Utseende. */
export function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const { label, icon: Icon } = meta[theme];

  const next = () => {
    const index = order.indexOf(theme);
    setTheme(order[(index + 1) % order.length] ?? 'system');
  };

  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>
        <button
          type="button"
          onClick={next}
          aria-label={`Tema: ${label}. Klicka för att byta.`}
          className={cn(
            'inline-flex h-9 items-center gap-2 rounded-md px-2 text-sm text-muted hover:bg-accent-soft hover:text-ink',
            collapsed && 'size-9 justify-center px-0',
          )}
        >
          <Icon className="size-[18px]" strokeWidth={1.75} aria-hidden="true" />
          {!collapsed && <span>{label}</span>}
        </button>
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side="right"
          sideOffset={8}
          className="z-50 rounded-sm border border-line bg-paper px-2 py-1 text-xs text-ink shadow-paper"
        >
          Byt tema
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
