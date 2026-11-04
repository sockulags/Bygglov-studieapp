import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';

interface SectionProps {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}

export function SettingsSection({ id, title, description, children }: SectionProps) {
  return (
    <section aria-labelledby={id} className="grid gap-4 md:grid-cols-[240px_1fr] md:gap-8">
      <div>
        <h2 id={id} className="text-lg">
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>
      <Card className="divide-y divide-line">{children}</Card>
    </section>
  );
}

export function SettingsRow({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
      <div className="min-w-0 max-w-md">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="font-medium">
            {label}
          </label>
        ) : (
          <p className="font-medium">{label}</p>
        )}
        {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
