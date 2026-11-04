# 03 · Ärendesimulatorn

Det här är appens hjärta och det som skiljer den från ett vanligt quizverktyg.

## Idé

Hon får ett bygglovsärende precis som det landar hos en handläggare: en ansökan med bilagor i
ett diarium. Hon arbetar sig igenom ärendet steg för steg, fattar beslut och skriver motivering.
Men ärendet är inte statiskt. Beroende på vad hon gör, och ibland oavsett, händer saker:
kompletteringar droppar in, en granne hör av sig, en remissinstans svarar, någon överklagar.
Precis som i verkligheten är den första ansökan sällan den sista versionen.

## Ärendets livscykel i appen

```
 Inkommen ansökan
      │
      ▼
 1. Fullständighetsgranskning ──── brister? ──► Föreläggande om komplettering (9:22)
      │ komplett                                   │
      ▼                                            ▼ (händelse) komplettering inkommer
 2. Lovplikt & prövningsgrund                     / eller inte → avvisning
      │
      ▼
 3. Planenlighet / lämplighet (9:30–31e / 2 kap)
      │
      ▼
 4. Krav på byggnadsverk (8 kap), ev. remisser
      │
      ▼
 5. Grannehörande & kommunicering (9:25, FL 25 §)
      │                                           ◄── (händelse) grannyttrande inkommer
      ▼
 6. Beslut: bevilja / bevilja med villkor / avslå / avvisa / avskriva
      │
      ▼
 7. Expediering, kungörelse, laga kraft (9:41–42a)
      │                                           ◄── (händelse) överklagande
      ▼
 8. Tekniskt samråd, startbesked, slutbesked (10 kap)   [valfri del, svårare ärenden]
      │
      ▼
 9. Tillsyn (11 kap)   [valfri del, "det byggdes större än lovet"]
```

Alla ärenden behöver inte gå igenom alla steg. Ett enkelt Attefall-ärende kan sluta vid
startbesked. Ett avancerat kan börja i steg 9 med en anmälan om olovligt byggande.

## Skärmen

Tre paneler, som ett ärendehanteringssystem fast snyggare:

| Panel | Innehåll |
| --- | --- |
| **Diarium** (vänster) | Händelselogg med datum och handlingar. Nya handlingar markeras "NY". Klick öppnar handlingen. |
| **Handling** (mitten) | Visning av vald handling: PDF, bild eller renderad SVG-ritning. Zoom, mätverktyg på ritningar (senare). |
| **Arbetsyta** (höger) | Aktuellt steg med uppgift, checklista, anteckningar, och formuläret för beslut när det är dags. Flik för planbestämmelser och uppslag. |

Ovanför: ärendets rubrik, fastighetsbeteckning, dagens datum i simuleringen, dagar sedan
komplett ansökan (räknar mot 10-veckorsgränsen), och hennes "att göra".

## Simulerad tid

Varje ärende har en intern kalender. När hon slutför ett steg eller väntar på svar går tiden
framåt. Grannehörande tar två veckor. Komplettering tar den tid sökanden behöver. Det gör
handläggningstid och avgiftsreduktion (9 kap 27 a–b §§) till något hon känner av, inte bara
läser om.

## Steg och uppgifter

Varje steg definieras i `arende.yaml` med en typ:

| Stegtyp | Vad hon gör | Rättning |
| --- | --- | --- |
| `checklista` | Bocka av vad som finns/saknas i ansökan | Automatisk mot facit |
| `fraga` | Flerval eller öppen fråga i kontext ("Kräver åtgärden lov?") | Automatisk/själv |
| `berakning` | Räkna ut byggnadsarea, höjd, avstånd från ritning | Automatisk med tolerans |
| `urval` | Välj t.ex. vilka grannar som ska höras på en karta/lista | Automatisk |
| `skrivelse` | Skriv ett föreläggande, en kommunicering, ett remissyttrande | Bedömningspunkter + handledare |
| `beslut` | Fyll i beslutsmallen | Bedömningspunkter + handledare |

## Beslutsmallen

Formuläret följer hur ett riktigt beslut ser ut, så att hon tränar rätt form:

1. **Beslut** (bevilja / bevilja med villkor / avslå / avvisa / avskriva)
2. **Lagstöd för beslutet** (välj lagrum ur lista + fritext)
3. **Beslutsmotivering** (fritext; appen visar vilka bedömningspunkter som förväntas täckas,
   men inte svaret)
4. **Villkor och upplysningar** (startbesked krävs, giltighetstid 9:43, kungörelse, KA m.m.)
5. **Avgift** (räknas enligt en förenklad fiktiv taxa som ingår i ärendet)
6. **Hur man överklagar** (måste finnas; appen kontrollerar att den är med)
7. **Expediering** (vem ska få beslutet, vem ska delges, vem ska bara meddelas)

## Händelser och förgreningar

Händelser är det som gör simulatorn levande. De definieras i ärendet med en **utlösare** och en
**effekt**.

Utlösare kan vara:

- `efter_steg: 3` (tiden går, något inkommer)
- `vid_beslut: bevilja` / `vid_beslut: avsla`
- `om_missat: grannehorande` (hon beviljade utan att höra grannar → överklagande)
- `om_forelagt: komplettering` (hon begärde komplettering → handlingar inkommer, delvis)
- `slump: 0.3` (ibland händer saker utan anledning, precis som i verkligheten)

Effekter kan vara:

- nya handlingar i diariet (markerade NY, med inkomstdatum)
- ändrade fakta ("sökanden har reviderat ritningarna, byggnadshöjden är nu 4,2 m")
- nytt steg som skjuts in ("Yttrande från granne, ta ställning")
- tiden går framåt
- ärendet tar en ny väg (överklagande → hon skriver nämndens yttrande till länsstyrelsen)

Exempel på klassiska händelser som pappa säkert känner igen:

- Sökanden skickade in situationsplan på ett gammalt kartunderlag; den nya visar en ledning.
- Kontrollansvarig saknas i ansökan, dyker upp först efter föreläggande.
- Grannen som "inte hade något emot det" muntligt skickar ett skriftligt yttrande dag 13.
- Räddningstjänstens remissvar kräver ändrad utrymningsväg.
- Byggherren började bygga innan startbesked. Nu är det ett tillsynsärende också.
- Efter beviljat lov inkommer överklagande från en granne som inte hördes. Var hon sakägare?

## Bedömning och facit

Varje ärende har ett **facit** och en **bedömningsmall**:

- För automatiska steg: det rätta svaret med förklaring och lagrum.
- För skrivelser och beslut: en lista med bedömningspunkter, t.ex.
  - "Identifierar att åtgärden strider mot planbestämmelse om byggnadshöjd"
  - "Prövar om avvikelsen är liten enligt 9 kap 31 b §"
  - "Motiverar varför avvikelsen inte är förenlig med planens syfte"
  - "Överklagandehänvisning finns"
  - "Anger lagrum korrekt"
- Ett **modellbeslut**, skrivet som en erfaren handläggare skulle skriva det, som visas efter
  att hon lämnat in sitt.
- **Vanliga fel** som appen kan påpeka direkt om de syns i strukturerade fält (t.ex. beviljat
  utan att ha kört grannehörande när planavvikelse föreligger).

Hennes beslut och appens bedömningspunkter kan sedan exporteras som en **beslutsrapport**
(PDF eller delbar text) som hon skickar till pappa. Han svarar med sin bedömning, antingen
muntligt eller via handledarvyn (fas 3).

## Svårighetsnivåer

| Nivå | Exempel | Vad som tränas |
| --- | --- | --- |
| 1 Grund | Attefallsgarage, anmälan. Komplett ansökan. En händelse. | Processen, lovplikt, startbesked |
| 2 Normal | Tillbyggnad inom plan med liten avvikelse, grannar ska höras, komplettering krävs | Planenlighet, 9:31b, kommunicering, beslutsskrivning |
| 3 Avancerad | Nybyggnad utanför plan nära strand, remisser, överklagande | Lokaliseringsprövning, strandskydd, överklagandeprocess, yttrande |
| 4 Tillsyn | Anmälan om olovligt byggande, redan utfört, preskriptionsfråga | 11 kap, sanktionsavgift, rättelseföreläggande |

## Vad som inte ingår i första versionen

- Fri textdialog med "sökanden" (kan bli AI-drivet i fas 3).
- Redigerbara ritningar.
- Flera samtidiga ärenden med gemensam kalender ("ärendebalans"). Rolig idé för senare.
