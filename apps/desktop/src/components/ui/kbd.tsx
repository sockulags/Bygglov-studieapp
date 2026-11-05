import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/** Readable names for keys, used for screen readers ("⌘" is read as nothing useful). */
const KEY_NAMES: Readonly<Record<string, string>> = {
  '⌘': 'Kommando',
  '↑': 'Pil upp',
  '↓': 'Pil ned',
  '/': 'Snedstreck',
  '?': 'Frågetecken',
  Esc: 'Escape',
};

function keyName(key: string): string {
  return KEY_NAMES[key] ?? (key.length === 1 ? key.toUpperCase() : key);
}

export interface KbdProps extends HTMLAttributes<HTMLElement> {
  /** Smaller variant for tooltips and list rows. */
  size?: 'sm' | 'md';
}

/** One key, e.g. <Kbd>K</Kbd>. */
export function Kbd({ className, size = 'md', ...props }: KbdProps) {
  return (
    <kbd
      className={cn(
        'inline-flex min-w-[1.5em] items-center justify-center rounded-sm border border-line-strong bg-bg font-sans font-semibold text-ink',
        size === 'sm' ? 'h-5 px-1 text-[0.6875rem]' : 'h-6 px-1.5 text-xs',
        className,
      )}
      {...props}
    />
  );
}

export interface KeyComboProps {
  keys: readonly string[];
  /**
   * How the keys go together: `together` ("Ctrl + K", held at the same time), `sequence`
   * ("G sedan H", one after the other) or `either` ("↑ / ↓", any of them).
   */
  mode?: 'together' | 'sequence' | 'either';
  size?: 'sm' | 'md';
  className?: string;
}

const JOINERS = {
  together: { visible: '+', spoken: ' + ' },
  sequence: { visible: 'sedan', spoken: ' sedan ' },
  either: { visible: '/', spoken: ' eller ' },
} as const;

/**
 * A shortcut as <kbd> elements: "Ctrl + K", "G sedan H" or "↑ / ↓". Letters are shown in
 * upper case like on the keyboard. Screen readers get the whole shortcut as one label.
 */
export function KeyCombo({ keys, mode = 'together', size = 'md', className }: KeyComboProps) {
  const joiner = JOINERS[mode];
  const label = keys.map(keyName).join(joiner.spoken);
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap', className)}>
      <span className="sr-only">{label}</span>
      <span className="inline-flex items-center gap-1" aria-hidden="true">
        {keys.map((key, index) => (
          <span key={`${key}-${index}`} className="inline-flex items-center gap-1">
            {index > 0 && <span className="text-[0.6875rem] text-muted">{joiner.visible}</span>}
            <Kbd size={size}>{key.length === 1 ? key.toUpperCase() : key}</Kbd>
          </span>
        ))}
      </span>
    </span>
  );
}
