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
- [x] Secret på GitHub och första releasen `v0.1.0` publicerad 2026-11-04 med signerad installer och `latest.json`
  (workflows klara; signeringsnyckel, pubkey och secrets saknas, se `docs/release-checklista.md`)
- [ ] `docs/installera.md` med skärmbilder (Windows, SmartScreen)
  (texten klar; skärmbilderna tas vid första installationen)

**Klart när**: hon installerat v0.1.0 och fått v0.1.1 via uppdateringsdialogen utan hjälp.

## Fas 2 · Ärendesimulatorn (v0.2–v0.4)

- [x] Ärendemotor med steg, händelser, utlösare, simulerad tid och tidsfristen i 9 kap. 99 §
  med avgiftsreduktion (ren TypeScript, `engine/cases`, med tester för alla vägar i A002)
- [x] Ärendevyn med diarium, handlingsvisare (Markdown som A4-papper, SVG/PNG med zoom),
  arbetsyta, anteckningar och staplade flikar i smalt fönster
- [x] Stegtyper: checklista, fråga, beräkning, urval, skrivelse, beslut
- [x] Beslutsmallen med strukturerade kontroller och levande förhandsvisning
- [x] Jämförelsevy mot modellbeslut och bedömningspunkter, med egna reflektioner
- [x] Export av beslutsrapport till handledaren (PDF via utskrift, HTML-fil, text) och
  registrering av handledarens bedömning (ärendet blir "Bedömt")
- [x] Tre ärenden, ett per nivå 1–3: A001 komplementbyggnad nära gräns, A002 tillbyggnad med
  liten avvikelse, A003 nybyggnad utanför plan vid strand (status utkast)
- [ ] Ärendena granskade tillsammans med pappa (status `granskad`)
- [x] SVG-ritningsgenerator: situationsplan (även nybyggnad, utfart, strandlinje och
  strandskyddsgräns), fasader, planritning med sektion och plankarta
- [x] Hem föreslår ärendet att fortsätta eller nästa ärende, Mina resultat visar ärenden per
  status, inlämnade beslut och handledarens bedömningar, Uppslag tar med ärendenas lagrum
- [x] Repetition (FSRS) och läget Instudering med öppna frågor (kom redan i fas 1)

Kvar i fas 2:

- [x] Knapp för att förlänga tidsfristen med skäl (9 kap. 99 § andra stycket, 100 § 3)
- [x] Vilande enligt 9 kap. 102 § i motorn: stegeffekten `vilande` och händelseeffekten
  `vilande_upphor`; fristen står still medan ärendet vilar (A003)
- [x] Fältet `godtagbara_utfall` på beslutssteg (frivilligt lov i A001 räknas inte som missat)
- [x] Fältet `ar_forelaggande` på skrivelsesteg i stället för att motorn letar efter ordet
  "förelägg"
- [x] Mallvariabler i texterna (`{{beslutsdatum}}`, `{{kungorelsedatum+19|vardag}}` …) så att
  datum följer hennes egen tidslinje
- [ ] PDF-handlingar med pdf.js (i dag visas en PDF med webbläsarens visare)
- [ ] Fler ärenden per nivå

**Klart när**: pappa bedömt hennes första exporterade beslut och sagt att case-flödet känns rimligt.

## Fas 3 · Studiehjälp och handledare (v0.5–v0.7)

- [x] Inställning för API-nyckel (sparas i Windows Credential Manager via `keyring`), anrop
  från Rust-sidan med strömmande svar, prompt caching av rättslägesavsnittet,
  förbrukningsvisning i kronor och dagligt kostnadstak
- [x] "Fråga handledaren" i förklaringen efter varje svar, i ärendets arbetsyta och på Hem;
  första återkoppling på beslutet i jämförelsevyn (facit först efter inlämnat beslut)
- [x] Tentaläge (kom redan i fas 1)
- [x] Uppslag: lagrumsregister med 9 kap. paragraf för paragraf och lagtext, ordlista
  (140 begrepp), fyra processkartor, sök med `/`
- [x] Mina resultat med behärskning över tid, svar per dag, svaga taggar, ärenden per status
  och kontroller per beslut, med tabellvy
- [x] Tillgänglighetsgenomgång av ärendevyn, uppslag, resultat och handledarpanelen med axe
  (WCAG 2.1 AA, ljust och mörkt läge); `--muted` mörkare i hela appen
- [ ] Studiehjälpen provad med en riktig nyckel i Windows-bygget (nyckellagret, strömningen
  och kostnadsraden kan bara provas där)
- [ ] Uppslaget och ordlistan granskade med pappa (allt är `utkast`)
- [ ] Avbryt som stoppar anropet på Rust-sidan (i dag slutar bara panelen visa svaret; svaret
  körs klart och räknas i förbrukningen)
- [ ] Handledaren föreslår repetition utifrån svaga taggar (i dag ser den bara behärskning per
  modul)
- [ ] Valfritt: handledarportal (Supabase) där pappa kommenterar direkt

**Klart när**: hon har använt handledaren i ett riktigt pass och pappa har läst en första
återkoppling på ett beslut och tyckt att den hjälper.

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
