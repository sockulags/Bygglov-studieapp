import { ExternalLink, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EmptyState, PageHeader } from '@/components/layout/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { LawRefChip } from '@/components/ui/law-ref-chip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { loadContent } from '@/content';
import { pluralQuestions } from '@/lib/format';
import { buildLawRegister, matchesQuery } from './law-register';

function ModulesTab() {
  const content = loadContent();
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-2xl text-[0.9375rem] text-muted">
        Modulernas centrala lagrum i korthet. Slå upp paragraferna i <em>Lagtextens byggregler</em>{' '}
        när du pluggar, så hittar du snabbt i boken på tentan.
      </p>
      <ul className="grid gap-4 md:grid-cols-2">
        {content.modules.map((module) => {
          const count = content.questionsByModule.get(module.id)?.length ?? 0;
          return (
            <li key={module.id}>
              <Card className="h-full">
                <CardContent className="flex h-full flex-col gap-3 p-5">
                  <div>
                    <p className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
                      Modul {module.ordning}
                      {count > 0 ? ` · ${pluralQuestions(count)}` : ''}
                    </p>
                    <h3 className="mt-1 font-semibold">{module.titel}</h3>
                  </div>
                  <p className="font-serif text-[0.9375rem] leading-relaxed">
                    {module.lagrum_sammanfattning}
                  </p>
                  {module.lagrum && module.lagrum.length > 0 && (
                    <div className="mt-auto flex flex-wrap gap-2 pt-1">
                      {module.lagrum.map((ref) => (
                        <LawRefChip
                          key={ref}
                          reference={ref}
                          uncertain={module.lagrum_osaker === true}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RegisterTab() {
  const content = loadContent();
  const groups = useMemo(() => buildLawRegister(content), [content]);
  const moduleTitles = new Map(content.modules.map((m) => [m.id, m.titel]));
  const [query, setQuery] = useState('');
  const filtered = groups
    .map((group) => ({
      ...group,
      entries: group.entries.filter((e) => matchesQuery(e.reference, query)),
    }))
    .filter((group) => group.entries.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="max-w-2xl text-[0.9375rem] text-muted">
          Alla paragrafer som frågorna hänvisar till, med antal frågor. Lagtexten finns på
          riksdagen.se och i <em>Lagtextens byggregler</em>.
        </p>
        <label className="relative w-full max-w-xs">
          <span className="sr-only">Sök lagrum</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Sök, t.ex. 9 kap 99"
            className="h-10 w-full rounded-md border border-line-strong bg-paper pr-3 pl-9 text-sm placeholder:text-muted focus-visible:border-accent"
          />
        </label>
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Search />}
          title={groups.length === 0 ? 'Inga lagrum ännu' : 'Inget lagrum matchar'}
          description={
            groups.length === 0
              ? 'Registret fylls på när det finns frågor med lagrum.'
              : 'Pröva med bara kapitel och paragraf, t.ex. "9 kap 4".'
          }
        />
      ) : (
        filtered.map((group) => (
          <section key={group.code} aria-labelledby={`law-${group.code}`}>
            <h3 id={`law-${group.code}`} className="mb-2 font-semibold">
              {group.name}
            </h3>
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {group.entries.map((entry) => (
                <li
                  key={entry.reference}
                  className="flex flex-col gap-1.5 rounded-md border border-line bg-paper px-3 py-2.5"
                >
                  <LawRefChip
                    reference={entry.reference}
                    uncertain={entry.uncertain}
                    className="self-start"
                  />
                  <span className="text-xs text-muted">
                    {pluralQuestions(entry.questionCount)} ·{' '}
                    {entry.moduleIds.map((id) => moduleTitles.get(id) ?? id).join(', ')}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      <p className="inline-flex items-center gap-1.5 text-sm text-muted">
        <ExternalLink className="size-4" aria-hidden="true" />
        Länkar till riksdagen.se och Boverket kommer i en senare version.
      </p>
    </div>
  );
}

export function LookupPage() {
  return (
    <>
      <PageHeader
        title="Uppslag"
        description="Lagrum, begrepp och processkartor på ett ställe. Allt du möter i frågor och ärenden ska gå att hitta här."
      />

      <Tabs defaultValue="modules">
        <TabsList aria-label="Uppslagsdel" className="flex-wrap">
          <TabsTrigger value="modules">Moduler</TabsTrigger>
          <TabsTrigger value="law">Lagrumsregister</TabsTrigger>
          <TabsTrigger value="glossary">Ordlista</TabsTrigger>
          <TabsTrigger value="maps">Processkartor</TabsTrigger>
        </TabsList>

        <TabsContent value="modules">
          <ModulesTab />
        </TabsContent>

        <TabsContent value="law">
          <RegisterTab />
        </TabsContent>

        <TabsContent value="glossary">
          <EmptyState
            icon={<Search />}
            title="Ordlistan kommer snart"
            description="Begrepp som byggnadsarea, nockhöjd, komplementbostadshus och laga kraft, med sök. Tills vidare förklaras begreppen i frågornas förklaringar."
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
