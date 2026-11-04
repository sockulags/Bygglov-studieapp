# 07 · Roadmap, faser och arbetsflöde

## Grundregel

**Auto-uppdateringen ska finnas i den allra första versionen hon installerar.** Allt annat kan
komma senare. Första installationen är det enda tillfället vi behöver hennes (eller pappas)
händer. Därför är fas 1 liten i funktioner men komplett i leveranskedja.

## Fas 0 · Planering (nu)

- [x] Vision, innehållsplan, simulator-design, design, teknik, release-plan (dessa dokument)
- [ ] Pappa får 02 och 03 upplästa/förklarade och justerar modullistan och ärendeidéerna
- [x] OS: **Windows**. Bygg bara Windows, ingen kodsignering, installationsguide med skärmbilder
- [x] Repo: **publikt**. Uppdateringslänken pekar direkt på GitHub Releases
- [x] AI: hon får en **API-nyckel av storebror** och klistrar in den i appen. Ingen proxy
- [x] Innehåll: **pappa bidrar muntligt**. Storebror/AI strukturerar till YAML, pappa granskar facit
- [ ] Namn på appen (arbetsnamn "Bygglov-studieapp"; något kortare vore trevligt)

## Fas 1 · Skelett som uppdaterar sig själv (v0.1)

Mål: hon har appen installerad och den uppdaterar sig. Innehållet är tunt men riktigt.

- [x] Monorepo, Tauri 2 + React + Vite + Tailwind, design tokens, ljust/mörkt läge
- [x] Navigation och alla huvudvyer som skal (Hem, Plugga, Ärenden, Uppslag, Resultat, Inställningar)
- [x] Innehållsschema (zod) + byggskript YAML → JSON + `content:check`
- [x] Quizmotor: flerval, flersvar, sant/falskt, lucktext; snabbquiz och modulgenomgång
  (dessutom para ihop, ordning, beräkning, öppna frågor, repetition, instudering och tentaläge)
- [x] Modul 3 (Lovplikt) och modul 6 (Handläggningsprocessen) med ca 40 frågor vardera
  (51 + 47, status utkast; granskning med handledaren återstår)
- [x] SQLite med migrationer; svar och pass sparas
- [x] Updater + UpdateBanner + "Vad är nytt"
- [x] `ci.yml`, `release.yml` och `build-check.yml`; signeringsnyckel skapad och pubkey inlagd
- [x] Windows-bygget verifierat i GitHub Actions 2026-11-04 (installer 4 MB som artefakt)
- [ ] Secret `TAURI_SIGNING_PRIVATE_KEY` på GitHub, sedan första taggade releasen `v0.1.0`
  (workflows klara; signeringsnyckel, pubkey och secrets saknas, se `docs/release-checklista.md`)
- [ ] `docs/installera.md` med skärmbilder (Windows, SmartScreen)
  (texten klar; skärmbilderna tas vid första installationen)

**Klart när**: hon installerat v0.1.0 och fått v0.1.1 via uppdateringsdialogen utan hjälp.

## Fas 2 · Ärendesimulatorn (v0.2–v0.4)

- Ärendemotor med steg, händelser, utlösare, simulerad tid
- Ärendevyn med diarium, handlingsvisare (PDF/PNG/SVG), arbetsyta
- Stegtyper: checklista, fråga, beräkning, urval, skrivelse, beslut
- Beslutsmallen med strukturerade kontroller
- Jämförelsevy mot modellbeslut och bedömningspunkter
- Export av beslutsrapport (PDF) till handledaren
- Tre ärenden: ett per nivå 1–3, skrivna tillsammans med pappa
- SVG-ritningsgenerator för enkla situationsplaner och fasader
- Repetition (FSRS) och läget Instudering med öppna frågor

**Klart när**: pappa bedömt hennes första exporterade beslut och sagt att case-flödet känns rimligt.

## Fas 3 · Studiehjälp och handledare (v0.5–v0.7)

- Inställning för API-nyckel (sparas i Windows Credential Manager), anrop från Rust-sidan,
  prompt caching, förbrukningsvisning
- "Fråga handledaren" i frågevyn och ärendevyn; första återkoppling på beslutsutkast
- Tentaläge
- Uppslag: lagrumsregister, ordlista, processkartor
- Mina resultat med mastery över tid och svaga taggar
- Valfritt: handledarportal (Supabase) där pappa kommenterar direkt

## Fas 4 · Bredd och finish (v0.8 → 1.0)

- 15+ ärenden inklusive tillsyn (nivå 4) och överklagandeflöde
- 600+ frågor över alla 13 moduler
- Mätverktyg i ritningsvisaren
- Kommandopalett, tangentbordsgenvägar överallt
- Tillgänglighetsgenomgång
- 1.0 när pappa säger att ett case känns "på riktigt"

## Beslut som tagits

| Fråga | Beslut | Konsekvens |
| --- | --- | --- |
| Windows eller Mac? | Windows | Bara Windows-bygge i CI, ingen kodsignering, SmartScreen-guide |
| Publikt repo? | Ja | Uppdateringslänk direkt mot `releases/latest/download/latest.json` |
| Hur får appen AI-tillgång? | Hon får en API-nyckel av storebror | Nyckel klistras in i Inställningar, sparas i Credential Manager, ingen server |
| Hur bidrar pappa med innehåll? | Muntligt | Inga innehållsverktyg för honom; storebror/AI skriver YAML, han granskar |

## Kvarvarande öppna frågor

| Fråga | Varför det spelar roll | Förslag om inget svar |
| --- | --- | --- |
| Vilken utbildning/skola går hon? | Vi kan matcha modulerna mot deras faktiska kursplan | Utgå från listan i 02 |
| Namn på appen? | Visas i installern, startmenyn och fönstertiteln | "Bygglov-studieapp" tills vidare |

## Förslag på arbetsflöde för fas 1

Fas 1 passar bra att köra som ett parallellt arbetsflöde med flera agenter, eftersom delarna
är oberoende tills de ska sättas ihop:

| Spår | Leverans | Beroenden |
| --- | --- | --- |
| A. Skal | Monorepo, Tauri+React+Vite+Tailwind, tokens, layout, navigation, alla vyer som tomma skal | inga |
| B. Innehållsschema | `packages/content-schema`, `packages/content-build`, `content:check`, exempelinnehåll flyttat in | inga |
| C. Quizmotor | `engine/quiz` + `engine/repetition` med tester, ren TS | B (typerna) |
| D. Data | SQLite-migrationer, repositories, Tauri-capabilities | A |
| E. Release | `ci.yml`, `release.yml` (Windows), updater-konfiguration, signeringsnycklar som placeholders, installationsguide | A |
| F. Innehåll | Modul 3 och 6, ca 80 frågor med förklaringar och lagrum | B |

Efter spåren: ett integrationssteg som kopplar quizvyn till motorn och databasen, kör
`content:check`, tester och ett Vite-bygge, och lämnar repot redo för första taggen.

Spåren A, B, E och F kan startas direkt. C och D följer efter B respektive A.
