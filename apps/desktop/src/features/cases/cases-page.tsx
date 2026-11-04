import { FolderOpen, MapPin } from 'lucide-react';
import { EmptyState, PageHeader, SectionTitle } from '@/components/layout/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Stamp } from '@/components/ui/stamp';
import { loadContent } from '@/content';

const levels = [
  {
    level: 1,
    title: 'Enkla ärenden',
    body: 'Komplett ansökan inom plan. Fokus på rutinen: registrera, granska, besluta.',
  },
  {
    level: 2,
    title: 'Kompletteringar och grannar',
    body: 'Saknade handlingar, grannehörande och liten avvikelse.',
  },
  {
    level: 3,
    title: 'Svåra avvägningar',
    body: 'Planstridigt utgångsläge, remisser, överraskningar under handläggningen.',
  },
  {
    level: 4,
    title: 'Tillsyn och överklagande',
    body: 'Olovligt byggande, förelägganden och vad som händer när beslutet överklagas.',
  },
] as const;

export function CasesPage() {
  const { cases } = loadContent();
  const firstCase = cases[0];

  return (
    <>
      <PageHeader
        title="Ärenden"
        description="Realistiska bygglovsärenden med handlingar, diarium och beslut. Ärendevyn kommer i nästa version; här ser du vilka ärenden som är på väg."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section aria-labelledby="cases-levels" className="flex flex-col gap-8">
          <SectionTitle className="mb-0">
            <span id="cases-levels">Nivåer</span>
          </SectionTitle>
          {levels.map((item) => {
            const inLevel = cases.filter((c) => c.niva === item.level);
            return (
              <div key={item.level}>
                <div className="mb-3">
                  <h3 className="font-semibold">
                    Nivå {item.level} · {item.title}
                  </h3>
                  <p className="text-sm text-muted">{item.body}</p>
                </div>
                {inLevel.length === 0 ? (
                  <EmptyState
                    className="py-8"
                    icon={<FolderOpen />}
                    title="Inga ärenden på den här nivån ännu"
                    description="Ärendena skrivs tillsammans med handledaren och följer med en kommande uppdatering."
                  />
                ) : (
                  <ul className="flex flex-col gap-3">
                    {inLevel.map((c) => (
                      <li key={c.id}>
                        <Card>
                          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
                                {c.id} · Nivå {c.niva}
                              </p>
                              <h4 className="mt-1 text-lg font-semibold">
                                {c.titel}, {c.fastighet.split(',')[0]}
                              </h4>
                              <p className="mt-0.5 inline-flex items-center gap-1 text-sm text-muted">
                                <MapPin className="size-3.5" aria-hidden="true" />
                                {c.fastighet}
                              </p>
                              <p className="mt-2 max-w-prose text-[0.9375rem]">
                                {c.sammanfattning}
                              </p>
                            </div>
                            <span className="inline-flex shrink-0 items-center rounded-full border border-line-strong bg-bg px-3 py-1 text-xs font-medium text-muted">
                              Kommer i nästa version
                            </span>
                          </CardContent>
                        </Card>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </section>

        <aside aria-labelledby="cases-preview">
          <SectionTitle>
            <span id="cases-preview">Så ser en handling ut</span>
          </SectionTitle>
          <Card variant="document" className="overflow-hidden p-6">
            <CardContent className="prose-document p-0">
              <div className="flex items-start justify-between gap-3">
                <p className="pt-1 text-xs tracking-[0.08em] text-muted uppercase">
                  {firstCase?.handlingar[0]?.titel ?? 'Ansökan om bygglov'}
                </p>
                <Stamp
                  detail={firstCase?.startdatum ?? '2026-03-02'}
                  size="sm"
                  className="shrink-0"
                >
                  Inkom
                </Stamp>
              </div>
              <p className="mt-3 font-semibold">
                {firstCase?.titel ?? 'Tillbyggnad av enbostadshus'}
              </p>
              <p className="text-sm">{firstCase?.fastighet ?? 'Björken 7'}</p>
              <p className="mt-4 text-sm text-muted">
                Handlingar renderas som A4-kort med ankomststämpel. Nya handlingar i diariet får en
                tegelfärgad markör.
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}
