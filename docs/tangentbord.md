# Tangentbordet

Hela appen går att använda utan mus. Den här sidan listar genvägarna; samma lista visas i
appen när du trycker `?` (utanför quizen och ärendet, som har sina egna hjälprutor) eller väljer
"Visa kortkommandon" i kommandopaletten.

Bokstavsgenvägarna fungerar bara när du inte skriver i ett textfält och ingen dialog är öppen.
Ctrl/⌘+K fungerar överallt, även i textfält.

## Överallt

| Tangenter | Gör |
| --- | --- |
| `Ctrl`+`K` (Mac: `⌘`+`K`) | Öppnar eller stänger kommandopaletten |
| `G` sedan `H` | Hem |
| `G` sedan `P` | Plugga |
| `G` sedan `Ä` (eller `G` sedan `A`) | Ärenden |
| `G` sedan `U` | Uppslag |
| `G` sedan `R` | Mina resultat |
| `G` sedan `I` | Inställningar |
| `/` | Fokuserar sökfältet där vyn har ett (Uppslag), annars öppnas kommandopaletten |
| `?` | Visar kortkommandon. I quizen och ärendet visar `?` vyns egna genvägar |
| `Esc` | Stänger dialogen, panelen eller handlingen som är öppen |
| `Tab` / `Skift`+`Tab` | Nästa eller föregående knapp, länk eller fält |

"G sedan H" betyder: tryck G, släpp, och tryck H inom en och en halv sekund. Ett G följt av
någon annan tangent gör ingenting, och den andra tangenten går vidare som vanligt (en siffra i
quizen räknas alltså fortfarande som svar).

Genvägarna till vyerna syns också som tangenter i verktygstipset när du håller musen över, eller
står med fokus på, en länk i sidopanelen.

## Kommandopaletten

Ctrl/⌘+K, eller knappen "Sök …" överst i sidopanelen. Sök på det du vill nå:

- **Vyer**: Hem, Plugga (och varje studieläge), Ärenden, Uppslag, Mina resultat,
  Inställningar (och dess delar Studiehjälp och Data).
- **Åtgärder**: "Starta snabbquiz i …" (alla moduler eller en modul), "Starta repetition",
  "Fråga handledaren", "Byt till mörkt läge" / "Byt till ljust läge" / "Följ systemets tema",
  "Sök efter uppdatering", "Visa kortkommandon" och "Visa eller fäll ihop sidopanelen".
- **Moduler**: startar en modulgenomgång.
- **Ärenden**: på nummer, rubrik eller fastighet ("björken", "A003").
- **Begrepp**: ordlistan, även på synonymer och äldre ord.
- **Lagrum**: 9 kap. PBL paragraf för paragraf, på nummer ("9 kap 60", "9:60") eller rubrik.

Sökningen tål att å, ä och ö skrivs som a och o ("nockhojd" hittar Nockhöjd), att bara början
av orden skrivs ("tidsb lov") och förkortningar som följer ordens början. Alla sökord måste
finnas med. De fem senaste valen visas överst när paletten öppnas.

| Tangenter | Gör |
| --- | --- |
| `↑` / `↓` | Flyttar mellan träffarna (runt från sista till första) |
| `Page Up` / `Page Down` | Flyttar fem träffar |
| `Enter` | Öppnar eller kör den markerade träffen |
| `Esc` | Stänger paletten |

## I quizen

| Tangenter | Gör |
| --- | --- |
| `1`–`9` | Väljer svarsalternativ |
| `S` / `F` | Svarar sant eller falskt |
| `Enter` | Svarar (flersvar), eller går till nästa fråga efter förklaringen |
| `Ctrl`+`Enter` | Lämnar in ett skrivet svar |
| `?` | Visar eller döljer quizens genvägar |

## I ärendet

| Tangenter | Gör |
| --- | --- |
| `1`–`9` | Väljer alternativ, bockar i checklistan eller väljer beslut |
| `Enter` | Lämnar in steget, eller går vidare efter återkopplingen |
| `Ctrl`+`Enter` | Lämnar in en text (skrivelse, öppen fråga) |
| Piltangenter, `+`, `−`, `0` | Flyttar, zoomar och anpassar ritningen när den har fokus |
| `M` | Mäter i ritningen; `Esc` avbryter mätningen och rensar sedan måtten |
| `Esc` | Stänger den öppna handlingen eller helskärmsvyn |
| `?` | Visar eller döljer ärendets genvägar |

## Inga krockar

De globala genvägarna är valda så att de inte stör vyernas egna:

- Siffrorna `1`–`9`, `Enter`, `S` och `F` används bara av quizen och ärendet. `G` och
  bokstäverna efter det används inte av någon vy.
- `M` i ritningsvisaren och `?` i quizen och ärendet hanteras av vyn själv; den globala
  `?`-hjälpen öppnas bara där ingen vy har tagit tangenten.
- Ingen bokstavsgenväg gör något i textfält, så det går alltid att skriva fritt.

## Tillgänglighet

Appen följer WCAG 2.2 AA (docs/04-design.md). Kontrollerat inför fas 4:

- **Landmärken**: sidopanelen (`aside` med `nav`), huvudinnehållet (`main`, med länken "Hoppa
  till innehållet" först på sidan) och notisen om testläget i webbläsaren (`footer`).
- **Rubriker**: en `h1` per vy och inga hopp i rubriknivåerna, även i quizen och i ärendets
  smala läge med flikar.
- **Fokus**: synlig fokusring på allt som går att nå med Tab. Dialoger och paneler (Radix)
  håller fokus inne medan de är öppna och lämnar tillbaka det när de stängs. Efter ett byte av
  vy från kommandopaletten hamnar fokus i huvudinnehållet.
- **Uppläsning**: handledarens svar meddelas när det börjar skrivas och när det är klart
  (inte ord för ord), nya handlingar och händelser i diariet läses upp ("Nytt i diariet: …"),
  och kommandopaletten säger hur många träffar sökningen gav.
- **Kontrast**: färgtokens kontrolleras automatiskt
  (`apps/desktop/src/components/ui/contrast.test.ts`): text minst 4,5:1 och fokusring minst
  3:1 mot alla ytor, i ljust och mörkt läge.
- **Rörelse**: med systeminställningen "reducerad rörelse" stängs animationer och mjuk
  rullning av.
- **Klickytor**: knappar och länkar är minst 24 × 24 px eller har luft runt sig.

Genomgången görs med axe (`@axe-core/playwright`) på alla vyer i ljust och mörkt läge, med
paletten, hjälpen, handledaren, en öppen handling och en ritning, ärendet i smalt läge och
quizen.
