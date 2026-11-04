import { cn } from '@/lib/cn';

/** Inline app mark (same motif as src-tauri/icons/app-icon.svg): a gable house on a plan sheet. */
export function AppMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn('text-accent', className)}
      role="img"
      aria-label="Bygglov-studieapp"
    >
      <rect x="2" y="2" width="60" height="60" rx="14" fill="currentColor" opacity="0.12" />
      <path
        d="M14 32 L32 16 L50 32"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19 29 V47 H45 V29"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M28 47 V37 H36 V47"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <circle cx="47" cy="47" r="7" fill="var(--brick)" />
      <path
        d="M43.5 47 L46 49.5 L50.5 44.5"
        fill="none"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
