import { Card, CardContent } from '@/components/ui/card';
import { MasteryRing } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader, SectionTitle } from '@/components/layout/page-header';
import { modules } from '@/features/study/modules';

const modes = [
  {
    id: 'quick',
    label: 'Snabbquiz',
    body: 'Tio slumpade frågor ur valda moduler. Resultat direkt.',
  },
  {
    id: 'walkthrough',
    label: 'Genomgång',
    body: 'Alla frågor i en modul i pedagogisk ordning, med förklaringar.',
  },
  {
    id: 'review',
    label: 'Repetition',
    body: 'Frågor som är på väg att glömmas, enligt repetitionsschemat.',
  },
  {
    id: 'open',
    label: 'Instudering',
    body: 'Öppna frågor där du formulerar svaret själv och jämför med facit.',
  },
  { id: 'exam', label: 'Tenta', body: 'Blandade frågor, tidsgräns, resultat först i slutet.' },
] as const;

export function StudyPage() {
  return (
    <>
      <PageHeader
        title="Plugga"
        description="Välj läge och modul. Efter varje svar får du en kort förklaring och lagrummet; det är förklaringen som är belöningen."
      />

      <section aria-labelledby="study-mode" className="mb-10">
        <SectionTitle>
          <span id="study-mode">Läge</span>
        </SectionTitle>
        <Tabs defaultValue="quick">
          <TabsList aria-label="Studieläge">
            {modes.map((mode) => (
              <TabsTrigger key={mode.id} value={mode.id}>
                {mode.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {modes.map((mode) => (
            <TabsContent key={mode.id} value={mode.id}>
              <p className="text-[0.9375rem] text-muted">{mode.body}</p>
            </TabsContent>
          ))}
        </Tabs>
      </section>

      <section aria-labelledby="study-modules">
        <SectionTitle>
          <span id="study-modules">Moduler</span>
        </SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {modules.map((module) => (
            <Card key={module.id} interactive>
              <CardContent className="flex items-start gap-4 p-5">
                <MasteryRing
                  value={0}
                  size={52}
                  label={`Behärskning ${module.title}: inte påbörjad`}
                >
                  <span className="text-muted">{module.number}</span>
                </MasteryRing>
                <div className="min-w-0">
                  <h3 className="text-[0.9375rem] font-semibold leading-snug">{module.title}</h3>
                  <p className="mt-1 text-sm text-muted">{module.summary}</p>
                  <p className="mt-2 text-xs text-muted">0 frågor ännu</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </>
  );
}
