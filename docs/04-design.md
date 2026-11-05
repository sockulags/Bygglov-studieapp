# 04 · Design och användarupplevelse

## Känsla

"Ett vackert kontor på stadsbyggnadskontoret." Lugnt, ljust, pappersnära. Inte en lekfull
quizapp med konfetti, inte heller ett grått myndighetssystem. Målet är att hon ska *vilja*
öppna den en tisdagkväll och känna sig som en handläggare, inte som en elev.

Referenspunkter: svenska kommuners nyare designsystem (luftiga, tydliga), Boverkets
PBL kunskapsbanken (sakligt), Linear/Notion (fokus och tangentbord), fysiska ritningar
och stämplar (textur och allvar).

## Visuell identitet

**Färger** (definieras som design tokens, ljust och mörkt läge):

| Token | Ljust | Mörkt | Används till |
| --- | --- | --- | --- |
| `--bg` | varm offwhite `#F7F5F0` | djup gråblå `#15191F` | Bakgrund |
| `--paper` | `#FFFFFF` | `#1D232B` | Kort, handlingar |
| `--ink` | `#1B1F24` | `#E8E6E1` | Text |
| `--muted` | `#6B7280` | `#9AA3AF` | Sekundär text |
| `--accent` | skogsgrön `#2F5D50` | `#7FB8A4` | Primära knappar, aktiv navigation |
| `--brick` | tegel `#A44B33` | `#E07A5F` | Varningar, "NY handling", stämplar |
| `--plan-yellow` | `#E9C46A` | `#E9C46A` | Markering i plankartor, highlights |
| `--success` | `#357240` | `#7BC47F` | Rätt svar, godkänt |

**Typografi**: en humanistisk sans för gränssnittet (Inter eller Source Sans 3) och en
läsvänlig serif för handlingar och beslutstexter (Source Serif 4 eller Newsreader), så att
"dokument" känns som dokument. Minsta brödtext 16 px. Generös radhöjd. Hon kommer läsa mycket.

**Form**: 8 px-rutnät, mjukt rundade hörn (6–10 px), tunna linjer snarare än skuggor.
Handlingar renderas som A4-kort med svag skugga och en röd "INKOM 2026-03-02" ankomststämpel.
Nya handlingar får en tegelfärgad "NY"-markör.

**Ikoner**: Lucide (konsekvent, tunna linjer).

**Rörelse**: sparsam. Kort fade när en ny handling kommer in i diariet, en diskret
stämpelanimation när beslut lämnas in. Inget som stjäl fokus.

## UX-principer

1. **En sak i taget.** Varje skärm har ett tydligt primärt val. Startsidan föreslår alltid
   nästa pass.
2. **Alltid en väg tillbaka.** Allt sparas automatiskt. Hon kan stänga mitt i ett ärende och
   fortsätta nästa dag.
3. **Förklaringen är belöningen.** Efter varje svar: kort förklaring, lagrum, länk till
   uppslag. Rätt eller fel spelar mindre roll än att hon läser förklaringen.
4. **Tangentbordet först i quiz.** 1–4 för svar, Enter för nästa, ? för hjälp.
5. **Ingen teknisk jargong.** Uppdateringsdialogen säger "En ny version finns. Uppdatera nu?"
   med en knapp. Inga versionsnummer i ansiktet (men i Inställningar).
6. **Tillgänglighet**: fullt tangentbordsstöd, synlig fokusmarkering, WCAG AA-kontrast,
   respekt för systemets reducerad rörelse-inställning. Hon pluggar till en yrkesroll där
   tillgänglighet är lag (8 kap PBL), appen ska leva som den lär.

## Navigation

Vänster sidopanel (ikon + text, kan fällas ihop):

```
🏠 Hem
📚 Plugga
📁 Ärenden
📖 Uppslag
📈 Mina resultat
⚙️ Inställningar
```

Globalt: `Cmd/Ctrl+K` öppnar sök över frågor, ärenden, begrepp och lagrum.

## Skärmar

### Hem

- Hälsning + dagens förslag: "Fortsätt ärende A004" eller "12 frågor väntar på repetition".
- Tre kort: Fortsätt där du var · Repetition · Nytt ärende.
- Liten översikt: streak, mastery per modul som tunn stapel, senaste resultat.

### Plugga

- Rutnät med moduler, varje kort visar mastery-ring och antal frågor.
- Val av läge (Snabbquiz, Genomgång, Repetition, Instudering, Tenta).
- Frågevy: fråga i mitten, svar som stora knappar, förklaringspanel fälls ut nedanför.
  Progress överst. Avslutsvy med rätt/fel per fråga och "öva på felen".

### Ärenden

- Lista grupperad per nivå med status (ny, pågår, inlämnat, bedömt) och ärendets rubrik:
  "Tillbyggnad av enbostadshus, Björken 7".
- Ärendevyn: tre paneler (se 03). På smal skärm staplas panelerna med flikar.
- Beslutsformuläret öppnas som en helskärmsvy med A4-förhandsvisning av beslutet bredvid
  formuläret, som uppdateras medan hon skriver.
- Efter inlämning: jämförelse sida vid sida med modellbeslutet och bedömningspunkterna.

### Uppslag

- Lagrumsregister (PBL, PBF, FL, BBR-kapitel) med korta egna sammanfattningar och länk till
  riksdagen.se / Boverket.
- Begreppsordlista med sök.
- Processkartor (bygglov, anmälan, tillsyn, överklagande) som klickbara SVG-diagram.

### Mina resultat

- Mastery över tid, svaga taggar, antal ärenden per status.
- Lista över inlämnade beslut med knapp "Exportera till handledare".
- Handledarens återkoppling (fas 3) visas här.

### Inställningar

- Utseende (system/ljust/mörkt), textstorlek.
- Uppdateringar: nuvarande version, "Sök efter uppdatering".
- Data: exportera/importera min studiedata (JSON), återställ.

## Komponentbibliotek

Byggs som egna komponenter ovanpå Radix-primitiver och Tailwind, i stil med shadcn/ui
(kopierade komponenter som vi äger, inte ett beroende). Centrala komponenter:

`Button`, `Card`, `Dialog`, `Sheet`, `Tabs`, `Progress/MasteryRing`, `Stamp`, `DocumentCard`,
`DiaryTimeline`, `DocumentViewer`, `Checklist`, `DecisionForm`, `LawRefChip`, `QuestionCard`,
`ExplanationPanel`, `CommandPalette`, `UpdateBanner`.

En Storybook eller enkel "komponentgalleri"-sida i dev-läge gör det lätt att hålla ihop
stilen när fler bygger.
