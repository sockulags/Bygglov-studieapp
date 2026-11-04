import { ChartLine, Download } from 'lucide-react';
import { EmptyState, PageHeader, SectionTitle } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const stats = [
  { label: 'Behärskning totalt', value: '–', hint: 'Snitt över alla moduler' },
  { label: 'Svaga taggar', value: '–', hint: 'Det du oftast missar' },
  { label: 'Ärenden', value: '0', hint: 'Inlämnade beslut' },
];

export function ResultsPage() {
  return (
    <>
      <PageHeader
        title="Mina resultat"
        description="Hur det går över tid: behärskning per modul, svaga taggar och dina inlämnade beslut."
        actions={
          <Button variant="secondary" disabled title="Aktiveras när du lämnat in ett beslut">
            <Download aria-hidden="true" />
            Exportera till handledare
          </Button>
        }
      />

      <section aria-label="Översikt" className="mb-10 grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-5">
              <p className="text-sm text-muted">{stat.label}</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums">{stat.value}</p>
              <p className="text-xs text-muted">{stat.hint}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section aria-labelledby="results-history">
        <SectionTitle>
          <span id="results-history">Historik</span>
        </SectionTitle>
        <EmptyState
          icon={<ChartLine />}
          title="Inget att visa ännu"
          description="När du gjort några pass ritas behärskningen över tid här, och handledarens återkoppling på dina beslut samlas nedanför."
        />
      </section>
    </>
  );
}
