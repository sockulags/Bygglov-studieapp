# content/ – studieinnehållet

Allt innehåll i appen skrivs här som YAML. Det valideras av `@bygglov/content-schema`
(zod) och byggs till JSON av `@bygglov/content-build`. Ett fel i en fil stoppar bygget med
ett begripligt felmeddelande, så du kan inte "förstöra appen" genom att skriva innehåll.

```
content/
  moduler.yaml                         # alla 13 moduler, id + ordning + beskrivning
  fragor/<modul-id>.yaml               # en frågefil per modul, t.ex. 03-lovplikt.yaml
  arenden/<id>-<kort-namn>/arende.yaml # ett ärende per mapp, t.ex. A002-tillbyggnad-bjorken-7
  arenden/<id>-<kort-namn>/handlingar/ # pdf/png/svg/md som ärendet hänvisar till
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

## Så kör du kontrollen

```sh
pnpm content:check   # validerar allt, skriver rapport, avslutar med fel om något är fel
pnpm content:build   # validerar och skriver JSON till apps/desktop/src/content-dist/
```

`content:build` kopierar också `handlingar/` till `apps/desktop/public/content/arenden/<id>/`.
Båda målmapparna är genererade och ignoreras av git.
