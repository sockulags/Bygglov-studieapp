import { Link, useParams } from '@tanstack/react-router';
import {
  ArrowLeft,
  CalendarDays,
  FolderX,
  Hourglass,
  Keyboard,
  MapPin,
  Play,
  RotateCcw,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { CaseFile } from '@bygglov/content-schema';
import { EmptyState } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getCase, loadContent } from '@/content';
import {
  currentStep,
  formatSwedishDate,
  stepById,
  stepFeedback,
  visibleDocuments,
  type DecisionDraft,
} from '@/engine';
import { cn } from '@/lib/cn';
import { useKeydown } from '@/lib/use-keydown';
import { useUiStore } from '@/store/ui';
import {
  CASE_LIST_STATUS_LABELS,
  deadlineSummary,
  PROGRESS_STATUS,
  propertyName,
  type CaseListStatus,
} from './case-model';
import {
  flushCaseWrites,
  markCaseDocumentSeen,
  markCaseReviewed,
  openCase,
  saveStepDraft,
  selfAssessCaseStep,
  setCaseReflection,
  startNewCase,
  submitCaseDecision,
  useCaseStore,
  type ActiveCase,
} from './case-store';
import { DecisionComparison } from './decision/decision-comparison';
import { DecisionScreen } from './decision/decision-screen';
import { ExportSlot } from './decision/export-slot';
import { DiaryPanel } from './diary-panel';
import { DocumentViewer } from './documents/document-viewer';
import { useCaseText } from './documents/use-document-text';
import { FullScreen } from './full-screen';
import { KeyboardHelp } from './keyboard-help';
import { WritingComparison } from './steps/writing-comparison';
import { useMediaQuery, WIDE_QUERY } from './use-media-query';
import { WorkPanel } from './work-panel';
import './cases.css';

/** /cases/$caseId: the case view (ärendevyn). */
export function CasePage() {
  const { caseId } = useParams({ from: '/cases/$caseId' });
  const caseFile = getCase(loadContent(), caseId);
  if (!caseFile) {
    return (
      <EmptyState
        icon={<FolderX />}
        title="Ärendet finns inte"
        description={`Det finns inget ärende med id ${caseId} i den här versionen av appen.`}
        action={
          <Link to="/cases" className={buttonVariants()}>
            Till ärendena
          </Link>
        }
      />
    );
  }
  return <CaseLoader key={caseFile.id} caseFile={caseFile} />;
}

function CaseLoader({ caseFile }: { caseFile: CaseFile }) {
  const load = useCaseStore((s) => s.load);
  const active = useCaseStore((s) => s.active);

  useEffect(() => {
    void openCase(caseFile);
    return () => {
      void flushCaseWrites();
    };
  }, [caseFile]);

  const matches = load.status !== 'idle' && load.caseId === caseFile.id;
  if (matches && load.status === 'ready' && active?.caseId === caseFile.id) {
    return <CaseWorkspace caseFile={caseFile} active={active} />;
  }
  if (matches && load.status === 'not_started') return <StartCase caseFile={caseFile} />;
  if (matches && (load.status === 'invalid' || load.status === 'error')) {
    return (
      <EmptyState
        icon={<FolderX />}
        title="Ärendet kan inte fortsätta"
        description={load.status === 'invalid' ? load.reason : load.message}
        action={
          <Button onClick={() => startNewCase(caseFile)}>
            <RotateCcw aria-hidden="true" />
            Börja om ärendet
          </Button>
        }
      />
    );
  }
  return (
    <p className="text-muted" role="status">
      Öppnar ärendet …
    </p>
  );
}

/* ---------------------------------------------------------------------- start view */

function StartCase({ caseFile }: { caseFile: CaseFile }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <Link to="/cases" className="inline-flex items-center gap-1.5 text-sm font-medium">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Ärenden
      </Link>
      <Card>
        <CardContent className="flex flex-col gap-4 p-6 sm:p-8">
          <p className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
            {caseFile.id} · Nivå {caseFile.niva}
          </p>
          <h1 className="text-2xl">
            {caseFile.titel}, {propertyName(caseFile)}
          </h1>
          <p className="inline-flex items-center gap-1 text-sm text-muted">
            <MapPin className="size-4" aria-hidden="true" />
            {caseFile.fastighet} · ansökan inkom {caseFile.startdatum}
          </p>
          <p className="text-[1.0625rem] leading-relaxed">{caseFile.sammanfattning}</p>
          <div>
            <h2 className="mb-1.5 text-sm font-semibold">Det här tränar du</h2>
            <ul className="list-disc space-y-1 pl-5 text-[0.9375rem]">
              {caseFile.larandemal.map((goal) => (
                <li key={goal}>{goal}</li>
              ))}
            </ul>
          </div>
          <p className="text-sm text-muted">
            Ärendet har en egen kalender. Tiden går när du slutför steg, och saker kan hända på
            vägen. Allt sparas, så du kan sluta mitt i och fortsätta en annan dag.
          </p>
          <div>
            <Button size="lg" onClick={() => startNewCase(caseFile)}>
              <Play aria-hidden="true" />
              Starta ärendet
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------------ workspace */

type PanelId = 'diarium' | 'handling' | 'arbete';

const PANELS: { id: PanelId; label: string }[] = [
  { id: 'diarium', label: 'Diarium' },
  { id: 'handling', label: 'Handling' },
  { id: 'arbete', label: 'Arbetsyta' },
];

const STATUS_TONE: Record<CaseListStatus, string> = {
  ny: 'border-line-strong text-muted',
  pagar: 'border-accent/40 bg-accent-soft text-accent',
  inlamnat: 'border-brick/40 bg-brick-soft text-brick',
  bedomt: 'border-success/40 bg-success-soft text-success',
};

const DEADLINE_TONE = {
  normal: 'border-line-strong bg-paper text-ink',
  warning: 'border-plan-yellow bg-plan-yellow-soft text-ink',
  overdue: 'border-brick/50 bg-brick-soft text-brick',
  paused: 'border-line-strong bg-bg text-muted',
  done: 'border-success/40 bg-success-soft text-success',
} as const;

function useDiaryNumber(caseFile: CaseFile): string | undefined {
  const application =
    caseFile.handlingar.find((d) => d.typ === 'ansokan' && d.fil.endsWith('.md')) ??
    caseFile.handlingar.find((d) => d.fil.endsWith('.md'));
  return useCaseText(caseFile.id, application?.fil ?? null).data?.meta.diarienummer;
}

function CaseWorkspace({ caseFile, active }: { caseFile: CaseFile; active: ActiveCase }) {
  const { state, lastOutcome } = active;
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const wide = useMediaQuery(WIDE_QUERY);
  const saveError = useCaseStore((s) => s.saveError);
  const actionError = useCaseStore((s) => s.actionError);
  const diaryNumber = useDiaryNumber(caseFile);

  const [selectedId, setSelectedId] = useState<string | null>(
    () => state.visibleDocuments[0]?.documentId ?? null,
  );
  const [panel, setPanel] = useState<PanelId>('arbete');
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [writingStepId, setWritingStepId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [restartOpen, setRestartOpen] = useState(false);
  const overlayOpen = decisionOpen || comparisonOpen || writingStepId !== null || restartOpen;

  // The document shown first counts as read.
  useEffect(() => {
    if (selectedId) markCaseDocumentSeen(caseFile, selectedId);
  }, [caseFile, selectedId]);

  const openDocument = (documentId: string) => {
    setSelectedId(documentId);
    markCaseDocumentSeen(caseFile, documentId);
    if (!wide) setPanel('handling');
  };

  useKeydown((event) => {
    if (event.key === '?') {
      event.preventDefault();
      setHelpOpen((v) => !v);
    } else if (event.key === 'Escape' && selectedId !== null) {
      event.preventDefault();
      setSelectedId(null);
      if (!wide) setPanel('arbete');
    }
  }, !overlayOpen && !helpOpen);

  const docs = visibleDocuments(caseFile, state);
  const selected = docs.find((d) => d.document.id === selectedId) ?? null;
  const step = currentStep(caseFile, state);
  const decisionStep = step?.typ === 'beslut' ? step : null;
  const latestDecision = state.decisions.at(-1) ?? null;
  const decisionDraft = decisionStep ? active.drafts[decisionStep.id] : undefined;
  const writingStep = writingStepId ? stepById(caseFile, writingStepId) : null;
  const writingAnswer = writingStepId ? state.stepResults[writingStepId]?.answer : undefined;
  const deadline = deadlineSummary(state);
  const status = PROGRESS_STATUS[state.status];

  const submitDecision = (draft: DecisionDraft) => {
    const outcome = submitCaseDecision(caseFile, draft);
    if (outcome) {
      setDecisionOpen(false);
      setComparisonOpen(true);
    }
  };

  const panelClass = (id: PanelId) =>
    cn('flex min-h-0 flex-col bg-bg', !wide && panel !== id && 'hidden');

  return (
    <div
      className="fixed inset-y-0 right-0 z-10 flex flex-col bg-bg transition-[left] duration-[var(--duration-base)] ease-[var(--ease-out)]"
      style={{ left: collapsed ? 'var(--sidebar-width-collapsed)' : 'var(--sidebar-width)' }}
    >
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-paper px-4 py-2.5">
        <Link
          to="/cases"
          className="inline-flex size-8 items-center justify-center rounded-sm text-muted hover:bg-accent-soft hover:text-ink"
          aria-label="Tillbaka till ärendena"
          title="Tillbaka till ärendena"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
        </Link>
        <div className="min-w-[16rem] flex-1">
          <p className="truncate text-xs font-semibold tracking-[0.08em] text-muted uppercase">
            {caseFile.id} · Nivå {caseFile.niva}
            {diaryNumber ? ` · Dnr ${diaryNumber}` : ''}
          </p>
          <h1 className="truncate text-lg leading-tight">
            {caseFile.titel}, {propertyName(caseFile)}
          </h1>
          <p className="truncate text-xs text-muted">
            {caseFile.fastighet}
            {step ? ` · Att göra: ${step.rubrik}` : ''}
          </p>
        </div>
        <dl className="flex flex-wrap items-center gap-2 text-sm">
          <div
            className="inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-bg px-2.5 py-1"
            title="Dagens datum i ärendets kalender"
          >
            <CalendarDays className="size-4 text-muted" aria-hidden="true" />
            <dt className="sr-only">Datum i ärendet</dt>
            <dd className="tabular-nums">{formatSwedishDate(state.simDate)}</dd>
          </div>
          <div
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1',
              DEADLINE_TONE[deadline.tone],
            )}
            title={deadline.detail}
          >
            <Hourglass className="size-4" aria-hidden="true" />
            <dt className="sr-only">Tidsfrist enligt 9 kap. 99 § PBL</dt>
            <dd className="tabular-nums">
              {deadline.label}
              <span className="sr-only">. {deadline.detail}</span>
            </dd>
          </div>
          <div
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-xs font-medium',
              STATUS_TONE[status],
            )}
          >
            <dt className="sr-only">Status</dt>
            <dd>{CASE_LIST_STATUS_LABELS[status]}</dd>
          </div>
        </dl>
        <div className="flex items-center gap-1">
          {latestDecision && (
            <Button variant="secondary" size="sm" onClick={() => setComparisonOpen(true)}>
              Jämförelse
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="size-8 px-0"
            onClick={() => setHelpOpen(true)}
            aria-label="Tangentbordshjälp (?)"
            title="Tangentbordshjälp (?)"
          >
            <Keyboard aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="size-8 px-0"
            onClick={() => setRestartOpen(true)}
            aria-label="Börja om ärendet"
            title="Börja om ärendet"
          >
            <RotateCcw aria-hidden="true" />
          </Button>
        </div>
      </header>

      {(saveError || actionError) && (
        <p
          role="status"
          className="border-b border-brick/30 bg-brick-soft px-4 py-1.5 text-sm text-brick"
        >
          {actionError ?? saveError}
        </p>
      )}

      {!wide && (
        <div
          role="tablist"
          aria-label="Paneler"
          className="flex gap-1 border-b border-line bg-paper px-3 py-1.5"
        >
          {PANELS.map((p) => {
            const unseen = p.id === 'diarium' && state.visibleDocuments.some((d) => d.unseen);
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                id={`tab-${p.id}`}
                aria-selected={panel === p.id}
                aria-controls={`panel-${p.id}`}
                onClick={() => setPanel(p.id)}
                className={cn(
                  'relative h-8 rounded-sm px-3 text-sm font-medium',
                  panel === p.id ? 'bg-accent-soft text-ink' : 'text-muted hover:text-ink',
                )}
              >
                {p.label}
                {unseen && (
                  <span
                    className="ml-1.5 inline-block size-2 rounded-full bg-brick"
                    aria-label="nya handlingar"
                  />
                )}
              </button>
            );
          })}
        </div>
      )}

      <div
        className={cn(
          'min-h-0 flex-1',
          wide && 'grid grid-cols-[minmax(240px,280px)_minmax(0,1fr)_minmax(360px,420px)]',
        )}
      >
        <section
          id="panel-diarium"
          aria-label="Diarium"
          {...(!wide ? { role: 'tabpanel', 'aria-labelledby': 'tab-diarium' } : {})}
          className={cn(panelClass('diarium'), 'h-full border-r border-line')}
        >
          {wide && (
            <h2 className="border-b border-line px-4 py-2.5 text-sm font-semibold tracking-[0.06em] text-muted uppercase">
              Diarium
            </h2>
          )}
          <div className="min-h-0 flex-1 overflow-auto">
            <DiaryPanel
              caseFile={caseFile}
              state={state}
              selectedDocumentId={selectedId}
              onOpenDocument={openDocument}
            />
          </div>
        </section>
        <section
          id="panel-handling"
          aria-label="Handling"
          {...(!wide ? { role: 'tabpanel', 'aria-labelledby': 'tab-handling' } : {})}
          className={cn(
            panelClass('handling'),
            'h-full bg-[color-mix(in_srgb,var(--bg)_70%,var(--line))]',
          )}
        >
          <DocumentViewer
            caseFile={caseFile}
            document={selected?.document ?? null}
            receivedDate={selected?.receivedDate ?? null}
            isNew={
              selected
                ? (lastOutcome?.newDocumentIds.includes(selected.document.id) ?? false)
                : false
            }
            onClose={() => {
              setSelectedId(null);
              if (!wide) setPanel('arbete');
            }}
          />
        </section>
        <section
          id="panel-arbete"
          aria-label="Arbetsyta"
          {...(!wide ? { role: 'tabpanel', 'aria-labelledby': 'tab-arbete' } : {})}
          className={cn(panelClass('arbete'), 'h-full border-l border-line bg-paper')}
        >
          <WorkPanel
            caseFile={caseFile}
            active={active}
            onOpenDocument={openDocument}
            onOpenDecision={() => setDecisionOpen(true)}
            onOpenComparison={() => setComparisonOpen(true)}
            onCompareWriting={setWritingStepId}
          />
        </section>
      </div>

      {decisionStep && (
        <DecisionScreen
          key={decisionStep.id}
          caseFile={caseFile}
          state={state}
          stepId={decisionStep.id}
          open={decisionOpen}
          onOpenChange={setDecisionOpen}
          initialDraft={
            decisionDraft && 'decision' in decisionDraft ? decisionDraft.decision : undefined
          }
          onDraftChange={(draft) => saveStepDraft(caseFile, decisionStep.id, { decision: draft })}
          onSubmit={submitDecision}
          diaryNumber={diaryNumber}
        />
      )}

      {latestDecision && (
        <FullScreen
          open={comparisonOpen}
          onOpenChange={setComparisonOpen}
          eyebrow={`${caseFile.id} · beslut ${latestDecision.date}`}
          title="Jämförelse med modellbeslutet"
          actions={
            <ExportSlot decisionId={active.decisionIds.at(-1) ?? null} caseId={caseFile.id} />
          }
        >
          <DecisionComparison
            caseFile={caseFile}
            state={state}
            decision={latestDecision}
            diaryNumber={diaryNumber}
            reflection={active.reflection}
            onReflectionChange={(text) => setCaseReflection(caseFile, text)}
            onSelfAssess={(checked) => selfAssessCaseStep(caseFile, latestDecision.stepId, checked)}
            decisionId={active.decisionIds.at(-1) ?? null}
            onReviewed={() => void markCaseReviewed(caseFile)}
          />
        </FullScreen>
      )}

      {writingStep?.typ === 'skrivelse' && writingAnswer?.type === 'skrivelse' && (
        <WritingComparison
          caseFile={caseFile}
          step={writingStep}
          text={writingAnswer.text}
          feedback={stepFeedback(caseFile, state, writingStep.id)}
          open
          onOpenChange={(open) => !open && setWritingStepId(null)}
          onSelfAssess={(checked) => selfAssessCaseStep(caseFile, writingStep.id, checked)}
        />
      )}

      <KeyboardHelp open={helpOpen} onOpenChange={setHelpOpen} />

      <Dialog open={restartOpen} onOpenChange={setRestartOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Börja om ärendet?</DialogTitle>
            <DialogDescription>
              Allt du gjort i {caseFile.id} tas bort: svar, händelser, beslut och anteckningar.
              Ärendet startar från ansökningsdagen igen.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Avbryt</Button>
            </DialogClose>
            <Button
              variant="danger"
              onClick={() => {
                setRestartOpen(false);
                const started = startNewCase(caseFile);
                setSelectedId(started.state.visibleDocuments[0]?.documentId ?? null);
              }}
            >
              Börja om
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
