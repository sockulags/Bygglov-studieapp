import { tagLabel } from '@/features/progress/progress';

/**
 * Display names for the question tags. Tags in content/ are ASCII slugs
 * ("handlaggningstid"), so the charts and tables spell them out in Swedish. A tag missing
 * here falls back to the slug with spaces.
 */
const TAG_NAMES: Readonly<Record<string, string>> = {
  allman_plats: 'allmän plats',
  andrad_ansokan: 'ändrad ansökan',
  andrad_anvandning: 'ändrad användning',
  angransande_lagstiftning: 'angränsande lagstiftning',
  anlaggningar: 'anläggningar',
  anmalan: 'anmälan',
  ansokan: 'ansökan',
  aterstallande: 'återställande',
  barande_konstruktion: 'bärande konstruktion',
  bemotande: 'bemötande',
  berakning: 'beräkning',
  beslutets_innehall: 'beslutets innehåll',
  byggherrens_ansvar: 'byggherrens ansvar',
  diarieforing: 'diarieföring',
  en_och_tvabostadshus: 'en- och tvåbostadshus',
  fasadandring: 'fasadändring',
  fore_och_nu: 'före och nu',
  forelaggande: 'föreläggande',
  forlangning: 'förlängning',
  forvaltningsratt: 'förvaltningsrätt',
  fullstandighet: 'fullständighet',
  grans: 'gräns',
  handlaggningstid: 'handläggningstid',
  jarnvag: 'järnväg',
  jav: 'jäv',
  kulturvarden: 'kulturvärden',
  kungorelse: 'kungörelse',
  lov_galler: 'lov gäller',
  matt: 'mått',
  nockhojd: 'nockhöjd',
  overgangsregler: 'övergångsregler',
  overklagande: 'överklagande',
  overklagandehanvisning: 'överklagandehänvisning',
  pbf: 'PBF',
  rattelse: 'rättelse',
  sakagare: 'sakägare',
  sammanhallen_bebyggelse: 'sammanhållen bebyggelse',
  totalforsvar: 'totalförsvar',
  underrattelse: 'underrättelse',
  utanfor_plan: 'utanför plan',
  utokad_lovplikt: 'utökad lovplikt',
  va: 'VA',
  varmepump: 'värmepump',
};

export function tagName(tag: string): string {
  return TAG_NAMES[tag] ?? tagLabel(tag);
}
