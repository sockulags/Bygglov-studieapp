/**
 * Parser for a chapter of law text as saved from riksdagen.se in `docs/rattslage/`
 * (e.g. `pbl-9-kap.txt`). It turns the text into sections with heading, wording in force,
 * a coming wording and the amending act, so `content/uppslag/pbl-9-kap.yaml` can carry the
 * text and `content:check` can tell when the YAML and the source have drifted apart.
 */

export interface ParsedLawSection {
  paragraf: string;
  rubrik?: string;
  /** Wording in force, one paragraph or list item per line. */
  lagtext?: string;
  andrad_genom?: string;
  upphavd?: string;
  /** ISO date when a temporary section stops applying. */
  upphor?: string;
  kommande?: { fran: string; lagtext: string; andrad_genom?: string };
}

const SECTION_START = /^(\d+(?: [a-z])?) §\s*$/;
const AMENDMENT = /^(Lag|Förordning) \(\d{4}:\d+\)\.?\s*$/;
const ENDS_SENTENCE = /[.:]$/;

interface RawVersion {
  paragraf: string;
  rubrik?: string;
  marker: string;
  lines: string[];
  andrad_genom?: string;
}

/** Collapses the source's double spaces and trims. */
function clean(line: string): string {
  return line.replace(/\s+/g, ' ').replace(/ \)/g, ')').trim();
}

/**
 * Joins the raw lines of one section into paragraphs and list items. In the source, a new
 * paragraph or list item is indented; unindented lines continue the previous line, except
 * an unindented line that starts with a capital letter after a full stop (a new paragraph).
 */
function joinLines(raw: string[]): string[] {
  const out: string[] = [];
  for (const line of raw) {
    const text = clean(line);
    if (text === '') continue;
    const indented = /^\s/.test(line);
    const previous = out[out.length - 1];
    const startsNew =
      previous === undefined ||
      indented ||
      (/^[A-ZÅÄÖ]/.test(text) && ENDS_SENTENCE.test(previous));
    if (startsNew) {
      out.push(text);
      continue;
    }
    // A word split over two lines ("kontroll-" + "ansvarig") is joined without the hyphen,
    // but a real hyphen before "och"/"eller" ("brutto- eller") keeps its space.
    if (/[a-zåäö]-$/.test(previous) && /^[a-zåäö]/.test(text) && !/^(och|eller)\b/.test(text)) {
      out[out.length - 1] = previous.slice(0, -1) + text;
    } else {
      out[out.length - 1] = `${previous} ${text}`;
    }
  }
  return out;
}

/** Parses the whole chapter text. Sections keep the order of the source. */
export function parseLawChapterText(source: string): ParsedLawSection[] {
  const lines = source.split(/\r?\n/);
  const versions: RawVersion[] = [];
  let heading: string | undefined;
  let pendingHeading: string[] = [];
  let current: RawVersion | undefined;
  let started = false;
  let markerOpen = false;

  for (const line of lines) {
    const text = clean(line);
    const start = SECTION_START.exec(text);
    if (start?.[1]) {
      if (pendingHeading.length > 0) heading = pendingHeading.join(' ');
      pendingHeading = [];
      current = { paragraf: start[1], rubrik: heading, marker: '', lines: [] };
      versions.push(current);
      started = true;
      markerOpen = false;
      continue;
    }
    if (!started) continue;
    if (text === '.') {
      current = undefined;
      continue;
    }
    if (!current) {
      // Between sections: a heading for the next group (ignore the chapter title).
      if (text !== '' && !/^\d+ kap\. /.test(text)) pendingHeading.push(text);
      continue;
    }
    // Version markers: "/Upphör att gälla U:2027-01-01/", possibly spread over lines.
    if (current.lines.length === 0 && (markerOpen || text.startsWith('/'))) {
      current.marker = clean(`${current.marker} ${text}`);
      markerOpen = !text.endsWith('/');
      continue;
    }
    if (AMENDMENT.test(text)) {
      current.andrad_genom = text.replace(/\.$/, '');
      continue;
    }
    current.lines.push(line);
  }

  const sections = new Map<string, ParsedLawSection>();
  const order: string[] = [];
  for (const version of versions) {
    const body = joinLines(version.lines);
    const repealed = body.length > 0 && body.join(' ').startsWith('Har upphävts genom');
    const comingFrom = /Träder i kraft I:(\d{4}-\d{2}-\d{2})/.exec(version.marker)?.[1];
    const endsOn = /Upphör att gälla U:(\d{4}-\d{2}-\d{2})/.exec(version.marker)?.[1];
    let section = sections.get(version.paragraf);
    if (!section) {
      section = {
        paragraf: version.paragraf,
        ...(version.rubrik ? { rubrik: version.rubrik } : {}),
      };
      sections.set(version.paragraf, section);
      order.push(version.paragraf);
    }
    if (comingFrom) {
      section.kommande = {
        fran: comingFrom,
        lagtext: body.join('\n'),
        ...(version.andrad_genom ? { andrad_genom: version.andrad_genom } : {}),
      };
      continue;
    }
    if (repealed) {
      section.upphavd = body.join(' ');
      continue;
    }
    section.lagtext = body.join('\n');
    if (version.andrad_genom) section.andrad_genom = version.andrad_genom;
    // A temporary section ("Upphör att gälla U:2036-07-01 genom lag …") ends on a date; a
    // section replaced by a coming wording keeps applying until then (see `kommande`).
    if (endsOn && /genom/.test(version.marker)) section.upphor = endsOn;
  }
  return order.map((paragraf) => sections.get(paragraf) as ParsedLawSection);
}

/** Normalises law text for comparison (whitespace only). */
export function normalizeLawText(text: string | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}
