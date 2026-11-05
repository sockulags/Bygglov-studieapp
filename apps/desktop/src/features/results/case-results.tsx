import { Link } from '@tanstack/react-router';
import { ArrowRight, FolderOpen } from 'lucide-react';
import { SectionTitle } from '@/components/layout/page-header';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card, CardContent } from '@/components/ui/card';
import { loadContent } from '@/content';
import {
  useSubmittedDecisions,
  type CaseListStatus,
  type DecisionWithFeedback,
} from '@/features/cases';
import { markCaseReviewed } from '@/features/cases/case-store';
import { propertyName } from '@/features/cases/case-model';
import { ExportDecisionButton, SupervisorFeedbackPanel } from '@/features/cases/export';
import { formatWhen } from '@/lib/format';
import type { DecisionChecks } from './aggregate';
import { CaseStatusChart, DecisionChecksChart } from './case-charts';

function DecisionCard({ item, now }: { item: DecisionWithFeedback; now: Date }) {
  const { caseFile, decision } = item;
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
              {caseFile.id} · nivå {caseFile.niva}
            </p>
            <h3 className="mt-0.5 font-semibold">
              {caseFile.titel}, {propertyName(caseFile)}
            </h3>
            <p className="text-sm text-muted">
              Inlämnat {formatWhen(decision.submittedAt, now)}
              {decision.exportedAt
                ? ` · exporterat ${formatWhen(decision.exportedAt, now)}`
                : ' · inte exporterat än'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/cases/$caseId"
              params={{ caseId: caseFile.id }}
              className={buttonVariants({ variant: 'ghost', size: 'sm' })}
            >
              Öppna ärendet
              <ArrowRight aria-hidden="true" />
            </Link>
            <ExportDecisionButton caseId={caseFile.id} decisionId={decision.id} size="sm" />
          </div>
        </div>
        <SupervisorFeedbackPanel
          decisionId={decision.id}
          className="bg-bg"
          onAdded={() => void markCaseReviewed(caseFile)}
        />
      </CardContent>
    </Card>
  );
}

/**
 * Mina resultat → Ärenden: cases per status, the checks passed per submitted decision and
 * the submitted decisions with export and supervisor feedback.
 */
export function CaseResults({
  counts,
  checks,
}: {
  counts: readonly { status: CaseListStatus; count: number }[];
  checks: readonly DecisionChecks[];
}) {
  const { cases } = loadContent();
  const decisions = useSubmittedDecisions(cases);
  const now = new Date();
  const items = decisions.data ?? [];

  return (
    <section aria-labelledby="results-cases" className="mb-10">
      <SectionTitle>
        <span id="results-cases">Ärenden</span>
      </SectionTitle>
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <CaseStatusChart counts={counts} />
        <DecisionChecksChart rows={checks} now={now} />
      </div>
      {decisions.isLoading ? (
        <p className="text-sm text-muted" role="status">
          Läser in besluten …
        </p>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <p className="flex items-center gap-2 text-sm text-muted">
              <FolderOpen className="size-4 shrink-0" aria-hidden="true" />
              När du lämnat in ett beslut i ett ärende visas det här, med exporten till handledaren
              och hens bedömning.
            </p>
            <Link to="/cases" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              Till ärendena
              <ArrowRight aria-hidden="true" />
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <h3 className="sr-only">Inlämnade beslut</h3>
          {items.map((item) => (
            <DecisionCard key={item.decision.id} item={item} now={now} />
          ))}
        </div>
      )}
    </section>
  );
}
