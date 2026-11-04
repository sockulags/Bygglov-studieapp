import { Link } from '@tanstack/react-router';
import { BookOpen } from 'lucide-react';
import { EmptyState } from '@/components/layout/page-header';
import { buttonVariants } from '@/components/ui/button-variants';
import { QuizView } from './quiz-view';
import { useStudyStore } from './study-store';
import { SummaryView } from './summary-view';

/** /study/session: the pass in progress, or its summary once it is finished. */
export function StudySessionPage() {
  const run = useStudyStore((s) => s.run);
  if (!run) {
    return (
      <EmptyState
        icon={<BookOpen />}
        title="Inget pass pågår"
        description="Välj ett läge och en modul under Plugga för att börja."
        action={
          <Link to="/study" className={buttonVariants()}>
            Till Plugga
          </Link>
        }
      />
    );
  }
  return run.session.status === 'finished' ? (
    <SummaryView key={run.key} run={run} />
  ) : (
    <QuizView key={run.key} run={run} />
  );
}
