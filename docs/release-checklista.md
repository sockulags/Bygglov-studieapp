# Release-checklista

> **Läget 2026-11-04.** Steg 1 och 2 är redan gjorda: nyckelparet skapades i Claude-sessionen
> utan lösenord, den publika nyckeln ligger i `tauri.conf.json` och den privata lämnades över till
> utvecklaren för att läggas in som secret och i lösenordshanteraren. Det som återstår är steg 3
> (en enda secret, `TAURI_SIGNING_PRIVATE_KEY`) och sedan första taggen. Workflowet
> `Bygg-kontroll (Windows)` kan köras när som helst från fliken Actions för att testa bygget utan
> att publicera något; det ger en installer som artefakt.
>
> **Släppa utan att pusha en tagg:** fliken Actions → *Release* → *Run workflow* på `master`.
> Workflowet taggar då själv `v<version i package.json>` på senaste commiten och publicerar.
> Det är så releaser startas från Claude-sessionen, vars git-proxy inte tillåter tagg-pushar.

Så släpper utvecklaren en ny version av Bygglov-studieapp. Bakgrunden står i
[06-release-och-uppdatering.md](06-release-och-uppdatering.md); hur studenten installerar första
gången står i [installera.md](installera.md).

Kort version: **CHANGELOG → `pnpm version:sync` → commit → tagg `vX.Y.Z` → push → vänta på
Actions → kontrollera releasen.** Appen hos studenten hittar den nya versionen inom sex timmar,
eller direkt när studenten startar appen.

## Engångsförberedelser (före första releasen)

Görs **en gång**. Utan detta går det inte att bygga en release, och appen kan inte verifiera
uppdateringar.

### 1. Skapa signeringsnyckeln

Uppdateringar signeras med en minisign-nyckel. Appen installerar bara paket som är signerade
med den privata nyckel som hör ihop med den publika nyckeln i appen.

```sh
pnpm --filter desktop exec tauri signer generate -w ~/.tauri/bygglov.key
```

Ange ett lösenord när du blir tillfrågad (spara det i lösenordshanteraren direkt). Kommandot
skapar två filer:

| Fil | Innehåll | Var den ska finnas |
| --- | --- | --- |
| `~/.tauri/bygglov.key` | **Privat** nyckel. Hemlig. | GitHub-secret + lösenordshanteraren. Aldrig i repot. |
| `~/.tauri/bygglov.key.pub` | **Publik** nyckel. Inte hemlig. | `tauri.conf.json` i repot. |

> **VARNING: Säkerhetskopiera den privata nyckeln och lösenordet.** Lägg innehållet i
> `bygglov.key` och lösenordet i lösenordshanteraren (till exempel som en säker anteckning)
> innan du går vidare. **Förloras nyckeln kan de installationer som redan finns aldrig mer
> uppdateras automatiskt.** Då måste studenten ladda ner och installera en ny version för hand, med
> SmartScreen och allt. Det finns inget sätt att återskapa nyckeln.

### 2. Klistra in den publika nyckeln i appen

Öppna `apps/desktop/src-tauri/tauri.conf.json` och klistra in **hela innehållet** i
`bygglov.key.pub` (en lång rad som börjar med `dW50cnVzdGVk…`) som värde för
`plugins.updater.pubkey`:

```json
"plugins": {
  "updater": {
    "endpoints": [
      "https://github.com/sockulags/Bygglov-studieapp/releases/latest/download/latest.json"
    ],
    "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6…",
    "windows": { "installMode": "passive" }
  }
}
```

Det är innehållet i filen som ska in, inte sökvägen till den. Committa ändringen.
Release-workflowet stoppar med ett tydligt fel om `pubkey` fortfarande är tom.

### 3. Lägg in secrets på GitHub

På GitHub: **Settings → Secrets and variables → Actions → New repository secret**.

| Secret | Värde |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | Hela innehållet i `~/.tauri/bygglov.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Behövs inte: nyckeln skapades utan lösenord. Lämna bort den. |

`GITHUB_TOKEN` skapas automatiskt av GitHub för varje körning; den behöver du inte lägga in.
Workflowet ber själv om skrivrättighet (`permissions: contents: write`). Om releasen ändå
stoppas med *Resource not accessible by integration*: **Settings → Actions → General →
Workflow permissions → Read and write permissions**.

## Släppa en version

Exemplet släpper `0.2.0`. Byt mot rätt version.

### 1. Kontrollera att `master` är grön

- [ ] Senaste CI-körningen på `master` är grön (fliken **Actions** på GitHub).
- [ ] Lokalt: `pnpm lint && pnpm typecheck && pnpm test && pnpm content:check` och
      `cargo test --locked -p tutor-client` i `apps/desktop/src-tauri`.

### 2. Uppdatera CHANGELOG.md

- [ ] Flytta punkterna under `## [Oförsläppt]` till en ny sektion med version och datum:

  ```md
  ## [Oförsläppt]

  ## [0.2.0] - 2026-11-20

  ### Nytt

  - Nytt ärende: Tillbyggnad på prickmark.
  - 40 nya frågor om tillsyn.

  ### Rättat

  - Repetitionen visade ibland samma fråga två gånger.
  ```

- [ ] Skriv för studenten, inte för en programmerare. Texten blir både beskrivningen på
      GitHub-releasen, rutan *Vad är nytt i version …* i uppdateringsbannern och dialogen
      *Vad är nytt* efter uppdateringen.
- [ ] Lämna `## [Oförsläppt]` kvar, tom, överst.
- [ ] Uppdatera länkarna längst ner, till exempel
      `[0.2.0]: https://github.com/sockulags/Bygglov-studieapp/releases/tag/v0.2.0`.

Release-workflowet stoppar om det inte finns någon sektion för versionen eller om den är tom.

### 3. Sätt versionen

- [ ] Ändra `"version"` i **root**-`package.json` till `0.2.0`. Det är den enda källan till
      versionsnumret.
- [ ] Synka den till `apps/desktop/package.json`, `tauri.conf.json`, `Cargo.toml` och
      `Cargo.lock`:

  ```sh
  pnpm version:sync
  pnpm version:check
  ```

### 4. Committa, tagga och pusha

```sh
git add -A
git commit -m "Release v0.2.0"
git tag v0.2.0
git push origin master
git push origin v0.2.0
```

Taggen måste vara `v` + exakt versionen i `package.json`, annars stoppar workflowet.

### 5. Vänta på GitHub Actions

- [ ] Fliken **Actions** → workflowet **Release** för taggen `v0.2.0`. Det tar 10–20 minuter
      (Rust-kompileringen på Windows-runnern).
- [ ] Blir det rött: läs loggen, rätta, och se *Om releasen misslyckas* nedan.

### 6. Kontrollera releasen

På **<https://github.com/sockulags/Bygglov-studieapp/releases>**:

- [ ] Releasen *Bygglov-studieapp v0.2.0* är **publicerad** och märkt **Latest** (inte *Draft*
      eller *Pre-release*). Annars hittar uppdateraren den inte.
- [ ] Beskrivningen är texten från CHANGELOG.
- [ ] Under **Assets** finns:
  - `Bygglov-studieapp_0.2.0_x64-setup.exe`
  - `Bygglov-studieapp_0.2.0_x64-setup.exe.sig`
  - `latest.json`
- [ ] Öppna <https://github.com/sockulags/Bygglov-studieapp/releases/latest/download/latest.json>.
      Den ska visa `"version": "0.2.0"`, era release notes under `"notes"` och under
      `"platforms"` en post `windows-x86_64` med `signature` och en `url` som slutar på
      `_x64-setup.exe`.
- [ ] Prova på en dator med den förra versionen installerad: starta appen, vänta några
      sekunder, klicka **Uppdatera nu**. Appen ska starta om i den nya versionen och visa
      *Vad är nytt*.
- [ ] Studiehjälpen (från den första versionen med fas 3; den kan bara provas i Windows-bygget):
  - Inställningar → Studiehjälp: klistra in nyckeln och tryck **Testa nyckeln**. Svaret ska
    vara "Nyckeln fungerar. Modellen … svarade." En nyckel som inte börjar med `sk-ant-` ska
    ge ett svenskt felmeddelande.
  - Starta om appen: nyckeln ska fortfarande vara sparad. I Windows syns den under
    *Autentiseringshanteraren → Windows-autentiseringsuppgifter → Allmänna
    autentiseringsuppgifter* som
    `anthropic-api-key@se.bygglovstudieapp.app`.
  - Svara på en quizfråga och tryck **Fråga handledaren**: svaret ska strömma fram, och
    kostnadsraden under ska visa kronor. Fråga en gång till och kontrollera att raden nämner
    cache ("varav … från cache").
  - Förbrukningen under Inställningar → Studiehjälp ska ha ökat.

## Om releasen misslyckas

- **Workflowet blev rött innan releasen skapades:** rätta felet på `master`, flytta taggen och
  pusha den igen:

  ```sh
  git tag -d v0.2.0
  git push origin :refs/tags/v0.2.0
  git tag v0.2.0
  git push origin v0.2.0
  ```

- **En release skapades men är trasig:** ta bort releasen på GitHub och taggen enligt ovan,
  rätta och släpp igen. Har studenten hunnit uppdatera till en trasig version går det inte att
  backa via uppdateraren; släpp i stället en ny patchversion (`0.2.1`) med rättelsen.
- **Fel om signering eller nyckeln i loggen:** `TAURI_SIGNING_PRIVATE_KEY` ska innehålla
  filens innehåll, inte sökvägen, och `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` ska stämma.

## Versionsnummer

Semver: `0.x` tills ärendesimulatorn är stabil. Höj **patch** (`0.2.0 → 0.2.1`) för
rättelser, **minor** (`0.2.1 → 0.3.0`) för nytt innehåll eller nya funktioner. `1.0.0` när
handledaren säger att ett case känns "på riktigt".
