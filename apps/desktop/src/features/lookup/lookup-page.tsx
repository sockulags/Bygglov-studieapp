import { Search } from 'lucide-react';
import { EmptyState, PageHeader } from '@/components/layout/page-header';
import { LawRefChip } from '@/components/ui/law-ref-chip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const exampleRefs = ['PBL 9 kap. 2 §', 'PBL 9 kap. 4 a §', 'PBF 6 kap. 5 §', 'FL 25 §'];

export function LookupPage() {
  return (
    <>
      <PageHeader
        title="Uppslag"
        description="Lagrum, begrepp och processkartor på ett ställe. Allt du möter i frågor och ärenden länkar hit."
      />

      <Tabs defaultValue="law">
        <TabsList aria-label="Uppslagsdel">
          <TabsTrigger value="law">Lagrum</TabsTrigger>
          <TabsTrigger value="glossary">Ordlista</TabsTrigger>
          <TabsTrigger value="maps">Processkartor</TabsTrigger>
        </TabsList>

        <TabsContent value="law" className="flex flex-col gap-6">
          <p className="max-w-2xl text-[0.9375rem] text-muted">
            Register över PBL, PBF, förvaltningslagen och BBR-kapitel med korta egna sammanfattningar
            och länk till riksdagen.se och Boverket. Lagrum visas som chips i hela appen:
          </p>
          <div className="flex flex-wrap gap-2">
            {exampleRefs.map((ref) => (
              <LawRefChip key={ref} reference={ref} />
            ))}
          </div>
          <EmptyState icon={<Search />} title="Registret är inte ifyllt ännu" description="Lagrumssammanfattningarna skrivs i takt med modulerna." />
        </TabsContent>

        <TabsContent value="glossary">
          <EmptyState
            icon={<Search />}
            title="Ordlistan kommer snart"
            description="Begrepp som byggnadsarea, nockhöjd, laga kraft och prickmark, med sök."
          />
        </TabsContent>

        <TabsContent value="maps">
          <EmptyState
            icon={<Search />}
            title="Processkartorna kommer snart"
            description="Bygglov, anmälan, tillsyn och överklagande som klickbara diagram."
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
