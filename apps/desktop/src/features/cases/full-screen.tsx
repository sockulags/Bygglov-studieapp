import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

/**
 * A full-screen view on top of the case (beslutsformuläret, jämförelser). Built on the
 * Radix dialog, so focus stays inside, Esc closes and the case behind is inert.
 */
export function FullScreen({
  open,
  onOpenChange,
  title,
  eyebrow,
  description,
  actions,
  closeLabel = 'Tillbaka till ärendet',
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  eyebrow?: string;
  description?: string;
  actions?: ReactNode;
  closeLabel?: string;
  children: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex flex-col bg-bg text-ink outline-none data-[state=open]:animate-[fade-in_var(--duration-base)_var(--ease-out)]"
          {...(description === undefined ? { 'aria-describedby': undefined } : {})}
        >
          <header className="flex flex-wrap items-center gap-3 border-b border-line bg-paper px-5 py-3">
            <div className="min-w-0 flex-1">
              {eyebrow && (
                <p className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
                  {eyebrow}
                </p>
              )}
              <DialogPrimitive.Title className="truncate text-lg font-semibold">
                {title}
              </DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="text-sm text-muted">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            {actions}
            <DialogPrimitive.Close asChild>
              <Button variant="secondary" size="sm">
                <X aria-hidden="true" />
                {closeLabel}
              </Button>
            </DialogPrimitive.Close>
          </header>
          <div className="min-h-0 flex-1">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
