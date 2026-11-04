# 05 · Teknik och arkitektur

## Val i korthet

| Område | Val | Varför |
| --- | --- | --- |
| Desktop-skal | **Tauri 2** | Liten binär (~10 MB), inbyggd uppdaterare med signerade manifest, färdig GitHub Action som bygger för Windows och macOS och publicerar release. |
| UI | **React 19 + TypeScript + Vite** | Störst ekosystem, snabb utveckling, lätt att få hjälp av AI-verktyg. |
| Styling | **Tailwind CSS 4** + design tokens i CSS-variabler, Radix-primitiver | Snabbt, konsekvent, ljust/mörkt läge gratis. |
| Routing | **TanStack Router** | Typsäkra rutter, bra för en app med många vyer. |
| State | **Zustand** för UI-state, **TanStack Query** mot lokal databas | Enkelt, lite boilerplate. |
| Lokal lagring | **SQLite** via `@tauri-apps/plugin-sql`, migrationer i repo | Repetitionsdata och ärendehistorik kräver riktiga frågor, inte en JSON-fil. |
| Innehåll | YAML i `content/`, valideras med **zod**, kompileras till JSON vid bygge | Pappa och storebror kan skriva innehåll utan att röra kod. Fel upptäcks vid bygge. |
| Ritningar | SVG genererade från parametrar + statiska PDF/PNG | Lätt att variera ett ärende ("samma hus, 0,5 m högre"). |
| PDF-visning | `pdf.js` | Standard, fungerar offline. |
| Export | HTML → PDF via Tauri-webbvy (print) | Beslutsrapport till handledaren utan extra beroenden. |
| Tester | Vitest (logik, scheman), Playwright (några kritiska flöden) | Testa innehållsvalidering, repetitionsalgoritm och ärendemotor ordentligt. |
| Pakethantering | pnpm, monorepo med workspaces | Tydlig uppdelning app / innehåll / delade typer. |
| CI/CD | GitHub Actions + `tauri-apps/tauri-action` | Se 06. |

### Varför inte Electron?

Electron fungerar lika bra och `electron-updater` är beprövat. Tauri väljs för mindre nedladdning,
lägre minnesanvändning och att uppdateringsmanifestet signeras som standard. Om Tauri krånglar
på någon plattform är bytet till Electron en begränsad insats eftersom hela appen är webbkod.

### Varför inte bara en webbapp?

En webbapp på Vercel vore faktiskt ännu enklare för henne: en länk, inga uppdateringar alls.
Det går att göra senare, eftersom appen är ren webbkod. Desktop väljs nu för att den ska
fungera offline, kännas som ett "riktigt program" och inte kräva konto, inloggning eller
molnlagring av hennes studiedata. Beslutet kan omprövas efter fas 1.

## Övergripande arkitektur

```
┌──────────────────────────────────────────────────────────┐
│  Tauri-skal (Rust)                                        │
│   · fönster, meny, filsystem, SQLite, updater, process    │
│   · exponerar kommandon till webbvyn                      │
├──────────────────────────────────────────────────────────┤
│  Webbvy (React)                                           │
│   ┌────────────┐ ┌──────────────┐ ┌───────────────────┐   │
│   │ features/  │ │ engine/      │ │ content (bundlat) │   │
│   │ plugga     │ │ quiz         │ │ moduler.json      │   │
│   │ arenden    │ │ repetition   │ │ fragor/*.json     │   │
│   │ uppslag    │ │ arendemotor  │ │ arenden/*.json    │   │
│   │ resultat   │ │ bedomning    │ │ handlingar/*      │   │
│   └────────────┘ └──────────────┘ └───────────────────┘   │
│   ┌────────────────────────────────────────────────────┐  │
│   │ data/  (repository-lager mot SQLite)               │  │
│   └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
          │ (fas 3)
          ▼
   Claude API direkt från appen (nyckel som hon klistrar in en gång)
   Handledarportal (Supabase, valfritt)
```

## Mappstruktur

```
.
├── apps/
│   └── desktop/                # Tauri + React
│       ├── src/
│       │   ├── app/            # router, layout, providers
│       │   ├── features/       # en mapp per vy (hem, plugga, arenden, uppslag, resultat, installningar)
│       │   ├── engine/         # ren TypeScript utan React: quiz, repetition, ärendemotor, bedömning
│       │   ├── data/           # SQLite-migrationer och repositories
│       │   ├── components/     # delade UI-komponenter
│       │   └── styles/         # tokens.css, globals.css
│       └── src-tauri/          # Rust, tauri.conf.json, ikoner, capabilities
├── packages/
│   ├── content-schema/         # zod-scheman + TypeScript-typer för innehåll
│   └── content-build/          # skript: YAML → JSON, validering, generering av SVG-ritningar
├── content/                    # allt studieinnehåll (YAML, bilder, PDF)
├── docs/                       # dessa dokument
└── .github/workflows/          # ci.yml (test/lint), release.yml (bygg + publicera)
```

## Datamodell (lokal SQLite)

```sql
-- Vad hon har gjort
svar            (id, fraga_id, tidpunkt, ratt, svar_json, svarstid_ms, lage)
repetition      (fraga_id PK, stabilitet, svarighet, nasta_datum, antal, senast)   -- FSRS-fält
pass            (id, start, slut, lage, moduler_json, resultat_json)

-- Ärenden
arende_status   (arende_id PK, status, aktuellt_steg, sim_datum, startad, inlamnad)
arende_steg     (id, arende_id, steg_id, svar_json, poang, klar_tidpunkt)
arende_handelse (id, arende_id, handelse_id, utlost_tidpunkt, sim_datum)
beslut          (id, arende_id, beslut_json, inlamnad, export_tidpunkt)
handledar_svar  (id, beslut_id, text, betyg, tidpunkt)          -- fylls manuellt eller via portal

-- Övrigt
installning     (nyckel PK, varde)
```

Innehållet (frågor, ärenden) ligger *inte* i databasen utan bundlas med appen. Databasen
refererar till innehålls-id:n. Det gör att nytt innehåll kommer med varje release utan
migrering, och att hennes historik överlever även om en fråga ändras.

## Ärendemotorn

Ren TypeScript, oberoende av React, så att den kan testas hårt:

```ts
type Arende = { id, titel, niva, fastighet, startdatum, handlingar[], steg[], handelser[], facit }
type Tillstand = { aktuelltSteg, simDatum, synligaHandlingar[], utlostaHandelser[], svar{} }

function startaArende(arende): Tillstand
function besvaraSteg(arende, tillstand, stegId, svar): { tillstand, nyaHandelser[], feedback }
function utvarderaHandelser(arende, tillstand): Handelse[]      // vilka utlösare är uppfyllda?
function bedomBeslut(arende, beslut): Bedomning                 // strukturerade kontroller + punkter
```

Händelser är deklarativa i YAML (utlösare + effekt) och motorn är den enda som tolkar dem.
Nya typer av utlösare läggs till i motorn, inte i varje ärende.

## Repetitionsalgoritm

FSRS (via `ts-fsrs`) med standardparametrar. Varje besvarad fråga ger ett betyg
(igen/svårt/bra/lätt) härlett från rätt/fel och svarstid. Repetitionsläget hämtar frågor med
`nasta_datum <= idag`, prioriterat efter modul hon valt.

## Studiehjälp med AI (fas 3)

- **Nyckel**: storebror skapar en API-nyckel i Anthropic Console (eget workspace med
  månadstak) och ger den till henne. Hon klistrar in den en gång under Inställningar →
  Studiehjälp. Nyckeln sparas i Windows Credential Manager via Rust-sidan (`keyring`), aldrig
  i klartext på disk eller i databasen. Ingen egen server behövs.
- **Anrop**: från Rust-sidan (Tauri-kommando) eller `@tauri-apps/plugin-http`, inte från
  webbvyn direkt, så att nyckeln inte exponeras i JavaScript och CORS inte blir ett problem.
  Strömmande svar så att texten dyker upp medan den skrivs.
- **Modell**: `claude-opus-5-5` som standard (bäst resonemang kring juridik och motiveringar).
  Vid mycket användning kan enkla förklaringar gå på `claude-haiku-5-5`.
- **Vad den gör**: förklarar ett svar djupare, förhör i en modul, ger första återkoppling på
  ett beslutsutkast mot bedömningspunkterna, föreslår vad hon bör repetera.
- **Vad den inte gör**: hittar på lagrum. Systemprompten kräver att den anger lagrum, säger
  när den är osäker och hänvisar till handledaren vid bedömningsfrågor. Kontext (modulens
  lagrumssammanfattningar, ärendets facit) skickas med så att svaren förankras.
- **Kostnad**: med prompt caching av systemprompt och ärendekontext är det ören per fråga.
  Månadstaket sätts på nyckelns workspace i Anthropic Console. Appen visar ungefärlig
  förbrukning under Inställningar.

## Handledarportal (fas 3, valfri)

Om export av PDF känns för klumpigt: en liten webbsida (Vercel + Supabase) där appen laddar
upp inlämnade beslut och pappa läser och kommenterar. Appen hämtar hans svar. Kräver att hon
loggar in en gång (magisk länk via e-post). Beslutas efter att PDF-exporten testats i praktiken.

## Kodkvalitet

- TypeScript strict, ESLint, Prettier.
- Tester krävs för: innehållsvalidering, ärendemotor, repetition, bedömningslogik.
- Conventional commits, så att release notes kan genereras.
- `pnpm content:check` körs i CI och lokalt och måste vara grönt innan release.
