# 03 · Ärendesimulatorn

Det här är appens hjärta och det som skiljer den från ett vanligt quizverktyg.

## Idé

Studenten får ett bygglovsärende precis som det landar hos en handläggare: en ansökan med bilagor i
ett diarium. Studenten arbetar sig igenom ärendet steg för steg, fattar beslut och skriver motivering.
Men ärendet är inte statiskt. Beroende på vad studenten gör, och ibland oavsett, händer saker:
kompletteringar droppar in, en granne hör av sig, en remissinstans svarar, någon överklagar.
Precis som i verkligheten är den första ansökan sällan den sista versionen.

## Ärendets livscykel i appen

```
 Inkommen ansökan
      │
      ▼
 1. Fullständighetsgranskning ──── brister? ──► Föreläggande om komplettering (9:91)
      │ komplett                                   │
      ▼                                            ▼ (händelse) komplettering inkommer
 2. Lovplikt & prövningsgrund                     / eller inte → avvisning eller
      │                                             prövning i befintligt skick
      │
      ▼
 3. Planenlighet / lämplighet (9:56–64 / 9:57 och 2 kap)
      │
      ▼
 4. Krav på byggnadsverk (8 kap), ev. remisser
      │
      ▼
 5. Underrättelse & kommunicering (9:94–98)
      │                                           ◄── (händelse) grannyttrande inkommer
      ▼
 6. Beslut: bevilja / bevilja med villkor / avslå / avvisa / avskriva
      │
      ▼
 7. Expediering, kungörelse, laga kraft (9:108–110, 114)
      │                                           ◄── (händelse) överklagande
      ▼
 8. Tekniskt samråd, startbesked, slutbesked (10 kap)   [valfri del, svårare ärenden]
      │
      ▼
 9. Tillsyn (11 kap)   [valfri del, "det byggdes större än lovet"]
```

Alla ärenden behöver inte gå igenom alla steg. Ett enkelt ärende om en komplementbyggnad kan
sluta med att ansökan återkallas och ärendet skrivs av. Ett avancerat kan börja i steg 9 med en anmälan om olovligt byggande.

## Skärmen

Tre paneler, som ett ärendehanteringssystem fast snyggare:

| Panel | Innehåll |
| --- | --- |
| **Diarium** (vänster) | Händelselogg med datum och handlingar. Nya handlingar markeras "NY". Klick öppnar handlingen. |
| **Handling** (mitten) | Visning av vald handling: PDF, bild eller renderad SVG-ritning. Zoom och mätverktyg på ritningar (avstånd och yta, tangenten M). |
| **Arbetsyta** (höger) | Aktuellt steg med uppgift, checklista, anteckningar, och formuläret för beslut när det är dags. Flik för planbestämmelser och uppslag. |

Ovanför: ärendets rubrik, fastighetsbeteckning, dagens datum i simuleringen, dagar sedan
ansökningsdagen (räknar mot tioveckorsgränsen i 9 kap. 99 §; efter ett föreläggande inom tre
veckor i stället från kompletteringen), och studentens "att göra".

## Simulerad tid

Varje ärende har en intern kalender. När studenten slutför ett steg eller väntar på svar går tiden
framåt. Grannehörande tar två veckor. Komplettering tar den tid sökanden behöver. Det gör
handläggningstid (9 kap. 99 §) och avgiftsreduktion (12 kap. 8 a §) till något studenten känner av,
inte bara läser om.

## Steg och uppgifter

Varje steg definieras i `arende.yaml` med en typ:

| Stegtyp | Vad studenten gör | Rättning |
| --- | --- | --- |
| `checklista` | Bocka av vad som finns/saknas i ansökan | Automatisk mot facit |
| `fraga` | Flerval eller öppen fråga i kontext ("Kräver åtgärden lov?") | Automatisk/själv |
| `berakning` | Räkna ut byggnadsarea, höjd, avstånd från ritning | Automatisk med tolerans |
| `urval` | Välj t.ex. vilka grannar som ska höras på en karta/lista | Automatisk |
| `skrivelse` | Skriv ett föreläggande, en kommunicering, ett remissyttrande | Bedömningspunkter + handledare |
| `beslut` | Fyll i beslutsmallen | Bedömningspunkter + handledare |

## Beslutsmallen

Formuläret följer hur ett riktigt beslut ser ut, så att studenten tränar rätt form:

1. **Beslut** (bevilja / bevilja med villkor / avslå / avvisa / avskriva)
2. **Lagstöd för beslutet** (välj lagrum ur lista + fritext)
3. **Beslutsmotivering** (fritext; appen visar vilka bedömningspunkter som förväntas täckas,
   men inte svaret)
4. **Villkor och upplysningar** (startbesked krävs, giltighetstid 9 kap. 115 §, kungörelse, KA m.m.)
5. **Avgift** (räknas enligt en förenklad fiktiv taxa som ingår i ärendet)
6. **Hur man överklagar** (måste finnas; appen kontrollerar att den är med)
7. **Expediering** (vem ska få beslutet, vem ska delges, vem ska bara meddelas)

## Händelser och förgreningar

Händelser är det som gör simulatorn levande. De definieras i ärendet med en **utlösare** och en
**effekt**.

Utlösare kan vara:

- `efter_steg: S3` (tiden går, något inkommer)
- `vid_beslut: bevilja` / `vid_beslut: avsla`
- `om_missat: S5` (studenten beviljade utan att höra grannar → överklagande)
- `om_forelagt: komplettering` (studenten begärde komplettering → handlingar inkommer, delvis)
- `slump: 0.3` (ibland händer saker utan anledning, precis som i verkligheten)

Effekter kan vara:

- nya handlingar i diariet (markerade NY, med inkomstdatum)
- ändrade fakta ("sökanden har reviderat ritningarna, byggnadshöjden är nu 4,2 m")
- nytt steg som skjuts in ("Yttrande från granne, ta ställning")
- tiden går framåt
- ärendet tar en ny väg (överklagande → studenten skriver nämndens yttrande till länsstyrelsen)

Exempel på klassiska händelser som en erfaren handläggare säkert känner igen:

- Sökanden skickade in situationsplan på ett gammalt kartunderlag; den nya visar en ledning.
- Kontrollansvarig saknas i ansökan, dyker upp först efter föreläggande.
- Grannen som "inte hade något emot det" muntligt skickar ett skriftligt yttrande dag 13.
- Räddningstjänstens remissvar kräver ändrad utrymningsväg.
- Byggherren började bygga innan startbesked. Nu är det ett tillsynsärende också.
- Efter beviljat lov inkommer överklagande från en granne som inte hördes. Var grannen sakägare?

## Bedömning och facit

Varje ärende har ett **facit** och en **bedömningsmall**:

- För automatiska steg: det rätta svaret med förklaring och lagrum.
- För skrivelser och beslut: en lista med bedömningspunkter, t.ex.
  - "Identifierar att åtgärden strider mot planbestämmelse om byggnadshöjd"
  - "Prövar om avvikelsen är liten enligt 9 kap. 60 §"
  - "Motiverar varför avvikelsen inte är förenlig med planens syfte"
  - "Överklagandehänvisning finns"
  - "Anger lagrum korrekt"
- Ett **modellbeslut**, skrivet som en erfaren handläggare skulle skriva det, som visas efter
  att studenten lämnat in sitt.
- **Vanliga fel** som appen kan påpeka direkt om de syns i strukturerade fält (t.ex. beviljat
  utan att ha kört grannehörande när planavvikelse föreligger).

Studentens beslut och appens bedömningspunkter kan sedan exporteras som en **beslutsrapport**
(PDF eller delbar text) som studenten skickar till handledaren. Handledaren svarar med sin bedömning, antingen
muntligt eller via handledarvyn (fas 3).

## Svårighetsnivåer

| Nivå | Exempel | Vad som tränas |
| --- | --- | --- |
| 1 Grund | Komplementbyggnad nära gräns, grannmedgivande. Komplett ansökan. En händelse. | Processen, lovplikt (9 kap. 4, 34–35 §§), avskrivning |
| 2 Normal | Tillbyggnad inom plan med liten avvikelse, grannar ska höras, komplettering krävs | Planenlighet, 9 kap. 60 §, kommunicering, beslutsskrivning |
| 3 Avancerad | Nybyggnad utanför plan nära strand, remisser, överklagande | Lokaliseringsprövning, strandskydd, överklagandeprocess, yttrande |
| 4 Tillsyn | Anmälan om olovligt byggande, redan utfört, preskriptionsfråga | 11 kap, sanktionsavgift, rättelseföreläggande |

## Vad som inte ingår i första versionen

- Fri textdialog med "sökanden" (kan bli AI-drivet i fas 3).
- Redigerbara ritningar.
- Flera samtidiga ärenden med gemensam kalender ("ärendebalans"). Rolig idé för senare.

## Så fungerar det i appen (fas 2, v0.2)

Planen ovan är byggd. Det här är hur den faktiskt fungerar och var den avviker.

- **Ärendemotorn** (`apps/desktop/src/engine/cases/`) är ren TypeScript. Tillståndet är JSON
  och sparas i sin helhet i databasen (tabellen `case_state`), så att ett ärende kan stängas
  och fortsätta nästa dag. Varje åtgärd ger ett nytt tillstånd; motorn är den enda som tolkar
  händelserna.
- **Utlösare** är villkor som alla ska gälla, och varje händelse inträffar högst en gång. De
  prövas efter varje åtgärd (steg klart eller hoppat, beslut fattat), aldrig av att tiden
  bara går. `slump` dras en gång per ärendestart (fast seed), så samma start ger samma väg.
  `om_forelagt` utlöses av ett skrivelsesteg vars rubrik eller instruktion innehåller
  "förelägg", eftersom schemat saknar ett eget fält för det. `om_missat` gäller hoppade steg,
  fel svar och steg som aldrig gjordes före beslutet. Ett `urval`-steg räknas som underrättelse
  av grannar.
- **Simulerad tid och frist**: tioveckorsfristen i 9 kap. 99 § räknas från ansökningsdagen.
  Förelägger studenten om komplettering inom tre veckor räknas den i stället från den dag
  kompletteringen kommer in; fram till dess står fristen still. Avgiften reduceras med en
  femtedel per påbörjad vecka (12 kap. 8 a §). När beslutet är fattat visar rubrikraden om det
  kom i tid. Motorn kan förlänga fristen en gång (99 § andra stycket), men ärendevyn har ingen
  knapp för det än. Vilande enligt 102 § finns inte i motorn: A003 frågar om det i ett steg,
  och tidslinjen är lagd så att beslutet ändå fattas inom fristen.
- **Beslutsmallen** har de sju delarna ovan med levande A4-förhandsvisning. Bedömningspunkterna
  visas först efter inlämning, eftersom de i praktiken avslöjar svaret; formuläret ger bara
  allmänna ledtrådar (lagrum, taxa, reduktionsregeln). Saknas överklagandehänvisning eller
  annat säger formuläret till, men studenten kan lämna in ändå och få det underkänt.
- **Kontrollerna** efter inlämning: utfall, lagstöd (med varning för gammal numrering),
  motivering, överklagandehänvisning, underrättelse, avgift och expediering (delgivning av
  sökanden, fastighetsägaren och grannar som yttrat sig, meddelande till övriga), med lagrum.
  Upplysningar enligt 105 § (startbesked, giltighetstid, kontrollansvarig) ges som tips.
  Utfallskontrollen godtar bara `forvantat_beslut`; godtagbara alternativ (som frivilligt lov
  i A001) står bland bedömningspunkterna.
- **Jämförelsevyn** visar studentens beslut, modellbeslutet och kontrollerna sida vid sida, med
  bedömningspunkter att bocka av, vanliga fel och "Egna reflektioner".
- **Export och handledare**: "Exportera till handledare" ger beslutsrapporten som PDF (via
  utskrift), HTML-fil eller text att klistra in i sms eller mejl. Studentens reflektioner följer
  med. Handledarens bedömning (Godkänt, Komplettera eller Gör om, med kommentar) skrivs in i appen
  under "Handledarens bedömning", i jämförelsevyn eller under Mina resultat. Då blir ärendet
  "Bedömt". Handledarportalen är fortfarande fas 3.
- **Handlingar** är Markdown (visas som A4-papper med INKOM-stämpel) och SVG-ritningar som
  genereras från parametrar (situationsplan, fasader, planritning med sektion, plankarta).
  PDF-handlingar visas utan pdf.js. Mätverktyget kom i fas 4, se nedan.
- **Ärendena** i v0.2: A001 komplementbyggnad nära gräns (nivå 1, slutar med avskrivning),
  A002 tillbyggnad med liten avvikelse (nivå 2) och A003 nybyggnad utanför plan vid strand
  (nivå 3, med remisser, ändrad ansökan, rättidsprövning av ett överklagande och nämndens
  yttrande). Alla har status `utkast` tills handledaren granskat dem.

## Fas 4: tillsyn, fler ärenden och mätverktyget

- **Sex ärenden.** Till A001–A003 kommer A004 (nivå 4, tillsyn: garage byggt större än lovet på
  Tallen 9, med byggsanktionsavgift, preskriptionsinvändning, lov i efterhand och rättelse före
  sammanträdet), A005 (nivå 2, restaurang i en kulturhistoriskt värdefull byggnad på
  Kopparslagaren 3, med föreläggande, revidering på sökandens initiativ och en hyresgästs
  skrivelse) och A006 (nivå 3, flerbostadshus med balkonger över prickmark på Humlan 3, med
  bullerbestämmelse, gatukostnadsvillkor, överklagande och länsstyrelsens beslut).
- **Tillsyn i motorn.** Nivå 4 räknas som tillsynsärende: ingen tidsfrist enligt 9 kap. 99 §
  förrän en ansökan om lov i efterhand kommer in (`ny_fristdag: ansokan_om_lov_i_efterhand`),
  ny frist om sökanden sedan ändrar ansökan på eget initiativ (99 § första stycket 2, så i A004),
  ingen förlängning dessförinnan, och beslutet heter "Beslut i tillsynsärende om …". Ett eget
  beslutsutfall för ingripande finns inte än; avgiften och föreläggandet skrivs i motiveringen.
- **Mätverktyget.** Generatorn skriver skala och koordinatsystem i varje ritning. I visaren mäter
  studenten avstånd (Mät, tangenten M) och ytor (Yta) i meter och kvadratmeter, med snäppning till
  hörn och linjer, även när ritningen är zoomad.
- **Ritningsgeneratorn** kan visa avvikelse mot lov och lovets kontur (situationsplan),
  parkering med platser, balkonger, öppningar som är nya eller ska bort, skyltar,
  ventilationskanaler, platt tak med attika (fasad) och våningsantal, nockhöjd och egna
  bestämmelser som m₁ (plankarta). Se `content/README.md`.
