# 07 · Roadmap, faser och arbetsflöde

## Grundregel

**Auto-uppdateringen ska finnas i den allra första versionen studenten installerar.** Allt annat kan
komma senare. Första installationen är det enda tillfället vi behöver studentens (eller handledarens)
händer. Därför är fas 1 liten i funktioner men komplett i leveranskedja.

## Fas 0 · Planering (nu)

- [x] Vision, innehållsplan, simulator-design, design, teknik, release-plan (dessa dokument)
- [ ] Handledaren får 02 och 03 upplästa/förklarade och justerar modullistan och ärendeidéerna
- [x] OS: **Windows**. Bygg bara Windows, ingen kodsignering, installationsguide med skärmbilder
- [x] Repo: **publikt**. Uppdateringslänken pekar direkt på GitHub Releases
- [x] AI: studenten får en **API-nyckel av utvecklaren** och klistrar in den i appen. Ingen proxy
- [x] Innehåll: **handledaren bidrar muntligt**. Utvecklaren/AI strukturerar till YAML, handledaren granskar facit
- [ ] Namn på appen (arbetsnamn "Bygglov-studieapp"; något kortare vore trevligt)

## Fas 1 · Skelett som uppdaterar sig själv (v0.1)

Mål: studenten har appen installerad och den uppdaterar sig. Innehållet är tunt men riktigt.

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

**Klart när**: studenten installerat v0.1.0 och fått v0.1.1 via uppdateringsdialogen utan hjälp.

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
- [ ] Ärendena granskade tillsammans med handledaren (status `granskad`)
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
  datum följer studentens egen tidslinje
- [ ] PDF-handlingar med pdf.js (i dag visas en PDF med webbläsarens visare)
- [ ] Fler ärenden per nivå

**Klart när**: handledaren bedömt studentens första exporterade beslut och sagt att case-flödet känns rimligt.

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
- [ ] Uppslaget och ordlistan granskade med handledaren (allt är `utkast`)
- [ ] Avbryt som stoppar anropet på Rust-sidan (i dag slutar bara panelen visa svaret; svaret
  körs klart och räknas i förbrukningen)
- [ ] Handledaren föreslår repetition utifrån svaga taggar (i dag ser den bara behärskning per
  modul)
- [ ] Valfritt: handledarportal (Supabase) där handledaren kommenterar direkt

**Klart när**: studenten har använt handledaren i ett riktigt pass och handledaren har läst en första
återkoppling på ett beslut och tyckt att den hjälper.

## Fas 4 · Bredd och finish (v0.8 → 1.0)

- [x] Alla 13 moduler har frågor: 526 frågor (40 + 40 + 51 + 39 + 36 + 47 + 38 + 39 + 40 + 40 +
  40 + 40 + 36), alla med status `utkast`. Varje fråga i de elva nya modulerna är besvarad och
  rättad genom appen i webbläsarläget.
- [x] Tillsyn (nivå 4) och överklagandeflöde: A004 tillsyn av ett garage byggt större än lovet
  (byggsanktionsavgift, preskription, lov i efterhand, rättelse), A005 restaurang i en
  kulturhistoriskt värdefull byggnad och A006 flerbostadshus med överklagande till länsstyrelsen.
  Motorn behandlar nivå 4 som tillsyn utan 99 §-frist tills en ansökan om lov i efterhand kommer in.
- [x] 600+ frågor: 622 finns efter fas 4b (48 + 48 + 55 + 47 + 44 + 51 + 46 + 47 + 48 + 48 +
  48 + 48 + 44). De 96 nya fyller luckor i varje modul; modul 8 har appens två första frågor av
  typen `ritning`, som mäter i ritningar ur A001 och A002.
- [ ] 15+ ärenden: nio finns (60 % av målet). Fas 4b lade till A007 anmälan av eldstad och
  VA-servis (nivå 1, slutar med startbesked), A008 marklov för schakt och trädfällning (nivå 2)
  och A009 förhandsbesked för två tomter vid en kvarnmiljö (nivå 3, med överklagande). Nivåerna
  är nu 1: två ärenden, 2: tre, 3: tre och 4: ett; tillsyn är tunnast.
- [x] Beslutsutfallet `startbesked` (10 kap. 23 c och 24 §§ PBL) med egna kontroller, och
  fyraveckorsfristen för anmälan (6 kap. 5 § PBF). Beslutet heter efter lovtypen (`lovtyp`:
  bygglov, marklov, rivningslov eller förhandsbesked), och ett förhandsbesked kontrolleras mot
  9 kap. 104 § i stället för 105 §.
- [x] Mätverktyg i ritningsvisaren: avstånd och yta i meter, snäppning, fungerar med zoom
- [x] Ritningsgeneratorn: avvikelse mot lov, parkering, balkonger, ny/igensatt öppning, skylt,
  ventilationskanal, platt tak med attika, våningsantal, nockhöjd och egna planbestämmelser;
  i fas 4b träd som bevaras eller fälls, pool, befintliga och nya höjder, nya tomtgränser vid
  avstyckning, fornlämningar, namngivna grannbyggnader och eldstad och VA-servis i planritningen
- [x] Kommandopalett (Ctrl/Cmd + K), tangentbordsgenvägar överallt och en hjälpruta (`?`), se
  [tangentbord.md](tangentbord.md)
- [x] Tillgänglighetsgenomgång med axe (WCAG 2.2 AA, ljust och mörkt läge) av alla vyer, paletten
  och ärendevyn; `--brick` och `--success` mörkare så att liten text klarar 4,5:1
- [x] Rättslägesutdrag för PBL 1–6, 8, 10–13 och 16 kap., PBF 1, 3, 5–9 kap., FL, KL, MB, KML,
  väglagen och fler i `docs/rattslage/`

Kvar till 1.0:

- [ ] **Handledarens granskning.** Handledaren går igenom de 622 frågorna, de nio ärendena och
  ordlistan mot *Lagtextens byggregler 2026-01-01* och sätter `status: granskad`. Börja med det
  agenterna själva flaggade: avgiftsberäkningen i A004 (sanktionsarea för den avvikande delen,
  ibruktagande och rättelse, särskilt om 15 kvm ska dras av från den area som tas i bruk enligt
  PBF 9 kap. 18 § andra stycket), måtten enligt SS 21054:2020 i modul 8 (`lagrum_osaker`), praxis om
  sakägare och liten avvikelse och bemötandefrågorna i modul 13. Från fas 4b: carportens area
  i rit-045 och rit-047, cykelparkeringen i krav-044, gränsträdet och ersättningsträdet i A008,
  kvarnmiljön och villkoren i förhandsbeskedet i A009 och skorstensfejarens förhandsbedömning i
  A007.
- [ ] Ärlig lägesbild mot målen i [02-innehall.md](02-innehall.md) (15–20 ärenden och 600+
  frågor efter ett halvår): frågemålet är nått, ärendemålet till drygt hälften. Ingenting är
  granskat än; all text har status `utkast`.
- [ ] 1.0 när handledaren säger att ett case känns "på riktigt"
- [ ] Fler ärenden (mål 15+), helst efter handledarens muntliga berättelser
- [ ] Ett eget beslutsutfall för ingripande i tillsynsärenden (i dag skrivs avgift och
  föreläggande i motiveringen)
- [ ] Frågetypen `ritning` med egna ritningsparametrar på frågan, så att modul 8 kan mäta i
  fristående ritningar

## Beslut som tagits

| Fråga | Beslut | Konsekvens |
| --- | --- | --- |
| Windows eller Mac? | Windows | Bara Windows-bygge i CI, ingen kodsignering, SmartScreen-guide |
| Publikt repo? | Ja | Uppdateringslänk direkt mot `releases/latest/download/latest.json` |
| Hur får appen AI-tillgång? | Studenten får en API-nyckel av utvecklaren | Nyckel klistras in i Inställningar, sparas i Credential Manager, ingen server |
| Hur bidrar handledaren med innehåll? | Muntligt | Inga innehållsverktyg för handledaren; utvecklaren/AI skriver YAML, handledaren granskar |

## Kvarvarande öppna frågor

| Fråga | Varför det spelar roll | Förslag om inget svar |
| --- | --- | --- |
| Vilken utbildning/skola går studenten? | Vi kan matcha modulerna mot deras faktiska kursplan | Utgå från listan i 02 |
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
