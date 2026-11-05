import { ExternalLink as ExternalLinkIcon } from 'lucide-react';
import type { AnchorHTMLAttributes, MouseEvent } from 'react';
import { cn } from '@/lib/cn';
import { isTauri } from '@/lib/tauri';

export interface ExternalLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
}

/**
 * Link to a web page outside the app (riksdagen.se, Boverket). In the desktop app it opens
 * in the default browser through the opener plugin; in the browser it opens a new tab.
 */
export function ExternalLink({ href, className, children, onClick, ...props }: ExternalLinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || !isTauri()) return;
    event.preventDefault();
    void import('@tauri-apps/plugin-opener')
      .then(({ openUrl }) => openUrl(href))
      .catch(() => window.open(href, '_blank', 'noopener'));
  };
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={handleClick}
      className={cn(
        'inline-flex items-center gap-1 text-accent underline-offset-2 hover:underline',
        className,
      )}
      {...props}
    >
      {children}
      <ExternalLinkIcon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="sr-only"> (öppnas i webbläsaren)</span>
    </a>
  );
}
