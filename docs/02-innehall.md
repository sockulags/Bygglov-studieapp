# 02 · Innehåll och pedagogik

## Ämnesområden (moduler)

Modulerna speglar vad en YH-utbildning till bygglovshandläggare brukar täcka. Varje modul har
instuderingsfrågor, quiz och kopplade ärenden. Ordningen är ungefärlig svårighetsgrad.

| # | Modul | Kärnan | Centrala lagrum |
| --- | --- | --- | --- |
| 1 | Förvaltningsrätt och myndighetsrollen | Serviceskyldighet, kommunicering, jäv, motivering, överklagandehänvisning, delgivning, offentlighet och sekretess | FL 2017:900 (5–7, 10, 16–18, 23–25, 28, 31–33, 36–37 §§), KL, TF, OSL |
| 2 | PBL-systemet och begreppen | Lagens uppbyggnad, byggnadsnämndens roll, översiktsplan/detaljplan/områdesbestämmelser, allmänna och enskilda intressen | PBL 1–4 kap, 12 kap |
| 3 | Lovplikt och anmälningsplikt | Vad kräver bygglov, rivningslov, marklov, anmälan; undantag; Attefall; friggebod; en- och tvåbostadshus utanför plan | PBL 9 kap 1–16 §§, PBF 6 kap |
| 4 | Detaljplan och planenlighet | Läsa plankarta och planbestämmelser, byggrätt, prickmark, byggnadshöjd/nockhöjd, användning, liten avvikelse, planstridigt utgångsläge | PBL 9 kap 30–31 e §§, PBF 1 kap 3–7 §§, Boverkets allmänna råd om mätning |
| 5 | Prövning utanför detaljplan | Lokaliseringsprövning, områdesbestämmelser, sammanhållen bebyggelse, förhandsbesked | PBL 9 kap 17–18, 31 §§, 2 kap, 4 kap 2 § |
| 6 | Handläggningsprocessen | Ankomstregistrering, fullständighetsgranskning, föreläggande om komplettering, handläggningstid 10 veckor, avgiftsreduktion, grannehörande, remisser, kungörelse, laga kraft | PBL 9 kap 20–28, 41–43 §§, PBF 9 kap |
| 7 | Krav på byggnadsverk | Utformningskrav, tekniska egenskapskrav, tillgänglighet, varsamhet, förvanskningsförbud, tomtkrav | PBL 8 kap, PBF 3 kap, BBR |
| 8 | Ritningsläsning och beräkning | Situationsplan, plan/fasad/sektion, skala, byggnadsarea/bruttoarea/öppenarea, byggnadshöjd, våningar, avstånd till gräns | SS 21054:2020, Boverkets vägledning |
| 9 | Genomförandet | Tekniskt samråd, kontrollansvarig, kontrollplan, startbesked, arbetsplatsbesök, slutsamråd, slutbesked, interimistiskt slutbesked | PBL 10 kap, PBF 7 kap |
| 10 | Tillsyn och sanktioner | Olovligt byggande, lovföreläggande, rättelseföreläggande, byggsanktionsavgift, vite, preskription | PBL 11 kap, PBF 9 kap |
| 11 | Angränsande lagstiftning | Strandskydd, kulturmiljölagen, miljöbalken, väglagen, fastighetsbildning, LSO | MB 7 kap, KML, VägL |
| 12 | Överklagande och prövningskedjan | Vem får överklaga, tidsfrister, rättidsprövning, länsstyrelse, mark- och miljödomstol, verkställbarhet | PBL 13 kap, FL 40–47 §§ |
| 13 | Kommunikation och bemötande | Skriva begripliga beslut, svåra samtal, förväntanshantering, service kontra myndighetsutövning | Klarspråk, FL 6 § |

Modullistan är ett utkast. Pappa bör gå igenom den och justera mot vad utbildningen faktiskt
täcker och vad han vet att handläggare snubblar på i praktiken.

## Frågetyper

| Typ | Används till | Rättning |
| --- | --- | --- |
| `flerval` | Faktakunskap, begrepp, "vilket lagrum" | Automatisk |
| `flersvar` | "Vilka av följande kräver bygglov?" | Automatisk, delpoäng |
| `sant_falskt` | Snabba repetitionsrundor | Automatisk |
| `lucktext` | Paragrafnummer, tidsfrister, mått | Automatisk med tolerans |
| `para_ihop` | Begrepp ↔ definition, åtgärd ↔ lagrum | Automatisk |
| `ordning` | Ordna stegen i en process | Automatisk |
| `berakning` | Byggnadsarea, byggnadshöjd, sanktionsavgift | Automatisk, numerisk tolerans |
| `oppen` | Instuderingsfrågor, "förklara", "motivera" | Självrättning mot facit och bedömningspunkter, valfritt AI-stöd |
| `ritning` | Läs av värden i en bifogad ritning | Automatisk eller självrättning |

Varje fråga har: id, modul, svårighet (1–3), frågetext, svar, **förklaring**, **lagrum** och
taggar. Förklaringen är det viktigaste fältet. Där lär hon sig något även när hon svarar rätt.

## Studielägen

- **Snabbquiz**: 10 slumpade frågor ur valda moduler. Resultat direkt.
- **Modulgenomgång**: alla frågor i en modul i pedagogisk ordning, med förklaringar.
- **Repetition**: appen väljer frågor hon haft fel på eller inte sett på länge. Bygger på
  spaced repetition (FSRS eller förenklad SM-2). Det här är läget som gör skillnad över tid.
- **Instudering**: öppna frågor hon besvarar skriftligt, jämför mot facit och markerar själv
  vad hon hade med. Svaren sparas så pappa kan läsa dem.
- **Tentaläge**: tidsbegränsat, blandade typer, ingen hjälp, resultat i slutet. Tränar inför
  riktiga tentor.
- **Ärenden**: se [03-arendesimulator.md](03-arendesimulator.md).

## Progression och motivation

- Mastery per modul (0–100 %) beräknad från repetitionsdata, inte bara "antal rätt".
- Svaga områden lyfts fram på startsidan: "Du har svårt för liten avvikelse. Kör 8 frågor?"
- Streak i dagar, men mjuk: missade dagar skäller inte.
- Milstolpar som är yrkesnära: "Första beviljade bygglovet", "Första avslaget med hållbar
  motivering", "Hanterat ett överklagande".

## Innehållsformat

Allt innehåll ligger i `content/` som YAML-filer och valideras med ett schema (zod) vid bygge.
Felaktiga filer stoppar bygget med ett begripligt felmeddelande, så att innehåll kan skrivas
utan rädsla för att "förstöra appen".

```
content/
  moduler.yaml              # lista över moduler, ordning, beskrivning
  fragor/
    03-lovplikt.yaml        # frågor per modul
    04-detaljplan.yaml
  arenden/
    A001-attefall-garage/   # ett ärende per mapp
      arende.yaml           # metadata, steg, händelser, facit
      handlingar/           # pdf/png/svg som visas i diariet
  uppslag/
    begrepp.yaml            # ordlista
    processer.yaml          # processkartor
```

Se `content/exempel/` för konkreta exempel på fråge- och ärendeformat.

## Att producera innehåll

Realistiskt arbetsflöde för att få fram bra material:

1. Pappa berättar ett verkligt (anonymiserat) ärende, muntligt eller i punktform.
2. Storebror eller en AI-assistent strukturerar det till `arende.yaml` med steg, handlingar
   och facit enligt mallen.
3. Handlingar tas fram: enkla ritningar kan genereras som SVG från parametrar (mått, höjder,
   avstånd), ansökningsblanketter och plankartor som PDF/PNG. Riktiga offentliga handlingar
   ska inte användas rakt av.
4. Pappa läser igenom facit och bedömningspunkter. Hans namn står inte i appen, men hans
   erfarenhet står i facit.

Mål för första versionen: 1 ärende per nivå (3 st) och ca 150 frågor fördelade på modul 1–6.
Mål efter ett halvår: 15–20 ärenden och 600+ frågor.
