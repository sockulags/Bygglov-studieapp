# Bygglov-studieapp

Studieapp för blivande bygglovshandläggare. Byggd för en enskild student med en erfaren handledare vid sidan om,
men gjord ordentligt: quiz, instuderingsfrågor och realistiska bygglovsärenden med handlingar,
beslut och överraskningar på vägen.

Appen levereras som en desktop-app (Windows/macOS) med automatisk uppdatering, så att den som
pluggar aldrig behöver göra något mer tekniskt än att trycka "Uppdatera".

## Dokumentation

| Fil | Innehåll |
| --- | --- |
| [docs/01-vision.md](docs/01-vision.md) | Syfte, målgrupp, principer och avgränsningar |
| [docs/02-innehall.md](docs/02-innehall.md) | Ämnesområden, frågetyper, pedagogik och innehållsformat |
| [docs/03-arendesimulator.md](docs/03-arendesimulator.md) | Ärendesimulatorn: livscykel, handlingar, händelser, beslut, bedömning |
| [docs/04-design.md](docs/04-design.md) | Visuell identitet, UX-principer, navigation och skärmar |
| [docs/05-teknik.md](docs/05-teknik.md) | Teknikval, arkitektur, datamodell, mappstruktur |
| [docs/06-release-och-uppdatering.md](docs/06-release-och-uppdatering.md) | Bygge, signering, GitHub Releases och auto-uppdatering |
| [docs/07-roadmap.md](docs/07-roadmap.md) | Faser, milstolpar, öppna frågor och förslag på arbetsflöde |
| [content/README.md](content/README.md) | Hur frågor och ärenden skrivs och kontrolleras |
| [docs/tangentbord.md](docs/tangentbord.md) | Kommandopaletten och alla tangentbordsgenvägar |
| [docs/rattslage/README.md](docs/rattslage/README.md) | Rättsläget och lagtextutdragen som innehållet bygger på |
| [docs/installera.md](docs/installera.md) | Installationsguide för Windows |
| [docs/release-checklista.md](docs/release-checklista.md) | Så släpps en ny version |
| [CHANGELOG.md](CHANGELOG.md) | Vad som är nytt i varje version |

## Status

Fas 1 (v0.1), fas 2 (v0.2, ärendesimulatorn), fas 3 (v0.3, studiehjälp och uppslag) och fas 4
(v0.4, bredd och finish) är släppta. Fas 4b, mer innehåll (96 nya frågor och tre nya ärenden),
är byggd och kommer i nästa version. Det som finns:

- **Plugga**: snabbquiz, modulgenomgång, repetition (FSRS), instudering och tentaläge med alla
  nio frågetyper, förklaring och lagrum efter varje svar, tangentbordsstyrning och avslutsvy med
  "öva på felen". Varje svar sparas och styr repetitionsschemat. Alla 13 moduler har frågor.
- **Ärenden**: nio ärenden på fyra nivåer: A001 komplementbyggnad nära gräns, A002 tillbyggnad
  med liten avvikelse, A003 nybyggnad utanför plan vid strand, A004 tillsyn av ett garage byggt
  större än lovet (nivå 4), A005 restaurang i en kulturhistoriskt värdefull byggnad, A006
  flerbostadshus med överklagande, A007 anmälan av eldstad och VA-servis som slutar med ett
  startbesked, A008 marklov för schakt och trädfällning och A009 förhandsbesked för två tomter
  vid en kvarnmiljö. Ärendevyn har diarium, handlingsvisare med genererade ritningar och
  mätverktyg (avstånd och yta), arbetsyta med sex stegtyper, simulerad tid med tioveckorsfristen
  (9 kap. 99 §; fyra veckor för en anmälan enligt 6 kap. 5 § PBF; tillsynsärenden har ingen
  frist förrän en ansökan om lov i efterhand kommer in), förlängning av fristen, vilande enligt
  9 kap. 102 §, händelser som
  förgrenar ärendet, datum som följer studentens egen tidslinje, beslutsmall med automatiska
  kontroller (beslut om bygglov, marklov, förhandsbesked och startbesked), jämförelse med
  modellbeslutet och export av beslutsrapporten till handledaren.
  Se [docs/03-arendesimulator.md](docs/03-arendesimulator.md).
- **Fråga handledaren** (studiehjälp med AI): i förklaringen efter varje svar, i ärendets
  arbetsyta, som första återkoppling i jämförelsevyn och på Hem. Svaren strömmar från Claude
  via Rust-sidan; API-nyckeln ligger i Windows Autentiseringshanteraren och lämnar aldrig
  Rust-sidan. Facit skickas aldrig med innan studenten svarat eller lämnat in beslutet. I
  webbläsarläget svarar en inspelad testhandledare. Se [docs/05-teknik.md](docs/05-teknik.md).
- **Uppslag**: lagrumsregister med 9 kap. PBL paragraf för paragraf, övriga lagrum per lag
  (22 lagar), ordlista med 148 begrepp, fyra processkartor och sök med `/`.
- **Kommandopalett och tangentbord**: Ctrl/Cmd + K söker vyer, åtgärder, moduler, ärenden,
  begrepp och lagrum; `g` följt av en bokstav byter vy och `?` visar alla genvägar. Se
  [docs/tangentbord.md](docs/tangentbord.md).
- **Hem** och **Mina resultat**: fortsätt där du var, repetition, streak, behärskning per modul,
  och på resultatsidan behärskning över tid, svar per dag, svaga taggar, ärenden per status,
  kontroller per beslut och handledarens bedömningar, med filter och tabellvy för varje
  diagram.
- **Innehåll**: 622 frågor i alla 13 moduler, nio ärenden och uppslagsinnehållet, allt enligt
  rättsläget från 2025-12-01 och med status `utkast` tills handledaren granskat det. Lagtext som
  innehållet bygger på ligger i [docs/rattslage/](docs/rattslage/README.md).
- **Tillgänglighet**: genomgången med axe (WCAG 2.2 AA) i ljust och mörkt läge, synlig
  fokusram överallt och kontrastkontroll av alla färgpar i testerna.
- **Inställningar**: tema, textstorlek, uppdateringar, studiehjälp (nyckel, modell, växelkurs,
  dagligt tak och förbrukning), export/import/återställning av studiedata.
- **Leveranskedja**: SQLite med migrationer, auto-uppdatering med "Vad är nytt", `ci.yml` (även
  `cargo test` för studiehjälpens API-klient) och `release.yml` (Windows/NSIS), se
  [docs/release-checklista.md](docs/release-checklista.md).

Kvar till 1.0 är framför allt handledarens granskning av innehållet. Se
[docs/07-roadmap.md](docs/07-roadmap.md).

## Kom igång

Kräver Node 22 och pnpm 10. För skrivbordsappen även Rust och Tauris systemberoenden
(se [apps/desktop/README.md](apps/desktop/README.md)).

```sh
pnpm install
pnpm content:build     # YAML i content/ → JSON som appen bundlar
pnpm content:drawings  # ritningarna i content/ på nytt efter ändrade parametrar
pnpm dev               # appen i webbläsaren på http://localhost:1420
pnpm --filter desktop tauri dev   # som skrivbordsapp
```

I webbläsaren sparas studiedatan bara i minnet (tills sidan laddas om); i skrivbordsappen
ligger den i SQLite.

## Kontroller

```sh
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test
pnpm content:check   # validerar allt innehåll, måste vara grönt före release
pnpm --filter desktop build
(cd apps/desktop/src-tauri && cargo test --locked -p tutor-client)   # studiehjälpens API-klient
```
