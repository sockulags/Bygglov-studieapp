import { Columns2 } from 'lucide-react';
import { useId, useState } from 'react';
import type { WritingStep as WritingStepContent } from '@bygglov/content-schema';
import { Button } from '@/components/ui/button';
import type { StepAnswer } from '@/engine';
import { StepActions } from './shared';

export interface WritingStepProps {
  step: WritingStepContent;
  answer: Extract<StepAnswer, { type: 'skrivelse' }> | null;
  draftText?: string;
  onDraft?: (text: string) => void;
  onSubmit: (answer: StepAnswer) => void;
  onSkip?: () => void;
  /** Opens her text and the model text side by side. */
  onCompare?: () => void;
}

/**
 * Skrivelse: a free text (föreläggande, kommunicering, yttrande). The assessment criteria
 * are shown only after it has been handed in, next to the model text.
 */
export function WritingStep({
  answer,
  draftText = '',
  onDraft,
  onSubmit,
  onSkip,
  onCompare,
}: WritingStepProps) {
  const id = useId();
  const [text, setText] = useState(draftText);
  const answered = answer !== null;
  const submit = () => onSubmit({ type: 'skrivelse', text });
  const words = (answered ? answer.text : text).trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor={id} className="text-sm text-muted">
        Skriv som du skulle skicka det. Bedömningspunkterna visas när du lämnat in.
      </label>
      <textarea
        id={id}
        value={answered ? answer.text : text}
        readOnly={answered}
        rows={answered ? 8 : 14}
        onChange={(event) => {
          setText(event.target.value);
          onDraft?.(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !answered) {
            event.preventDefault();
            submit();
          }
        }}
        className="w-full rounded-md border border-line-strong bg-paper p-3 font-serif text-[1rem] leading-relaxed focus-visible:border-accent"
      />
      <p className="text-xs text-muted tabular-nums">{words} ord</p>
      {!answered ? (
        <StepActions
          onSubmit={submit}
          disabled={text.trim() === ''}
          hint="eller Ctrl + Enter"
          onSkip={onSkip}
        />
      ) : (
        onCompare && (
          <div>
            <Button variant="secondary" onClick={onCompare}>
              <Columns2 aria-hidden="true" />
              Jämför med modelltexten
            </Button>
          </div>
        )
      )}
    </div>
  );
}
