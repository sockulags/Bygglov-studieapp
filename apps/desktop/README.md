# desktop

Själva appen: React 19 + Vite + Tailwind CSS 4 i ett Tauri 2-skal. All kod som syns för
användaren ligger i `src/`, Rust-delen i `src-tauri/`.

## Köra i webbläsaren (snabbast för UI-arbete)

```sh
pnpm install            # en gång, från repots rot
pnpm --filter desktop dev
```

Öppna <http://localhost:1420>. Ingen Rust behövs. Allt som kräver Tauri (version, uppdateringar,
SQLite, dialoger) går via `src/lib/tauri.ts` och har en reserv när appen körs i en vanlig
webbläsare, så sidorna fungerar ändå.

## Köra som skrivbordsapp

Kräver Rust och Tauris systemberoenden (på Windows: WebView2 och Visual Studio Build Tools,
se <https://v2.tauri.app/start/prerequisites/>).

```sh
pnpm --filter desktop tauri dev
```

## Bygga

```sh
pnpm --filter desktop build         # typecheck + Vite-bygge till dist/
pnpm --filter desktop tauri build   # Windows-installer (NSIS), körs i CI vid taggar
```

`tauri build` skapar även uppdateringspaket (`createUpdaterArtifacts`) och behöver då
signeringsnyckeln i `TAURI_SIGNING_PRIVATE_KEY`. Se `docs/06-release-och-uppdatering.md`.

## Testa och granska

```sh
pnpm --filter desktop test        # vitest
pnpm --filter desktop typecheck
pnpm lint                         # från roten
```

## Var saker finns

| Sökväg | Innehåll |
| --- | --- |
| `src/styles/tokens.css` | Design tokens: färger (ljust och mörkt), typsnitt, radier, rutnät, rörelse |
| `src/styles/globals.css` | Kopplar tokens till Tailwind (`bg-paper`, `text-muted`, `border-line` …) och basstilar |
| `src/app/` | Router (kodbaserade, typsäkra rutter), layout med sidopanel, providers |
| `src/features/<vy>/` | En mapp per vy: `home`, `study`, `cases`, `lookup`, `results`, `settings` |
| `src/components/ui/` | Egna komponenter ovanpå Radix: Button, Card, Dialog, Tabs, Progress/MasteryRing, Stamp, LawRefChip, UpdateBanner |
| `src/engine/` | Ren TypeScript utan React: quiz, repetition, ärendemotor, bedömning |
| `src/data/` | SQLite-migrationer och repositories |
| `src/lib/tauri.ts` | Skydd runt Tauri-API:erna (`isTauri()`, appversion, uppdateringskontroll) |
| `src-tauri/` | `tauri.conf.json`, `Cargo.toml`, `capabilities/`, ikoner |

Temat styrs av `data-theme="light|dark"` på `<html>` (sätts från Inställningar eller
temaknappen i sidopanelen). Utan attribut följer appen systemets ljust/mörkt-läge.

## Ikoner

Källan är `src-tauri/icons/app-icon.svg`. Efter ändring, generera om uppsättningen:

```sh
pnpm --filter desktop exec tauri icon src-tauri/icons/app-icon.svg -o src-tauri/icons
```

Ta sedan bort de genererade mapparna `android/` och `ios/`; appen byggs bara för Windows.

## Version

Versionen sätts bara i rotens `package.json`. `pnpm version:sync` kopierar den hit, till
`tauri.conf.json`, `Cargo.toml` och `Cargo.lock`. `node scripts/sync-version.mjs --check`
används i CI för att upptäcka avvikelser.
