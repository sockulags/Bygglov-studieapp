import { ChevronDown, Scale } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { EmptyState } from '@/components/layout/page-header';
import { LawRefChip } from '@/components/ui/law-ref-chip';
import type { LawChapterFile, LookupContent, Module } from '@/content';
import { cn } from '@/lib/cn';
import { ExternalLink } from './external-link';
import {
  chapterSections,
  type LawGroup,
  type LawRefEntry,
  type SectionEntry,
  usageText,
} from './law-register';
import { sectionElementId, useLookupNav } from './lookup-nav';

const isoDay = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' });
const formatDay = (iso: string) => isoDay.format(new Date(`${iso}T00:00:00`));

/** Law text with one paragraph or list item per line; list items are indented. */
export function LawText({ text, className }: { text: string; className?: string }) {
  return (
    <div
      className={cn('flex flex-col gap-1.5 font-serif text-[0.9375rem] leading-relaxed', className)}
    >
      {text.split('\n').map((line, index) => (
        <p
          key={index}
          className={cn(/^\d+\.\s/.test(line) && 'pl-5', /^[a-z]\)\s/.test(line) && 'pl-10')}
        >
          {line}
        </p>
      ))}
    </div>
  );
}

function SectionRow({
  entry,
  moduleTitles,
  showRubrik,
}: {
  entry: SectionEntry;
  moduleTitles: ReadonlyMap<string, string>;
  /** Repeat the heading in the row (for rows that are not directly under it). */
  showRubrik: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [showComing, setShowComing] = useState(false);
  const textId = useId();
  const { section } = entry;
  const usage = usageText(entry.usage, moduleTitles);
  return (
    <li
      id={sectionElementId(entry.key)}
      tabIndex={-1}
      className="scroll-mt-24 rounded-md border border-line bg-paper px-4 py-3 outline-none transition-colors duration-500 focus-visible:border-accent data-[flash=true]:border-plan-yellow data-[flash=true]:bg-plan-yellow-soft"
    >
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2 sm:flex-nowrap">
        <span className="w-14 shrink-0 pt-0.5 font-serif text-base font-semibold whitespace-nowrap">
          {section.paragraf} §
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {showRubrik && section.rubrik && (
            <p className="text-xs font-medium text-muted">{section.rubrik}</p>
          )}
          <p className={cn('text-[0.9375rem]', section.upphavd && 'text-muted')}>
            {section.sammanfattning}
          </p>
          <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
            {section.upphavd && <span className="font-medium text-brick">{section.upphavd}</span>}
            {section.upphor && <span>Gäller till {formatDay(section.upphor)}</span>}
            {section.kommande && (
              <span className="font-medium text-brick">
                Ny lydelse från {formatDay(section.kommande.fran)}
              </span>
            )}
            {usage && <span>{usage}</span>}
          </p>
        </div>
        {section.lagtext && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={textId}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-line-strong px-2.5 text-sm hover:border-accent/40 hover:bg-accent-soft"
          >
            {open ? 'Dölj lagtexten' : 'Visa lagtexten'}
            <ChevronDown
              className={cn('size-4 transition-transform', open && 'rotate-180')}
              aria-hidden="true"
            />
          </button>
        )}
      </div>
      {open && section.lagtext && (
        <div id={textId} className="mt-3 border-t border-line pt-3 sm:ml-18">
          <LawText text={section.lagtext} />
          <p className="mt-2 text-xs text-muted">
            {section.andrad_genom ?? 'Lagtext'} · riksdagen.se
          </p>
          {section.kommande && (
            <div className="mt-3">
              <button
                type="button"
                aria-expanded={showComing}
                onClick={() => setShowComing((v) => !v)}
                className="text-sm text-accent underline-offset-2 hover:underline"
              >
                {showComing ? 'Dölj' : 'Visa'} lydelsen från {formatDay(section.kommande.fran)}
              </button>
              {showComing && (
                <div className="mt-2 rounded-md border border-dashed border-line-strong p-3">
                  <LawText text={section.kommande.lagtext} />
                  {section.kommande.andrad_genom && (
                    <p className="mt-2 text-xs text-muted">{section.kommande.andrad_genom}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function ChapterBlock({
  chapter,
  sections,
  lawName,
  lawUrl,
  moduleTitles,
}: {
  chapter: LawChapterFile;
  sections: readonly SectionEntry[];
  lawName: string;
  lawUrl?: string;
  moduleTitles: ReadonlyMap<string, string>;
}) {
  const headings: { rubrik?: string; entries: SectionEntry[] }[] = [];
  for (const entry of sections) {
    const last = headings[headings.length - 1];
    if (last && last.rubrik === entry.section.rubrik) last.entries.push(entry);
    else headings.push({ rubrik: entry.section.rubrik, entries: [entry] });
  }
  return (
    <section
      aria-labelledby={`kapitel-${chapter.lag}-${chapter.kapitel}`}
      className="flex flex-col gap-3"
    >
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">{lawName}</p>
          <h3 id={`kapitel-${chapter.lag}-${chapter.kapitel}`} className="text-xl">
            {chapter.lag} {chapter.kapitel} kap. {chapter.rubrik}
          </h3>
          <p className="mt-1 text-sm text-muted">
            En mening per paragraf, skriven för appen. Lagtexten är{' '}
            {chapter.andrad_tom.replace('SFS', 'ändrad t.o.m. SFS')}, hämtad{' '}
            {formatDay(chapter.hamtad)}.
          </p>
        </div>
        {lawUrl && <ExternalLink href={lawUrl}>Hela lagen på riksdagen.se</ExternalLink>}
      </header>
      {headings.map((group, index) => (
        <div key={`${group.rubrik ?? 'inledning'}-${index}`} className="flex flex-col gap-2">
          <h4 className="pt-2 text-sm font-semibold text-muted">
            {group.rubrik ?? 'Inledande bestämmelser'}
          </h4>
          <ul className="flex flex-col gap-2">
            {group.entries.map((entry, i) => (
              <SectionRow
                key={entry.key}
                entry={entry}
                moduleTitles={moduleTitles}
                showRubrik={i > 0}
              />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

export function LawTab({
  lookup,
  register,
  modules,
}: {
  lookup: LookupContent;
  register: readonly LawGroup[];
  modules: readonly Module[];
}) {
  const nav = useLookupNav();
  const [caseOnly, setCaseOnly] = useState(false);
  const moduleTitles = useMemo(() => new Map(modules.map((m) => [m.id, m.titel])), [modules]);
  const chapters = useMemo(
    () =>
      lookup.chapters.map((chapter) => ({ chapter, sections: chapterSections(chapter, register) })),
    [lookup.chapters, register],
  );
  const withChapterFile = (entry: LawRefEntry, code: string) =>
    entry.section !== undefined &&
    lookup.chapters.some((c) => c.lag === code && c.kapitel === entry.chapter);
  const otherGroups = register
    .map((group) => ({
      ...group,
      chapters: group.chapters
        .map((c) => ({
          ...c,
          entries: c.entries.filter(
            (e) => !withChapterFile(e, group.code) && (!caseOnly || e.caseIds.length > 0),
          ),
        }))
        .filter((c) => c.entries.length > 0),
    }))
    .filter((group) => group.chapters.length > 0);

  if (register.length === 0 && lookup.chapters.length === 0) {
    return (
      <EmptyState
        icon={<Scale />}
        title="Inga lagrum ännu"
        description="Registret fylls på när det finns frågor, ärenden och uppslag med lagrum."
      />
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="max-w-2xl text-[0.9375rem] text-muted">
          Alla lagrum som frågorna, ärendena, ordlistan och processkartorna hänvisar till. Sök på
          t.ex. <em>9 kap 60</em> i sökfältet ovan. Lagtexten finns på riksdagen.se och i{' '}
          <em>Lagtextens byggregler</em>.
        </p>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={caseOnly}
            onChange={(event) => setCaseOnly(event.target.checked)}
            className="size-4 accent-[var(--accent)]"
          />
          Bara lagrum i ärendena
        </label>
      </div>

      {chapters.map(({ chapter, sections }) => {
        const law = lookup.laws.find((l) => l.kod === chapter.lag);
        const visible = caseOnly
          ? sections.filter((s) => s.usage.some((u) => u.caseIds.length > 0))
          : sections;
        return (
          <ChapterBlock
            key={`${chapter.lag}-${chapter.kapitel}`}
            chapter={chapter}
            sections={visible}
            lawName={law?.namn ?? chapter.lag}
            lawUrl={law?.lank}
            moduleTitles={moduleTitles}
          />
        );
      })}

      <section aria-labelledby="ovriga-lagrum" className="flex flex-col gap-6">
        <div>
          <h3 id="ovriga-lagrum" className="text-xl">
            Övriga lagrum
          </h3>
          <p className="mt-1 text-sm text-muted">
            Lag, kapitel och var lagrummet används. Följ länken för att läsa lagtexten.
          </p>
        </div>
        {otherGroups.map((group) => (
          <section
            key={group.code}
            aria-labelledby={`lag-${group.code}`}
            className="flex flex-col gap-3"
          >
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-1">
              <h4 id={`lag-${group.code}`} className="font-semibold">
                {group.name}
              </h4>
              {group.url && (
                <ExternalLink href={group.url} className="text-sm">
                  {group.url.includes('riksdagen.se') ? 'Lagen på riksdagen.se' : 'Till källan'}
                </ExternalLink>
              )}
            </header>
            {group.chapters.map((chapter) => (
              <div key={chapter.chapter ?? 'utan-kapitel'} className="flex flex-col gap-2">
                {chapter.chapter !== undefined && (
                  <p className="text-sm text-muted">
                    {chapter.chapter} kap.{chapter.title ? ` ${chapter.title}` : ''}
                  </p>
                )}
                <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {chapter.entries.map((entry) => (
                    <li
                      key={entry.reference}
                      id={sectionElementId(entry.reference)}
                      tabIndex={-1}
                      className="flex scroll-mt-24 flex-col gap-1.5 rounded-md border border-line bg-paper px-3 py-2.5 outline-none transition-colors duration-500 focus-visible:border-accent data-[flash=true]:border-plan-yellow data-[flash=true]:bg-plan-yellow-soft"
                    >
                      <LawRefChip
                        reference={entry.reference}
                        uncertain={entry.uncertain}
                        className="self-start"
                      />
                      <span className="text-xs text-muted">{usageText([entry], moduleTitles)}</span>
                      {entry.termIds.length > 0 && (
                        <span className="flex flex-wrap gap-1 text-xs">
                          {entry.termIds.slice(0, 4).map((id) => (
                            <button
                              key={id}
                              type="button"
                              onClick={() => nav.open({ kind: 'term', id })}
                              className="text-accent underline-offset-2 hover:underline"
                            >
                              {lookup.glossary.find((t) => t.id === id)?.term ?? id}
                            </button>
                          ))}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))}
      </section>
    </div>
  );
}
