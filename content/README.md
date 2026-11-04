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
- Hänvisa till "Boverkets byggregler" i allmänhet, inte till BBR-avsnittsnummer.

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
    forklaring: >             # det viktigaste fältet: här lär hon sig något
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
| `ritning` | `fil:` sökväg relativt `content/`, och `svar` (tal) eller `bedomningspunkter` |

Tips: sätt texten inom citattecken om den innehåller `: ` (kolon och mellanslag), annars
läser YAML den som ett objekt.

## Så skriver du ett ärende

Skapa mappen `arenden/A003-kort-namn/` med `arende.yaml` och `handlingar/`. Mappnamnet ska
börja med ärendets id (`A` + tre siffror). Utgå från `A002-tillbyggnad-bjorken-7` och se
`docs/03-arendesimulator.md` för idén.

- **Huvudfält**: `id`, `titel`, `niva` (1–4), `status`, `rattslage`, `fastighet`,
  `sammanfattning`, `startdatum` (ÅÅÅÅ-MM-DD), `larandemal`, `taxa` (post: belopp), valfritt
  `moduler` och `facit`.
- **`handlingar`**: `id`, `typ` (t.ex. `situationsplan`), `titel`, `fil` (ska ligga under
  `handlingar/`), valfritt `inkom`, `parametrar`, `fakta` och `dold_tills: <händelse-id>`.
  Se [Så skriver du handlingar](#så-skriver-du-handlingar).
- **`steg`**: `id`, `typ`, `rubrik` och fält per typ:
  `checklista` (`poster` med `finns`), `fraga` (`fragetyp` flerval/flersvar/sant_falskt/oppen),
  `berakning` (`fragor` med `svar` och `tolerans`), `urval` (`alternativ` med `ratt`),
  `skrivelse` (`bedomningspunkter`, valfritt `modelltext`), `beslut` (`forvantat_beslut`:
  bevilja, bevilja_med_villkor, avsla, avvisa eller avskriva, samt `bedomningspunkter`).
- **`handelser`**: `id`, `namn`, `utlosare` och `effekt`. Utlösare (alla angivna villkor ska
  gälla): `efter_steg`, `vid_beslut`, `om_missat`, `om_forelagt`, `slump` (0–1). Effekter:
  `visa_handlingar`, `tid_framat_dagar`, `meddelande`, `satt_komplett_datum`, `andrade_fakta`,
  `nytt_steg` (ett helt steg som skjuts in).

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
| `hus` | Befintlig huvudbyggnad, rektangel |
| `tillbyggnad`, `komplementbyggnad` | Ny byggnadsdel, rektangel (skrafferas) |
| `ovriga_byggnader` | Befintliga byggnader, lista med `{ rektangel, namn }` |
| `prickmark` | Lista med `{ sida, djup }`, t.ex. `[{ sida: soder, djup: 6 }]` |
| `gata` | `{ sida, namn, bredd (8), fastighet }` |
| `grannar` | Fastighetsbeteckningar per sida: `{ norr, oster, soder, vaster }` |
| `grannhus` | Grannarnas hus, rektanglar i samma koordinater (får ligga utanför tomten) |
| `norr_vinkel` | Norrpilens vridning i grader (0 = norr uppåt) |
| `visa_areor` | `true` skriver ut tomtarea och byggnadsareor (av som standard, hon ska mäta själv) |

Måttkedjor ritas automatiskt: tomtens mått, husets och de nya delarnas läge mot gränserna
och prickmarkens djup.

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
| `oppningar` | Lista med `{ typ: fonster/dorr/altandorr/port, x, bredd, hojd, underkant }`; `x` från delens vänstra kant |

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

Väggar blir det som ligger mellan rummen. `position` är öppningens början på väggens norra
(horisontell vägg) eller västra (vertikal vägg) sida, och `tjocklek` är väggens tjocklek där
(standard ytterväggen; skriv `0.1` för innerväggar).

**`plankarta`** (standardskala 1:1000).

| Parameter | Innehåll |
| --- | --- |
| `plan` | `{ beteckning, namn, laga_kraft, anmarkning }` |
| `omrade` | Planområdet, rektangel |
| `kvarter` | Lista med `{ namn, rektangel, anvandning (B), byggnadshojd, byggnadsarea_procent, prickmark, fastigheter }` |
| `fastigheter` | Per kvarter: `{ beteckning: "7", rektangel, markerad }`; `markerad: true` ritar fastigheten som ansökan avser |
| `allmanna_platser` | Lista med `{ anvandning: GATA/PARK/NATUR/TORG, namn, rektangel }` |

Teckenförklaringen byggs av det som finns på kartan. Plankartan och planbestämmelserna
(Markdown) ska säga samma sak, och `fakta` på planbestämmelserna ska stämma med båda.

## Så kör du kontrollen

```sh
pnpm content:check     # validerar allt, skriver rapport, avslutar med fel om något är fel
pnpm content:drawings  # genererar ritningarna in i content/ (granskas och committas)
pnpm content:build     # validerar och skriver JSON till apps/desktop/src/content-dist/
```

`content:build` kopierar också `handlingar/` till `apps/desktop/public/content/arenden/<id>/`
och skriver de genererade ritningarna dit. Båda målmapparna är genererade och ignoreras av
git. SVG-filerna i `content/` är däremot genererade *och* committade, så att ändringar syns i
granskningen.
