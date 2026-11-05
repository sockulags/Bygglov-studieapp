import type { DrawingQuestion } from '@bygglov/content-schema';
import { questionDrawingUrl } from '@/content';
import { DrawingViewer } from '@/features/cases/documents/drawing-viewer';
import { cn } from '@/lib/cn';

/**
 * The drawing of a `ritning` question, in the same viewer as the case view: zoom, panning
 * and the measuring tool (M). `bild_text` is the caption, which also carries the question
 * when the drawing is missing from the build.
 */
export function QuestionDrawing({
  question,
  moduleId,
  className,
}: {
  question: DrawingQuestion;
  moduleId: string;
  className?: string;
}) {
  const src = questionDrawingUrl(moduleId, question);
  const title = question.bild_text ?? 'Ritning till frågan';
  return (
    <figure className={cn('flex flex-col gap-2', className)}>
      <DrawingViewer
        key={src}
        src={src}
        title={title}
        fit="page"
        frameClassName="h-[min(65vh,560px)] flex-none"
        missing={
          <p>
            {question.bild_text
              ? 'Utgå från beskrivningen under rutan.'
              : 'Hoppa över frågan om du inte kan svara utan ritningen.'}
          </p>
        }
      />
      {question.bild_text && (
        <figcaption className="text-sm text-muted">{question.bild_text}</figcaption>
      )}
    </figure>
  );
}
