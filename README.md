# Bygglov-studieapp

Studieapp för blivande bygglovshandläggare. Byggd för en person (och hennes pappa som handledare),
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
| [docs/installera.md](docs/installera.md) | Installationsguide för Windows |
| [docs/release-checklista.md](docs/release-checklista.md) | Så släpps en ny version |
| [CHANGELOG.md](CHANGELOG.md) | Vad som är nytt i varje version |

## Status

Fas 1 (v0.1) är släppt. Fas 2, ärendesimulatorn, är byggd och kommer i nästa version.
Det som finns:

- **Plugga**: snabbquiz, modulgenomgång, repetition (FSRS), instudering och tentaläge med alla
  nio frågetyper, förklaring och lagrum efter varje svar, tangentbordsstyrning och avslutsvy med
  "öva på felen". Varje svar sparas och styr repetitionsschemat.
- **Ärenden**: tre bygglovsärenden, ett per nivå (A001 komplementbyggnad nära gräns, A002
  tillbyggnad med liten avvikelse, A003 nybyggnad utanför plan vid strand). Ärendevyn har
  diarium, handlingsvisare med genererade ritningar, arbetsyta med sex stegtyper, simulerad tid
  med tioveckorsfristen (9 kap. 99 § PBL), händelser som förgrenar ärendet, beslutsmall med
  automatiska kontroller, jämförelse med modellbeslutet och export av beslutsrapporten till
  handledaren. Se [docs/03-arendesimulator.md](docs/03-arendesimulator.md).
- **Hem** och **Mina resultat**: fortsätt där du var (pass eller ärende), frågor som väntar på
  repetition, streak, behärskning per modul, ärenden per status, inlämnade beslut med
  handledarens bedömning, senaste pass och svaga taggar.
- **Innehåll**: 98 frågor i modul 3 (Lovplikt) och modul 6 (Handläggningsprocessen) och tre
  ärenden, allt enligt rättsläget från 2025-12-01 och med status `utkast` tills handledaren
  granskat det.
- **Uppslag**: modulernas lagrum och ett lagrumsregister byggt från frågorna och ärendena.
- **Inställningar**: tema, textstorlek, uppdateringar, export/import/återställning av studiedata.
- **Leveranskedja**: SQLite med migrationer, auto-uppdatering med "Vad är nytt", `ci.yml` och
  `release.yml` (Windows/NSIS), se [docs/release-checklista.md](docs/release-checklista.md).

Se [docs/07-roadmap.md](docs/07-roadmap.md) för vad som återstår.

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
```
