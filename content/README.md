# content/ – studieinnehållet

Allt innehåll i appen skrivs här som YAML. Det valideras av `@bygglov/content-schema`
(zod) och byggs till JSON av `@bygglov/content-build`. Ett fel i en fil stoppar bygget med
ett begripligt felmeddelande, så du kan inte "förstöra appen" genom att skriva innehåll.

```
content/
  moduler.yaml                         # alla 13 moduler, id + ordning + beskrivning
  fragor/<modul-id>.yaml               # en frågefil per modul, t.ex. 03-lovplikt.yaml
  arenden/<id>-<kort-namn>/arende.yaml # ett ärende per mapp, t.ex. A002-tillbyggnad-bjorken-7
  arenden/<id>-<kort-namn>/handlingar/ # md (texter) och svg (ritningar) som ärendet hänvisar till
```

Fältnamn skrivs utan å, ä och ö (`svarighet`, `forklaring`, `rattslage`). Texterna i fälten
skrivs som vanlig svenska.

## Rättsläge och granskning

- PBL 9 kap. skrevs om den 1 december 2025 med ny paragrafnumrering. Ta alla lagrum i 9 kap.
  från `docs/rattslage/` (`pbl-9-kap.txt` och tabellen gammal → ny i `README.md`), aldrig ur
  minnet. Hitta aldrig på paragrafnummer; skriv hellre `PBL 9 kap.`.
- Varje fråga och ärende har `status: utkast` och `rattslage: "2025-12-01"`. Handledaren
  granskar mot *Lagtextens byggregler 2026-01-01* och sätter `status: granskad`, gärna med
  `granskad_av` och `granskad_datum: ÅÅÅÅ-MM-DD`.
- Sätt `lagrum_osaker: true` bara när du hänvisar till något du inte kunnat slå upp.
- Hänvisa till Boverkets föreskrifter med BFS-nummer, kapitel och paragraf, till exempel
  `BFS 2024:12 2 kap. 4 §`. Ta texten från boverket.se, aldrig ur minnet. BBR 31 (BFS 2024:14)
  har bara avsnitt 1, 2 och 9 kvar. Äldre BBR-avsnitt används inte.

## Så skriver du en fråga

Lägg frågan sist i listan `fragor:` i rätt modulfil. Id ska vara unikt i allt innehåll
(t.ex. `lov-005`). Gemensamma fält för alla frågetyper:

```yaml
  - id: lov-005
    typ: sant_falskt          # se tabellen nedan
    svarighet: 1              # 1, 2 eller 3
    status: utkast
    rattslage: "2025-12-01"
    fraga: Ett beviljat bygglov gäller som huvudregel omedelbart, även innan det fått laga kraft.
    svar: true
    forklaring: >             # det viktigaste fältet: här lär studenten sig något
      Enligt 9 kap. 114 § PBL gäller lovet omedelbart. Fyraveckorsregeln är borta. Nämnden ska
      dock skjuta upp verkan till laga kraft vid risk för oåterkalleliga skador på t.ex.
      natur- eller kulturvärden.
    lagrum: [PBL 9 kap. 114 §]
    taggar: [lov, verkstallighet]
```

| `typ` | Extra fält |
| --- | --- |
| `flerval` | `alternativ:` lista med `text`, exakt ett med `ratt: true` |
| `flersvar` | `alternativ:` minst ett med `ratt: true` (delpoäng) |
| `sant_falskt` | `svar: true` eller `false` |
| `lucktext` | `___` i `fraga`, `svar:` en rad per lucka, t.ex. `["10", "3"]`; valfritt `tolerans` |
| `para_ihop` | `par:` lista med `vanster` och `hoger` |
| `ordning` | `poster:` i rätt ordning (appen blandar) |
| `berakning` | `svar:` tal (punkt som decimaltecken), `tolerans`, `enhet`, valfritt `losning` |
| `oppen` | `bedomningspunkter:` lista, valfritt `modellsvar`; `forklaring` är valfri |
| `ritning` | `fil:` sökväg relativt `content/`, valfritt `bild_text`, och `svar` (tal) eller `bedomningspunkter` |

En ritningsfråga visar ritningen i samma visare som i ärendena, med zoom, panorering och
mätverktyget (tangenten M), ovanför svarsfältet. `fil` är sökvägen relativt `content/`, t.ex.
`arenden/A001-komplementbyggnad-larken-4/handlingar/situationsplan.svg`; peka gärna på en
ritning som redan finns i ett ärende. `content:build` publicerar ritningen per fråga som
`apps/desktop/public/content/fragor/<modul>/<fråge-id>.svg` (samma ändelse som filen), så appen
behöver inte veta vilket ärende den kommer från, och två frågor som visar olika filer med samma
namn krockar inte. En genererad ritning skrivs från ärendets `parametrar`, precis som i ärendet.
`content:check` varnar om filen inte finns eller om sökvägen pekar utanför `content/`; då visas
frågan utan ritning. `bild_text` är bildtexten under ritningen och det som står kvar om
ritningen saknas.

Tips: sätt texten inom citattecken om den innehåller `: ` (kolon och mellanslag), annars
läser YAML den som ett objekt.

## Så skriver du ett ärende

Skapa mappen `arenden/A004-kort-namn/` med `arende.yaml` och `handlingar/`. Mappnamnet ska
börja med ärendets id (`A` + tre siffror). Utgå från `A002-tillbyggnad-bjorken-7` och se
`docs/03-arendesimulator.md` för idén.

- **Huvudfält**: `id`, `titel`, `niva` (1–4), `status`, `rattslage`, `fastighet`,
  `sammanfattning`, `startdatum` (ÅÅÅÅ-MM-DD), `larandemal`, `taxa` (post: belopp; postens namn
  visas i appen, så skriv det med å, ä och ö), valfritt
  `moduler`, `facit` och `lovtyp` (`bygglov` som standard, `marklov`, `rivningslov` eller
  `forhandsbesked`). `lovtyp` styr hur beslutet heter i formuläret och på beslutet ("Bevilja
  marklov", "Ge positivt förhandsbesked") och vilka upplysningar kontrollen letar efter
  (9 kap. 104 § för förhandsbesked, 105 § för lov).
- **`handlingar`**: `id`, `typ` (t.ex. `situationsplan`), `titel`, `fil` (ska ligga under
  `handlingar/`), valfritt `inkom`, `parametrar`, `fakta` och `dold_tills: <händelse-id>`.
  Se [Så skriver du handlingar](#så-skriver-du-handlingar).
- **`steg`**: `id`, `typ`, `rubrik` och fält per typ:
  `checklista` (`poster` med `finns`), `fraga` (`fragetyp` flerval/flersvar/sant_falskt/oppen),
  `berakning` (`fragor` med `svar` och `tolerans`), `urval` (`alternativ` med `ratt`),
  `skrivelse` (`bedomningspunkter`, valfritt `modelltext` och `ar_forelaggande: true`),
  `beslut` (`forvantat_beslut`: bevilja, bevilja_med_villkor, avsla, avvisa, avskriva eller
  startbesked, `bedomningspunkter` och valfritt `godtagbara_utfall`). Alla steg kan ha `vilande`.
- **`handelser`**: `id`, `namn`, `utlosare` och `effekt`. Utlösare (alla angivna villkor ska
  gälla): `efter_steg`, `vid_beslut`, `om_missat`, `om_forelagt`, `slump` (0–1). Effekter:
  `visa_handlingar`, `tid_framat_dagar`, `meddelande`, `satt_komplett_datum`, `ny_fristdag`,
  `vilande`, `vilande_upphor`, `andrade_fakta`, `nytt_steg` (ett helt steg som skjuts in).
- **`parter`** (valfritt): `sokande` och `fastighetsagare` (listor med namn) och `grannar`
  (lista med `fastighet` och `namn`). Beslutskontrollen känner då igen mottagare i
  expedieringen på namn, t.ex. "Maria och Jonas Lindqvist", och inte bara på rollord och
  fastighetsbeteckning.

Så tolkar ärendemotorn ärendet (bra att veta när du skriver):

- Ett `skrivelse`-steg med `ar_forelaggande: true` räknas som ett föreläggande. Ordet efter
  "föreläggande om" i rubriken eller instruktionen blir dess slag, så "Skriv föreläggande om
  komplettering" utlöser `om_forelagt: komplettering` och styr när tioveckorsfristen
  (9 kap. 99 §) börjar. Utan fältet är steget en vanlig skrivelse, vad det än heter.
- Ett `urval`-steg räknas som underrättelse av grannar (9 kap. 94 §). Använd en
  `fraga`/`flersvar` för andra urval, t.ex. remissinstanser.
- `om_missat: S3` gäller om steget hoppades över eller besvarades fel, eller om beslutet
  fattades utan att steget gjorts. Självbedömda steg räknas aldrig som missade.
- `satt_komplett_datum: true` betyder att bristerna avhjälptes den dag händelsen inträffar
  (efter `tid_framat_dagar`). Om föreläggandet skickades inom tre veckor räknas
  tioveckorsfristen från den dagen (9 kap. 99 § första stycket 4).
- **Ett ärende med `forvantat_beslut: startbesked` är en anmälan** (t.ex. eldstad eller VA,
  PBF 6 kap. 1 §). Tidsfristen är då fyra veckor i stället för tio och kan förlängas med högst
  fyra veckor (6 kap. 5 § PBF); föreläggande om komplettering och avgiftsreduktion fungerar som
  för lov. Beslutskontrollen godtar lagstöd i 10 kap. 23 eller 23 c § PBL, kräver att byggherren
  finns i expedieringen (delgivning är ett tips, inte ett krav, eftersom 9 kap. 108 § gäller lov)
  och letar i motivering och upplysningar efter kontrollplanen, handlingarna inför slutbesked,
  att det nya inte får tas i bruk före slutbesked och giltighetstiden (10 kap. 4, 24, 24 a och
  25 §§). Startbeskedet kungörs inte. Se A007.
- **Nivå 4 är tillsyn.** Ett tillsynsärende har ingen tidsfrist enligt 9 kap. 99 §: rubrikraden
  visar "Tillsyn, ingen frist", diariet förklarar varför och fristen kan inte förlängas. Kommer en
  ansökan om lov i efterhand in, skriv `ny_fristdag: ansokan_om_lov_i_efterhand` på händelsen;
  då räknas tio veckor från den dagen (99 § första stycket 1) och avgiftsreduktionen gäller som
  vanligt. Ändrar sökanden sedan ansökan på eget initiativ, skriv `ny_fristdag:
  sokandens_initiativ` på den händelsen; fristen räknas då från den senare dagen (99 § första
  stycket 2). Beslutet får rubriken "Beslut i tillsynsärende om …" och utfallen avser lov i
  efterhand. Byggsanktionsavgift och föreläggande skrivs i motiveringen; avgiftsfältet
  kontrolleras mot taxan för lovet. Se A004.
- `ny_fristdag: sokandens_initiativ` betyder att sökanden **på eget initiativ** kom in med
  ytterligare underlag eller en ändring av ansökan den dagen. Tioveckorsfristen räknas då
  från den dagen (9 kap. 99 § första stycket 2), och diariet påminner om att sökanden ska
  informeras skriftligen (100 § 2). Använd den inte för svar på ett föreläggande; då gäller
  `satt_komplett_datum`. Gäller flera startpunkter räknas den senaste, och en förlängning
  räknas från den fristen.
- `vid_beslut: bevilja` gäller även `bevilja_med_villkor`. Beslutskontrollen godtar
  `forvantat_beslut` och utfallen i `godtagbara_utfall`, en lista med `utfall` och en kort
  `motivering` som visas i bedömningen, t.ex. frivilligt lov i stället för avskrivning i A001:

  ```yaml
  godtagbara_utfall:
    - utfall: bevilja
      motivering: Ansökan kan i stället prövas som frivilligt lov (9 kap. 52 och 79 §§).
  ```

  Ett godtaget utfall räknas inte som missat för `om_missat`.
- Taxans poster är alternativ (t.ex. lov eller avskrivning); avgiften är rätt om den stämmer
  med någon av dem, efter reduktion enligt 12 kap. 8 a §.
- Vilande enligt 9 kap. 102 §: `vilande: strandskydd` (eller `expropriation`, `planarbete`,
  första stycket 1–3) på ett steg förklarar ärendet vilande den dag steget görs, men bara om
  steget besvaras rätt (studenten valde att låta ärendet vila). Samma fält finns som effekt på en
  händelse. `vilande_upphor: true` på en händelse avslutar vilandet den dag händelsen
  inträffar, t.ex. när dispensbeslutet kommer in. Diariet visar "Ärendet förklaras vilande …"
  och "Vilandeförklaringen upphör …". Medan ärendet vilar löper inte tioveckorsfristen, och
  dagarna det vilat efter att fristen började räknas inte in, eftersom avgiften inte
  reduceras när fristen överskrids på grund av vilandebeslutet (12 kap. 8 a §). Se A003.

### Mallvariabler i texter

Datum som beror på när studenten gör något, främst efter beslutet, skrivs som mallvariabler. De
fungerar i stegens texter (även steg som skjuts in), i händelsernas `meddelande` och i
Markdown-handlingar (även modelltexter). Motorn fyller i meddelandet när händelsen inträffar,
och appen fyller i steg och handlingar när de visas.

| Variabel | Värde |
| --- | --- |
| `{{simdatum}}` | Dagens datum i ärendets kalender (i ett meddelande: dagen då händelsen inträffar, efter `tid_framat_dagar`) |
| `{{ansokningsdatum}}` | Ansökningsdagen (`startdatum`) |
| `{{beslutsdatum}}` | Dagen då beslutet fattades |
| `{{kungorelsedatum}}` | Dagen då beslutet kungjordes på anslagstavlan; i simuleringen två dagar efter beslutet |
| `{{frist}}` | Sista dagen för beslut enligt 9 kap. 99 § som den ser ut just nu (i ett meddelande: efter händelsens `satt_komplett_datum` och `ny_fristdag`) |
| `{{inkomdatum}}` | Dagen då handlingen kom in (bara i handlingar och meddelanden) |

- `{{kungorelsedatum+19}}` och `{{simdatum-14}}` lägger till eller drar ifrån dagar.
- `|iso` ger `2026-10-14` i stället för `14 oktober 2026`, t.ex. `{{inkomdatum|iso}}`. I en
  Markdown-tabell skriver du `{{beslutsdatum\|iso}}`.
- `|vardag` flyttar en lördag, söndag, helgdag, midsommarafton, julafton eller nyårsafton till
  nästa vardag, som för sista dagen för en frist (2 § lagen (1930:173) om beräkning av
  lagstadgad tid): `{{kungorelsedatum+28|vardag}}`.
- Kontrollen säger till om en okänd variabel eller ett okänt filter i `arende.yaml`. Skriv inte
  variabler i front matter (`datum` ska vara ett fast datum); lämna då bort `datum` och skriv
  datumet i texten i stället.

Exempel från A003, där överklagandet alltid kommer 19 dagar efter kungörelsen:

```yaml
- id: E3
  utlosare: { efter_steg: S7, vid_beslut: bevilja }
  effekt:
    tid_framat_dagar: 21 # kungörelsen två dagar efter beslutet + 19 dagar
    meddelande: >
      Beslutet kungjordes på kommunens anslagstavla den {{kungorelsedatum}}. I dag, 19 dagar
      senare, har ett överklagande kommit in …
```

Kontrollen säger till om ett steg, en handling eller en händelse som refereras inte finns,
om ett id används två gånger och om `dold_tills` pekar på en händelse som saknas. Filer som
inte finns ännu ger bara en varning.

## Så skriver du handlingar

Handlingarna ska se ut som handlingar: en ansökan ser ut som en blankett, ett beslut som ett
beslut och en ritning som en ritning. Två format används, PDF används inte:

| Slags handling | Format | Hur |
| --- | --- | --- |
| Texter: ansökan, planbestämmelser, anmälan om KA, grannyttrande, modelltexter | Markdown (`.md`) | Skrivs för hand. Appen visar dem som ett A4-papper med ankomststämpel. |
| Ritningar: situationsplan, fasader, planritning, plankarta | SVG (`.svg`) | Genereras från `parametrar` i `arende.yaml`. Rita aldrig för hand. |

### Textdokument (Markdown)

Skriv i den stil myndigheter och sökande faktiskt använder: blanketter med rubriker och fält
(tabeller med två kolumner fungerar bra), brev med mottagare och underskrift, beslut med
rubrikerna Beslut, Avgift, Skäl för beslutet, Upplysningar, Hur man överklagar och
Expediering. GitHub-tabeller och kryssrutor (`- [x] Bygglov`, `- [ ] Rivningslov`) fungerar.
Lämna tomma fält tomma om något saknas i ansökan; det är en del av övningen.

En enkel radbrytning blir ett mellanslag i Markdown. Där raden ska brytas, som i adresser,
underskrifter och rader som `**Fastighet:** Björken 7`, avslutar du raden med `\`
(omvänt snedstreck).

Överst får dokumentet ha **front matter** som appen visar i stämpeln och dokumenthuvudet:

```markdown
---
rubrik: Ansökan om bygglov
avsandare: Maria och Jonas Lindqvist
datum: 2026-02-27
diarienummer: BN 2026-000214
---

# Ansökan om lov
…
```

| Nyckel | Innehåll |
| --- | --- |
| `rubrik` | Handlingens rubrik, t.ex. "Föreläggande om komplettering" |
| `avsandare` | Vem handlingen kommer från, t.ex. "Bygg- och miljönämnden, Åkerslunda kommun" |
| `datum` | Datum på själva handlingen (ÅÅÅÅ-MM-DD). Ankomstdatum står i `inkom` i `arende.yaml`. |
| `diarienummer` | Ärendets diarienummer, t.ex. "BN 2026-000214" |

Alla nycklar är valfria, men andra nycklar ger fel i kontrollen. Lämna bort `datum` när
handlingens datum beror på simuleringen (t.ex. ett grannyttrande som kommer in efter en
händelse). Alla namn, adresser och nummer är fiktiva: postnummer `999 99`, telefonnummer i
PTS serie för fiktion (`070-174 06 05`–`070-174 06 99`), e-post på `example.com` och
personnummer som `780412-XXXX`.

### Ritningar (genererad SVG)

En handling med `parametrar` och en `.svg`-fil är en genererad ritning. `typ` väljer
ritningstyp: `situationsplan`, `fasadritning`, `planritning` eller `plankarta`. Kontrollen
validerar parametrarna (fel visas som `handlingar[H2].parametrar.tomt_djup: …`) och varnar om
den sparade SVG-filen saknas eller inte stämmer med parametrarna.

```sh
pnpm content:drawings   # skriver alla genererade ritningar in i content/arenden/*/handlingar/
```

Kör kommandot efter varje ändring av `parametrar`, titta på ritningen och committa SVG-filen
tillsammans med `arende.yaml`. Samma parametrar ger alltid exakt samma fil. `content:build`
genererar ritningarna på nytt till appen, så den visar alltid det som parametrarna säger.

Gemensamt för alla ritningstyper:

- Alla mått i **meter**, punkt som decimaltecken. Koordinater: `x` åt öster, `y` åt söder.
  En rektangel skrivs `[x, y, bredd, djup]`, en punkt `[x, y]`. Väderstreck skrivs `norr`,
  `oster`, `soder`, `vaster`.
- `skala` är skaltalet (`500` betyder 1:500). Papper (A4/A3/A2, stående/liggande) väljs
  automatiskt efter vad som får plats.
- `ritningshuvud` (valfritt): `fastighet`, `projekt`, `ritningstyp`, `datum`,
  `ritningsnummer`, `ritad_av`. Utan dem används ärendets `fastighet` och `titel` och
  handlingens `inkom`. Ritningshuvudet har alltid texten "FIKTIV HANDLING FÖR UTBILDNING".

**`situationsplan`** (standardskala 1:500). Origo är tomtens nordvästra hörn.

| Parameter | Innehåll |
| --- | --- |
| `tomt_bredd`, `tomt_djup` | Tomtens mått (öst–väst, nord–syd) |
| `hus` | Befintlig huvudbyggnad, rektangel. Ange `hus`, `nybyggnad` eller båda. |
| `nybyggnad` | Ny huvudbyggnad, t.ex. ett nytt bostadshus på en obebyggd tomt (skrafferas) |
| `huvudbyggnad_namn` | Etikett på huvudbyggnaden, t.ex. "Nytt flerbostadshus" (annars "Befintligt/Nytt bostadshus") |
| `nybyggnader` | Fler nya huvudbyggnader, lista med `{ rektangel, namn }`, t.ex. ett hus på varje ny tomt. Skrafferas och måttsätts som `nybyggnad` |
| `tillbyggnad`, `komplementbyggnad` | Ny byggnadsdel, rektangel (skrafferas) |
| `komplementbyggnad_namn` | Etikett på komplementbyggnaden, t.ex. "Miljöhus och cykelförråd" |
| `ovriga_byggnader` | Befintliga byggnader, lista med `{ rektangel, namn }` |
| `avvikelse` | Tillsyn: det som byggts utan lov eller i strid med lovet, lista med `{ rektangel, namn }`. Korsskrafferas, får måttkedjor mot gränserna och etiketten `namn` |
| `lovgivet` | Tillsyn: det som lovet medger, lista med `{ rektangel, namn }`. Ritas som streck-punkt-kontur ovanpå byggnaderna; `namn` blir raden i teckenförklaringen |
| `prickmark` | Lista med `{ sida, djup }`, t.ex. `[{ sida: soder, djup: 6 }]` |
| `balkonger` | Utkragande delar ovan mark, lista med rektanglar. Ritas prickade utan etikett |
| `parkering` | Lista med `{ rektangel, platser, tillgangliga (0), namn }`. Ytan delas i `platser` platser längs den långa sidan; de första `tillgangliga` blir 5 m breda och märks PRH |
| `anlaggningar` | Annat på tomten (altan, markbädd …), lista med `{ rektangel, namn }`, ritas tunt streckat |
| `punkter` | Punkter med namn, t.ex. `[{ punkt: [10, 28], namn: Borrad brunn }]` |
| `pooler` | Pool eller annan vattenyta, lista med `{ rektangel, namn }`. Kant och vattenyta med vågräta streck |
| `trad` | Träd, lista med `{ punkt, namn, stamdiameter, krondiameter (6), status }`. Kronan ritas som en cirkel och stammen som en prick; `status: falls` ger streckad krona och kryss, `bevaras` (standard) hel krona. Etiketten hamnar på en ledig plats bredvid stammen |
| `hojder` | Markhöjder, lista med `{ punkt, befintlig, ny }` i meter över nollplanet. Befintlig höjd skrivs som text (+24,75), ny höjd i en ram under (+24,05). Minst en av dem |
| `tomter` | Nya tomtgränser inom området, t.ex. vid avstyckning: lista med `{ rektangel, namn, area }`. Gränserna ritas streckade (inte där de sammanfaller med ytterkanten), `namn` och `area` (m², som den ska stå) skrivs i tomten, och måttkedjorna bryts vid tomtgränserna. Byggnader måttsätts mot sin egen tomt. Teckenförklaringen kallar då ytterkanten "Gräns för området som ska styckas av" |
| `fornlamningar` | Fornlämningar, lista med `{ rektangel, namn }` (ett område) eller `{ punkt, namn }` (en enskild). Skrafferas med prickad kontur och får ligga utanför tomten; ett område utanför tomten måttsätts från tomtgränsen |
| `utfart` | `{ sida, lage, bredd, langd (6) }`; `lage` räknas från tomtens västra eller norra hörn |
| `strandlinje` | `{ sida, avstand, namn }`: strandlinjen `avstand` meter utanför tomtgränsen, med vatten bortom |
| `strandskydd` | `{ avstand }`: strandskyddsgränsen, `avstand` meter från strandlinjen (kräver `strandlinje`) |
| `gata` | `{ sida, namn, bredd (8), fastighet }` |
| `grannar` | Fastighetsbeteckningar per sida: `{ norr, oster, soder, vaster }` |
| `grannhus` | Grannarnas hus i samma koordinater (får ligga utanför tomten): en rektangel, eller `{ rektangel, namn }` som får etikett, t.ex. "Kvarnen" |
| `norr_vinkel` | Norrpilens vridning i grader (0 = norr uppåt) |
| `visa_areor` | `true` skriver ut tomtarea och byggnadsareor (av som standard, studenten ska mäta själv) |

Måttkedjor ritas automatiskt: tomtens mått, husets och de nya delarnas läge mot gränserna,
utfartens läge och prickmarkens djup. Generatorn flyttar måttkedjor och fastighetsnamnet så
att de inte skriver över varandra eller anläggningarna, men titta alltid på resultatet.
Fornlämningar och namngivna grannhus utanför tomten gör att ritningen visar mer av omgivningen
(och kan välja ett större papper), och grannfastigheternas namn flyttar sig då längs sidan
till en ledig plats.

**`fasadritning`** (standardskala 1:100). En eller två fasader i `fasader`, var och en med
`rubrik` och `delar`. Delarna ritas i ordning, så lista den som ligger längst bort först.

| Parameter (per del) | Innehåll |
| --- | --- |
| `namn` | Text under marklinjen, t.ex. "Ny tillbyggnad" |
| `x`, `bredd` | Läge och bredd längs fasaden |
| `byggnadshojd`, `takvinkel` | Byggnadshöjd (m) och takvinkel (grader) |
| `vy` | `gavel` (gaveln mot betraktaren) eller `langsida` (takfoten mot betraktaren) |
| `djup` | Husets djup tvärs nocken, krävs för `langsida` (eller ange `nockhojd`) |
| `nockhojd` | Valfri; annars räknas den ut från bredd/djup och takvinkel |
| `takutsprang` | Takutsprång (0,4) |
| `ny` | `true` för den sökta delen (grövre linje) |
| `visa_hojder` | Nivåkotor för BH och NH (`true`) |
| `attika` | Platt tak (`takvinkel: 0`) bakom en attika: attikans höjd över takytan. BH blir överkant attika och takytan ritas streckad |
| `oppningar` | Lista med `{ typ: fonster/dorr/altandorr/port, x, bredd, hojd, underkant, status }`; `x` från delens vänstra kant |
| `balkonger` | Lista med `{ x, bredd, underkant, racke (1,1), ny }`: platta och räcke framför fasaden |
| `detaljer` | Lista med `{ typ: skylt/kanal, x, bredd, underkant, hojd, text, fristaende, ny }`. En skylt är en skiva med text, eller fristående bokstäver med `fristaende: true`; en kanal får skarvar, huv och en nivåkota för sin överkant |

Vid ändring av en befintlig fasad: ge öppningarna `status: ny` (grov linje) eller `status: rivs`
(streckad med kryss, ritas ovanpå det som ersätter den). Anmärkningarna förklarar markeringarna.
Ett dörrhandtag ritas en meter över dörrens underkant, så balkongdörrar får det på rätt höjd.

**`planritning`** (standardskala 1:100). Använd gärna samma koordinater som situationsplanen.

| Parameter | Innehåll |
| --- | --- |
| `rubrik` | Rubrik under planen, t.ex. "Plan 1" |
| `byggnader` | Lista med `{ namn, rektangel, ny }`, rektangeln är ytterväggarnas utsida |
| `vaggtjocklek` | Ytterväggens tjocklek (0,3) |
| `rum` | Lista med `{ namn, rektangel, visa_area }`, rektangeln är rummets insida (nettoarea) |
| `dorrar` | `{ position, vagg: horisontell/vertikal, bredd (0,9), oppnas_mot, gangjarn: start/slut, typ: dorr/oppning, tjocklek }` |
| `fonster` | `{ position, vagg, bredd, tjocklek }` |
| `sektion` | Valfri sektion bredvid planen: `{ rubrik, snitt: { fran, till, sikt }, bredd, byggnadshojd, takvinkel, takutsprang, taktjocklek, golv_over_mark, rum }` |
| `balkonger` | Lista med `{ rektangel, namn }` utanför väggarna (utsida platta). Måttkedjorna flyttas ut förbi dem |
| `installationer` | Lista med `{ typ, namn, rektangel, ny (true) }`, `typ` är `kamin` (eldstad med anslutning till rökkanal), `skorsten`, `servis` (VA-servis med V och S) eller `annan`. Ska ligga inom en byggnad; `namn` skrivs bredvid symbolen inne i rummet, och teckenförklaringen får en rad per typ |

Väggar blir det som ligger mellan rummen. `position` är öppningens början på väggens norra
(horisontell vägg) eller västra (vertikal vägg) sida, och `tjocklek` är väggens tjocklek där
(standard ytterväggen; skriv `0.1` för innerväggar).

**`plankarta`** (standardskala 1:1000).

| Parameter | Innehåll |
| --- | --- |
| `plan` | `{ beteckning, namn, laga_kraft, anmarkning }` |
| `omrade` | Planområdet, rektangel |
| `kvarter` | Lista med `{ namn, rektangel, anvandning (B), byggnadshojd, nockhojd, vaningar, byggnadsarea_procent, bestammelser, prickmark, fastigheter }` |
| `vaningar` | Per kvarter: högsta antal våningar, skrivs med romerska siffror (IV) |
| `nockhojd` | Per kvarter: högsta nockhöjd i meter (NH 8,5 på kartan) |
| `bestammelser` | Per kvarter: egna egenskapsbestämmelser, `[{ beteckning: m1, text: "Skydd mot trafikbuller" }]`. En siffra sist blir index (m₁); `text` blir raden i teckenförklaringen, så skriv den kort |
| `fastigheter` | Per kvarter: `{ beteckning: "7", rektangel, markerad }`; `markerad: true` ritar fastigheten som ansökan avser |
| `allmanna_platser` | Lista med `{ anvandning: GATA/PARK/NATUR/TORG, namn, rektangel }` |

Teckenförklaringen byggs av det som finns på kartan. Kvarter med olika `byggnadsarea_procent` får
var sin beteckning, e₁, e₂ och så vidare. Plankartan och planbestämmelserna
(Markdown) ska säga samma sak, och `fakta` på planbestämmelserna ska stämma med båda.

## Så kör du kontrollen

```sh
pnpm content:check     # validerar allt, skriver rapport, avslutar med fel om något är fel
pnpm content:drawings  # genererar ritningarna in i content/ (granskas och committas)
pnpm content:build     # validerar och skriver JSON till apps/desktop/src/content-dist/
```

`content:build` kopierar också `handlingar/` till `apps/desktop/public/content/arenden/<id>/`
och skriver de genererade ritningarna dit, och ritningsfrågornas ritningar till
`apps/desktop/public/content/fragor/<modul>/<fråge-id>.svg`. Båda målmapparna är genererade och
ignoreras av git, och bygget tömmer dem först, så att inget gammalt ligger kvar. SVG-filerna i `content/` är däremot genererade *och* committade, så att ändringar syns i
granskningen.
