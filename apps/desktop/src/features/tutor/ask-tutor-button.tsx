import { GraduationCap } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button, type ButtonSize, type ButtonVariant } from '@/components/ui/button';
import { TutorPanel } from './tutor-panel';
import type { TutorContext } from './types';

export interface AskTutorButtonProps {
  context: TutorContext;
  suggestions: readonly string[];
  /** Default "Fråga handledaren". */
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

/** "Fråga handledaren": a button that opens the tutor panel for `context`. */
export function AskTutorButton({
  context,
  suggestions,
  label = 'Fråga handledaren',
  variant = 'secondary',
  size = 'sm',
  className,
}: AskTutorButtonProps) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button
        ref={button}
        variant={variant}
        size={size}
        className={className}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <GraduationCap aria-hidden="true" />
        {label}
      </Button>
      <TutorPanel
        context={context}
        suggestions={suggestions}
        open={open}
        onOpenChange={setOpen}
        returnFocusRef={button}
      />
    </>
  );
}
