/**
 * Module list for the skeleton UI (docs/02 → Ämnesområden). Replaced by the bundled
 * content (moduler.yaml → JSON) once the content track lands; keep ids stable.
 */
export interface ModuleSummary {
  id: string;
  number: number;
  title: string;
  summary: string;
}

export const modules: ModuleSummary[] = [
  { id: '01-forvaltningsratt', number: 1, title: 'Förvaltningsrätt och myndighetsrollen', summary: 'Serviceskyldighet, kommunicering, jäv, motivering.' },
  { id: '02-pbl-systemet', number: 2, title: 'PBL-systemet och begreppen', summary: 'Lagens uppbyggnad, planer, allmänna och enskilda intressen.' },
  { id: '03-lovplikt', number: 3, title: 'Lovplikt och anmälningsplikt', summary: 'Vad kräver lov eller anmälan, undantag, Attefall.' },
  { id: '04-detaljplan', number: 4, title: 'Detaljplan och planenlighet', summary: 'Plankarta, byggrätt, prickmark, liten avvikelse.' },
  { id: '05-utanfor-plan', number: 5, title: 'Prövning utanför detaljplan', summary: 'Lokaliseringsprövning, förhandsbesked.' },
  { id: '06-handlaggning', number: 6, title: 'Handläggningsprocessen', summary: 'Komplettering, tidsfrister, grannehörande, laga kraft.' },
  { id: '07-krav', number: 7, title: 'Krav på byggnadsverk', summary: 'Utformning, tekniska egenskaper, tillgänglighet, varsamhet.' },
  { id: '08-ritningar', number: 8, title: 'Ritningsläsning och beräkning', summary: 'Situationsplan, areor, höjder, avstånd.' },
  { id: '09-genomforande', number: 9, title: 'Genomförandet', summary: 'Tekniskt samråd, kontrollplan, start- och slutbesked.' },
  { id: '10-tillsyn', number: 10, title: 'Tillsyn och sanktioner', summary: 'Olovligt byggande, förelägganden, sanktionsavgift.' },
  { id: '11-angransande', number: 11, title: 'Angränsande lagstiftning', summary: 'Strandskydd, kulturmiljö, miljöbalken.' },
  { id: '12-overklagande', number: 12, title: 'Överklagande och prövningskedjan', summary: 'Vem får överklaga, tidsfrister, instanser.' },
  { id: '13-kommunikation', number: 13, title: 'Kommunikation och bemötande', summary: 'Begripliga beslut, svåra samtal, klarspråk.' },
];
