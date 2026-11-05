# 06 · Release och automatisk uppdatering

Målet: studenten installerar appen **en gång**. Därefter får studenten en dialog "Ny version finns" när vi
släppt något, trycker en knapp, och appen startar om uppdaterad.

## Flöde

```
 git tag v0.3.0 → push
        │
        ▼
 GitHub Actions: release.yml
   · pnpm install, content:check, test
   · tauri-action bygger
       - Windows: .exe (NSIS), x64
       - (macOS kan läggas till senare om behov uppstår)
   · signerar uppdateringspaketen med vår minisign-nyckel
   · skapar GitHub Release med artefakter + latest.json
        │
        ▼
 Appen (vid start, och var 6:e timme):
   · hämtar https://github.com/<ägare>/<repo>/releases/latest/download/latest.json
   · jämför version, verifierar signatur
   · visar UpdateBanner → "Uppdatera nu" → laddar ner, installerar, startar om
```

## Tauri-konfiguration (sammanfattning)

- Plugins: `@tauri-apps/plugin-updater`, `@tauri-apps/plugin-process` (för omstart),
  `@tauri-apps/plugin-dialog`.
- `tauri.conf.json`:
  - `bundle.createUpdaterArtifacts: true`
  - `plugins.updater.endpoints: ["https://github.com/<ägare>/<repo>/releases/latest/download/latest.json"]`
  - `plugins.updater.pubkey: "<publik minisign-nyckel>"`
- **Just nu** står `plugins.updater.pubkey` som tom sträng (`""`) i
  `apps/desktop/src-tauri/tauri.conf.json`, eftersom nyckelparet inte är skapat än. JSON
  tillåter inga kommentarer, därför står anmärkningen här. Innan första releasen ska den
  publika nyckeln (innehållet i `.pub`-filen från `signer generate`) klistras in där. Med tom
  nyckel kan appen inte verifiera några uppdateringar, och `tauri build` med
  `createUpdaterArtifacts: true` kräver dessutom att `TAURI_SIGNING_PRIVATE_KEY` är satt.
- Nyckelpar skapas en gång med `pnpm tauri signer generate`. Den privata nyckeln läggs som
  GitHub-secret `TAURI_SIGNING_PRIVATE_KEY` (+ `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`).
  **Förlorar vi den privata nyckeln kan befintliga installationer inte uppdateras**, så den
  säkerhetskopieras i en lösenordshanterare.
- Releasen måste vara publicerad som "Latest" (inte draft/pre-release) för att
  `releases/latest/download/` ska fungera. Repot är publikt, så länken fungerar direkt.

## Kodsignering

**Beslut: studenten har Windows. Vi bygger bara för Windows och signerar inte.** SmartScreen
varnar vid första installationen, därefter sköter Tauris uppdaterare resten utan varningar.
Installationsguiden visar exakt vad studenten ska klicka på. Tabellen nedan sparas som referens
om en Mac dyker upp i framtiden.

| OS | Utan signering | Med signering |
| --- | --- | --- |
| **Windows** | Fungerar. SmartScreen varnar vid första installationen ("Mer info" → "Kör ändå"). Uppdateringar via Tauri fungerar därefter. | Certifikat kostar ca 2 000–4 000 kr/år. Inte värt det för en användare. |
| **macOS** | Gatekeeper blockerar osignerade appar. Går runt med högerklick → Öppna första gången, men uppdateraren kan strula med osignerade/icke-notariserade paket. | Apple Developer Program 99 USD/år. Signering + notarisering i CI gör allt smärtfritt. Rekommenderas om studenten har Mac. |

NSIS-installern väljs framför MSI: den kan installeras per användare utan adminrättigheter
och uppdateraren hanterar den smidigast.

## Versionshantering

- Semver. `0.x` tills ärendesimulatorn är stabil, `1.0` när handledaren säger att ett case känns
  "på riktigt".
- Versionen sätts på ett ställe (`package.json`) och synkas till `tauri.conf.json` och
  `Cargo.toml` av ett skript, så det inte glöms.
- Release notes skrivs på svenska och på vardagsspråk: "Nytt ärende: Tillbyggnad på prickmark.
  40 nya frågor om tillsyn. Fixat att repetitionen ibland visade samma fråga två gånger."
  Dessa visas i appen under "Vad är nytt" efter uppdatering.

## Första installationen (det enda manuella steget)

Skriv `docs/installera.md` med skärmbilder när första releasen finns:

1. Gå till release-sidan (eller få länken av utvecklaren).
2. Ladda ner `Bygglov-studieapp_x.y.z_x64-setup.exe`.
3. Klicka "Mer info" och sedan "Kör ändå" i SmartScreen-rutan (bild i guiden).
4. Klart. Appen sköter resten.

## Innehållsuppdateringar

Nytt innehåll (frågor, ärenden) följer med appreleaser. Det är medvetet: ett flöde, en
uppdateringsmekanism, ingen server. Blir innehållstakten mycket högre än kodtakten kan en
separat "innehållskanal" läggas till senare (appen hämtar ett signerat innehållspaket), men
börja inte där.

## CI utan release

`ci.yml` körs på varje push och PR: lint, typecheck, test, `content:check`, och ett
snabbt Vite-bygge. Tauri-bygget körs bara vid taggar (det tar 10–20 min på Windows-runnern).
