import { FolderOpen } from 'lucide-react';
import { EmptyState, PageHeader, SectionTitle } from '@/components/layout/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Stamp } from '@/components/ui/stamp';

const levels = [
  { level: 1, title: 'Enkla ärenden', body: 'Komplett ansökan inom plan. Fokus på rutinen: registrera, granska, besluta.' },
  { level: 2, title: 'Kompletteringar och grannar', body: 'Saknade handlingar, grannehörande och liten avvikelse.' },
  { level: 3, title: 'Svåra avvägningar', body: 'Planstridigt utgångsläge, remisser, överraskningar under handläggningen.' },
  { level: 4, title: 'Tillsyn och överklagande', body: 'Olovligt byggande, förelägganden och vad som händer när beslutet överklagas.' },
];

export function CasesPage() {
  return (
    <>
      <PageHeader
        title="Ärenden"
        description="Realistiska bygglovsärenden med handlingar, diarium och beslut. Allt sparas automatiskt, så du kan stänga mitt i och fortsätta en annan dag."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section aria-labelledby="cases-levels" className="flex flex-col gap-6">
          <SectionTitle>
            <span id="cases-levels">Nivåer</span>
          </SectionTitle>
          {levels.map((item) => (
            <div key={item.level}>
              <div className="mb-2 flex items-baseline gap-3">
                <h3 className="font-semibold">
                  Nivå {item.level} · {item.title}
                </h3>
                <span className="text-sm text-muted">{item.body}</span>
              </div>
              <EmptyState
                icon={<FolderOpen />}
                title="Inga ärenden på den här nivån ännu"
                description="Ärendena skrivs tillsammans med handledaren och följer med nästa uppdatering."
              />
            </div>
          ))}
        </section>

        <aside aria-labelledby="cases-preview">
          <SectionTitle>
            <span id="cases-preview">Så ser en handling ut</span>
          </SectionTitle>
          <Card variant="document" className="relative overflow-hidden p-6">
            <div className="absolute top-4 right-4">
              <Stamp detail="2026-03-02" size="sm">
                Inkom
              </Stamp>
            </div>
            <CardContent className="prose-document p-0">
              <p className="text-xs text-muted uppercase tracking-[0.08em]">Ansökan om bygglov</p>
              <p className="mt-2 font-semibold">Tillbyggnad av enbostadshus</p>
              <p className="text-sm">Björken 7, Skogsvägen 12</p>
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
