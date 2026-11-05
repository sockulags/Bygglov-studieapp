# 02 · Innehåll och pedagogik

## Ämnesområden (moduler)

Modulerna speglar vad en YH-utbildning till bygglovshandläggare brukar täcka. Varje modul har
instuderingsfrågor, quiz och kopplade ärenden. Ordningen är ungefärlig svårighetsgrad.

| # | Modul | Kärnan | Centrala lagrum |
| --- | --- | --- | --- |
| 1 | Förvaltningsrätt och myndighetsrollen | Serviceskyldighet, kommunicering, jäv, motivering, överklagandehänvisning, delgivning, offentlighet och sekretess | FL 2017:900 (bl.a. 5–7, 16–18, 23–25, 31–33 §§), KL 6 kap. 28–39 §§, TF 2 kap., OSL |
| 2 | PBL-systemet och begreppen | Lagens uppbyggnad, byggnadsnämndens roll, översiktsplan/detaljplan/områdesbestämmelser, allmänna och enskilda intressen | PBL 1–5 kap., 12 kap., 16 kap. |
| 3 | Lovplikt och anmälningsplikt | Vad kräver bygglov, rivningslov, marklov, anmälan; undantag; bygglovsbefriade komplementbyggnader och tillbyggnader (före 2025-12-01: friggebod och attefall); en- och tvåbostadshus utanför plan | PBL 9 kap. 2–55 §§, PBF 6 kap. |
| 4 | Detaljplan och planenlighet | Läsa plankarta och planbestämmelser, byggrätt, prickmark, byggnadshöjd/nockhöjd, användning, liten avvikelse, planstridigt utgångsläge | PBL 9 kap. 56–64 §§, PBL 4 kap., PBF 1 kap. 3–4 §§, Boverkets allmänna råd om mätning |
| 5 | Prövning utanför detaljplan | Lokaliseringsprövning, områdesbestämmelser, sammanhållen bebyggelse, förhandsbesked | PBL 9 kap. 41–42, 57, 59 och 74 §§, 2 kap., 4 kap. 2 § |
| 6 | Handläggningsprocessen | Ankomstregistrering, fullständighetsgranskning, föreläggande om komplettering, handläggningstid 10 veckor, avgiftsreduktion, grannehörande, remisser, kungörelse, laga kraft | PBL 9 kap. 85–115 §§, 12 kap. 8 a § |
| 7 | Krav på byggnadsverk | Utformningskrav, tekniska egenskapskrav, tillgänglighet, varsamhet, förvanskningsförbud, tomtkrav | PBL 8 kap., PBF 3 kap., Boverkets byggregler |
| 8 | Ritningsläsning och beräkning | Situationsplan, plan/fasad/sektion, skala, byggnadsarea/bruttoarea/öppenarea, byggnadshöjd, våningar, avstånd till gräns | SS 21054:2020, Boverkets vägledning |
| 9 | Genomförandet | Tekniskt samråd, kontrollansvarig, kontrollplan, startbesked, arbetsplatsbesök, slutsamråd, slutbesked, interimistiskt slutbesked | PBL 10 kap., PBF 7 kap. |
| 10 | Tillsyn och sanktioner | Olovligt byggande, lovföreläggande, rättelseföreläggande, byggsanktionsavgift, vite, preskription | PBL 11 kap, PBF 9 kap |
| 11 | Angränsande lagstiftning | Strandskydd, kulturmiljölagen, miljöbalken, väglagen, fastighetsbildning, LSO | MB 7 kap, KML, VägL |
| 12 | Överklagande och prövningskedjan | Vem får överklaga, tidsfrister, rättidsprövning, länsstyrelse, mark- och miljödomstol, verkställbarhet | PBL 13 kap, FL 40–47 §§ |
| 13 | Kommunikation och bemötande | Skriva begripliga beslut, svåra samtal, förväntanshantering, service kontra myndighetsutövning | Klarspråk, FL 6 § |

Modullistan är ett utkast. Pappa bör gå igenom den och justera mot vad utbildningen faktiskt
täcker och vad han vet att handläggare snubblar på i praktiken. Lagrummen per modul i den
gällande numreringen står i `content/moduler.yaml` (`lagrum_sammanfattning`).

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

Se [content/README.md](../content/README.md) för hur frågor och ärenden skrivs, och
`content/fragor/03-lovplikt.yaml` och `content/arenden/` för riktiga exempel.

## Källor och rättsläge

**Normkälla är boken *Lagtextens byggregler 2026-01-01* (Svensk Byggtjänst)**, som den
studerande använder i utbildningen och som pappa tipsade om. Den samlar PBL, PBF, Boverkets
författningar och angränsande regler med sakregister. Alla lagrum i appen ska gå att slå upp
där, och Uppslag-vyn bör följa bokens indelning så att hon hittar snabbt i båda.

Två saker gör rättsläget extra viktigt just nu:

1. **PBL skrevs om den 1 december 2025** ("nytt regelverk för bygglov", bl.a. ett nytt 9 kap).
   Friggebod och attefallshus försvann som begrepp och ersattes av bygglovsbefriad
   komplementbyggnad, komplementbostadshus och bygglovsbefriad tillbyggnad, med en samlad
   pott per tomt (45 kvm inom plan, 65 kvm utanför), slopad anmälningsplikt för dessa och
   krav på skriftligt grannmedgivande nära gräns. Paragrafnumreringen i 9 kap kan ha ändrats.
2. **Boverkets byggregler är nya.** BBR är ersatt av nya författningar och från 1 juli 2026
   gäller enbart de nya.

Konsekvenser för innehållet:

- Varje fråga och ärende har `rattslage` (vilket rättsläge det skrevs mot) och `status`
  (`utkast` tills pappa granskat mot boken, därefter `granskad`). Appen visar en diskret
  markering på utkast.
- Lagrum där paragrafnumret inte är kontrollerat efter omskrivningen märks `lagrum_osaker`
  och visas med ett frågetecken. Hellre "PBL 9 kap." än ett gissat paragrafnummer.
- AI-genererat innehåll (inklusive det som skrivs under fas 1) är alltid `utkast`. Modellernas
  träningsdata kan vara äldre än lagändringen.
- Äldre begrepp (friggebod, attefall) får förekomma i frågor som uttryckligen kontrasterar
  "före" och "nu", eftersom hon kommer möta dem i äldre kurslitteratur och i verkligheten.
- Granskningsrunda med pappa och boken är ett eget steg i varje innehållsleverans.

## Att producera innehåll

Realistiskt arbetsflöde för att få fram bra material:

1. Pappa berättar ett verkligt (anonymiserat) ärende muntligt. Spela gärna in eller
   anteckna i punktform; han ska inte behöva skriva något själv.
2. Storebror eller en AI-assistent strukturerar det till `arende.yaml` med steg, handlingar
   och facit enligt mallen. En bra fråga att ställa honom per ärende: "Vad gjorde
   handläggaren fel första gången?" Det blir händelserna.
3. Handlingar tas fram: enkla ritningar kan genereras som SVG från parametrar (mått, höjder,
   avstånd), ansökningsblanketter och plankartor som PDF/PNG. Riktiga offentliga handlingar
   ska inte användas rakt av.
4. Pappa läser igenom facit och bedömningspunkter. Hans namn står inte i appen, men hans
   erfarenhet står i facit.

Mål för första versionen: 1 ärende per nivå (3 st) och ca 150 frågor fördelade på modul 1–6.
Mål efter ett halvår: 15–20 ärenden och 600+ frågor.
