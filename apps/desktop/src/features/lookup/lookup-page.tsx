import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { LawRefChip } from '@/components/ui/law-ref-chip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { loadContent, loadLookup, type StudyContent } from '@/content';
import { pluralQuestions } from '@/lib/format';
import { GlossaryTab } from './glossary-tab';
import { buildLawRegister, sectionForReference } from './law-register';
import { LawTab } from './law-tab';
import {
  LookupNavContext,
  revealElement,
  sectionElementId,
  termElementId,
  type LookupNav,
} from './lookup-nav';
import { LookupSearch } from './lookup-search';
import { ProcessTab, type ProcessSelection } from './process-tab';
import { buildSearchIndex, type LookupTarget } from './search';

type LookupTabId = 'law' | 'glossary' | 'maps' | 'modules';

const TAB_IDS: readonly LookupTabId[] = ['law', 'glossary', 'maps', 'modules'];

function ModulesTab({ content }: { content: StudyContent }) {
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

export function LookupPage() {
  const content = loadContent();
  const lookup = loadLookup();
  const register = useMemo(() => buildLawRegister({ ...content, lookup }), [content, lookup]);
  const searchIndex = useMemo(() => buildSearchIndex(lookup, register), [lookup, register]);
  const [tab, setTab] = useState<LookupTabId>('law');
  const [processSelection, setProcessSelection] = useState<ProcessSelection | undefined>();

  const nav: LookupNav = useMemo(
    () => ({
      open: (target: LookupTarget) => {
        if (target.kind === 'process') {
          setTab('maps');
          setProcessSelection({
            processId: target.processId,
            ...(target.stepId ? { stepId: target.stepId } : {}),
          });
          return;
        }
        // Leaving the process maps: close an open step box but keep the chosen process.
        setProcessSelection((current) => current && { processId: current.processId });
        if (target.kind === 'term') {
          setTab('glossary');
          revealElement(termElementId(target.id));
        } else if (target.kind === 'section') {
          setTab('law');
          revealElement(sectionElementId(target.key));
        } else {
          setTab('law');
          const section = sectionForReference(target.reference, lookup.chapters);
          revealElement(sectionElementId(section ? section.key : target.reference));
        }
      },
    }),
    [lookup.chapters],
  );

  return (
    <LookupNavContext.Provider value={nav}>
      <PageHeader
        title="Uppslag"
        description="Lagrum, begrepp och processkartor på ett ställe. Allt du möter i frågor och ärenden ska gå att hitta här."
      />

      <LookupSearch index={searchIndex} onOpen={nav.open} className="mb-6" />

      <Tabs
        value={tab}
        onValueChange={(value) => {
          if ((TAB_IDS as readonly string[]).includes(value)) setTab(value as LookupTabId);
        }}
      >
        <TabsList aria-label="Uppslagsdel" className="flex-wrap">
          <TabsTrigger value="law">Lagrumsregister</TabsTrigger>
          <TabsTrigger value="glossary">Ordlista</TabsTrigger>
          <TabsTrigger value="maps">Processkartor</TabsTrigger>
          <TabsTrigger value="modules">Moduler</TabsTrigger>
        </TabsList>

        <TabsContent value="law">
          <LawTab lookup={lookup} register={register} modules={content.modules} />
        </TabsContent>

        <TabsContent value="glossary">
          <GlossaryTab lookup={lookup} modules={content.modules} />
        </TabsContent>

        <TabsContent value="maps">
          <ProcessTab
            lookup={lookup}
            modules={content.modules}
            selection={processSelection}
            onSelect={setProcessSelection}
          />
        </TabsContent>

        <TabsContent value="modules">
          <ModulesTab content={content} />
        </TabsContent>
      </Tabs>
    </LookupNavContext.Provider>
  );
}
