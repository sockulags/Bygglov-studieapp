# Ändringslogg

Här står allt som ändras i Bygglov-studieapp, version för version. Texten under varje version
visas i appen under "Vad är nytt" efter en uppdatering och som beskrivning på GitHub-releasen,
så skriv den för den som pluggar, inte för den som programmerar.

Formatet följer [Keep a Changelog](https://keepachangelog.com/sv/1.1.0/) och versionerna följer
[semantisk versionering](https://semver.org/lang/sv/). Rubrikerna under en version är
**Nytt**, **Ändrat**, **Rättat** och **Borttaget**. Hur en version släpps står i
[docs/release-checklista.md](docs/release-checklista.md).

## [Oförsläppt]

Inget ännu.

## [0.5.0] - 2026-11-05

### Nytt

- 96 nya frågor, så att det nu finns 622. Varje modul har fått mellan fyra och åtta nya, med fler
  vardagliga "vad gör du?"-situationer, para ihop- och ordningsfrågor. I Ritningsläsning och
  beräkning finns de två första frågorna där du mäter direkt i en ritning: ritningen visas
  ovanför svarsfältet med zoom och mätverktyget (tryck M), och den finns kvar när du går igenom
  frågorna efter passet.
- Tre nya ärenden, så att det nu finns nio. På Rönnen 11 vill ägarna installera en braskamin och
  ansluta huset till kommunalt vatten och avlopp. Det är en anmälan, inte en ansökan om lov, och
  ärendet slutar med att du ger ett startbesked. På Eken 2 ska en pool grävas ner och tre ekar
  fällas: du prövar marklov, väger in ett arboristutlåtande och en grannes synpunkter och avslår
  fällningen av de friska ekarna. Vid Kvarnbacken söker ett par förhandsbesked för två tomter nära
  en gammal kvarn och en fornlämning, och en granne överklagar beslutet.
- Ritningarna kan visa träd som ska bevaras eller fällas, en pool, befintliga och nya
  markhöjder, nya tomtgränser vid en avstyckning, fornlämningar och grannbyggnader med namn, som
  kvarnen. Planritningen kan visa en kamin och en VA-servis.
- Beslutsformuläret har ett nytt utfall, Ge startbesked. Kontrollen tittar då på det som ett
  startbesked ska innehålla: att kontrollplanen fastställs, vilka handlingar som behövs inför
  slutbeskedet, att det nya inte får användas före slutbesked och hur länge startbeskedet gäller.

### Ändrat

- En anmälan har fyra veckors handläggningstid i stället för tio, och fristen kan förlängas med
  högst fyra veckor (6 kap. 5 § PBF). Rubrikraden, diariet och avgiften räknar med det.
- Beslutet heter efter vad ansökan gäller. I ett marklovsärende väljer du "Bevilja marklov", och
  i ett förhandsbesked "Ge positivt förhandsbesked". Ett förhandsbesked kontrolleras mot det som
  9 kap. 104 § kräver (att det gäller i två år och inte betyder att bygget får börja), inte mot
  reglerna för ett bygglov.

### Rättat

- Överklagandehänvisningen i besluten ber inte längre klaganden att underteckna skrivelsen.
  Förvaltningslagen kräver ingen underskrift (43 §); det räcker att ange beslutet, ändringen
  man vill ha och namn, adress och telefonnummer.
- Ordningslagen finns i lagregistret, så att hänvisningen om poolens säkerhet på Eken 2
  (3 kap. 5 §) går att slå upp.
- Ett meddelande i diariet som anger sista dag för beslut visar nu datumet även när samma
  händelse gör ansökan komplett. Tidigare kunde det stå en kod i stället för datumet.

## [0.4.0] - 2026-11-05

### Nytt

- Alla 13 moduler har nu frågor: 526 frågor i stället för 98. Nya är Förvaltningsrätt och
  myndighetsrollen, PBL-systemet och begreppen, Detaljplan och planenlighet, Prövning utanför
  detaljplan, Krav på byggnadsverk, Ritningsläsning och beräkning, Genomförandet, Tillsyn och
  sanktioner, Angränsande lagstiftning, Överklagande och prövningskedjan och Kommunikation och
  bemötande. Snabbquiz, modulgenomgång, repetition och tentaläge fungerar i alla.
- Tre nya ärenden, så att det nu finns sex. Tallen 9 är ditt första tillsynsärende: en granne
  anmäler att garaget byggts större än lovet, och du gör platsbesök, räknar ut
  byggsanktionsavgiften, bemöter ägarnas invändningar och skriver nämndens beslut.
  Kopparslagaren 3 handlar om en restaurang i ett kulturhistoriskt värdefullt hus i centrum,
  och på Humlan 3 ska ett flerbostadshus byggas med balkonger över prickmarken. Där överklagar en
  granne, och du skriver nämndens yttrande till länsstyrelsen.
- Ett tillsynsärende har ingen tioveckorsfrist. Fristen börjar först när ägarna söker lov i
  efterhand, och rubrikraden säger det.
- Mätverktyg i ritningarna: tryck M eller Mät och klicka på två punkter för att mäta ett
  avstånd, eller välj Yta och klicka runt en yta. Punkterna fastnar i hörn och linjer, och
  måtten följer med när du zoomar.
- Ritningarna kan visa mer: det som byggts utan lov med kryss, lovets kontur, parkeringsplatser,
  balkonger, fönster som tas bort eller är nya, skyltar, ventilationskanaler och platta tak.
  Plankartan visar våningsantal och egna bestämmelser som m₁.
- Kommandopalett: tryck Ctrl + K var du än är och skriv vad du söker, till exempel en modul, ett
  ärende, ett begrepp eller "9:60". Därifrån kan du också starta ett snabbquiz eller fråga
  handledaren.
- Kortkommandon överallt: g och sedan h, p, ä, u eller r byter vy, / söker och ? visar alla
  kortkommandon.
- Åtta nya begrepp i ordlistan, bland annat sanktionsarea, lov i efterhand, laglighetsprövning
  och gatukostnadsersättning, och fyra nya lagar i lagregistret.

### Ändrat

- Röd och grön text är lite mörkare, så att den syns bättre mot ljusa ytor.
- Det syns bättre var du är när du använder tangentbordet, och skärmläsare får veta när något
  nytt kommer in i diariet.

## [0.3.0] - 2026-11-05

### Nytt

- Fråga handledaren: en AI-handledare som kan plan- och bygglagen som den gäller från den
  1 december 2025. Efter varje svar i Plugga kan du be den förklara djupare, förklara varför ett
  alternativ är fel eller ge dig en liknande fråga. Den anger lagrum, säger när den är osäker
  och skickar bedömningsfrågor vidare till pappa.
- I ärendet kan du fråga handledaren om det du har framför dig, till exempel vad den hade
  tittat på först. Den ser handlingarna och var du är, men avslöjar inte facit innan du lämnat
  in beslutet.
- Första återkoppling på ditt beslut: i jämförelsen med modellbeslutet går handledaren igenom
  ditt beslut mot modellbeslutet och bedömningspunkterna, innan du skickar det till pappa.
- På Hem kan du fråga handledaren vad du borde repetera, eller be den förhöra dig.
- Inställningar → Studiehjälp: klistra in API-nyckeln du fått av storebror och testa att den
  fungerar. Nyckeln sparas i Windows och syns aldrig igen. Där väljer du också modell, ser vad
  frågorna har kostat och sätter ett dagligt tak (20 kr från början).
- Uppslag på riktigt: alla paragrafer i 9 kap. PBL med en mening om vad de säger och lagtexten
  ett klick bort, en ordlista med 140 begrepp och fyra processkartor där du klickar på ett steg
  för att se vad som händer, vilka frister som gäller och vilka lagrum steget bygger på. Tryck
  `/` för att söka, till exempel "9:60" eller "nockhöjd".
- Mina resultat visar hur det går över tid: hur väl du kan varje modul dag för dag, hur många
  svar du ger per dag, vilka ämnen du oftast missar och hur dina beslut klarat kontrollerna.
  Varje diagram kan visas som tabell.
- Ärenden: du kan förlänga tidsfristen en gång, med skäl, som 9 kap. 99 § andra stycket
  tillåter.
- Ärenden: ett ärende kan förklaras vilande i väntan på till exempel strandskyddsdispens
  (9 kap. 102 §). Då står fristen still. Ärendet vid Långsjön visar hur det går till.
- Datumen i ärendenas texter följer ditt eget ärende: kungörelsedag, sista dag att överklaga
  och liknande räknas från dagen du fattade beslutet.

### Ändrat

- Ett frivilligt lov räknas som ett godtagbart beslut i ärendet på Lärken 4, inte som ett fel.
- Grå text är lite mörkare överallt, så att den blir lättare att läsa.

## [0.2.0] - 2026-11-04

### Nytt

- Ärenden: nu kan du handlägga riktiga (fiktiva) bygglovsärenden från ansökan till beslut.
  Tre ärenden finns, ett per nivå: ett förråd nära tomtgränsen på Lärken 4, en tillbyggnad
  med liten avvikelse på Björken 7 och ett nytt hus vid Långsjön utanför detaljplan.
- Ärendevyn ser ut som på kontoret: diariet till vänster, handlingen i mitten och ditt arbete
  till höger. Handlingarna ser ut som handlingar, med INKOM-stämpel, och ritningarna går att
  zooma och flytta.
- Ärendet lever: kompletteringar kommer in, grannar hör av sig, Trafikverket svarar och någon
  överklagar. Vad som händer beror på vad du gör, till exempel om du förelägger om
  komplettering eller hoppar över grannarna.
- Tiden går i ärendet. Rubrikraden visar dagens datum och hur många dagar som är kvar av
  tioveckorsfristen. Beslutar du för sent ska avgiften sättas ned.
- Sex sorters uppgifter: checklistor, frågor, beräkningar på ritningarna, vilka grannar som ska
  underrättas, skrivelser du jämför med en modelltext och själva beslutet.
- Beslutet skriver du i en beslutsmall med förhandsvisning som ett riktigt beslut. Efteråt ser
  du ditt beslut bredvid modellbeslutet, vad appen kontrollerat med lagrum, bedömningspunkter
  att bocka av och en ruta för egna reflektioner.
- Exportera till handledare: skicka beslutsrapporten till pappa som PDF, som fil eller som
  text att klistra in i ett sms eller mejl. Hans bedömning skriver du in i appen, och då blir
  ärendet "Bedömt".
- Hem föreslår ärendet du håller på med eller nästa ärende att ta dig an.
- Mina resultat visar dina ärenden per status, dina inlämnade beslut och handledarens
  bedömningar.
- Uppslag tar med lagrummen från ärendena, och du kan visa bara dem.

## [0.1.0] - 2026-11-04

### Nytt

- Första versionen av studieappen, med Hem, Plugga, Ärenden, Uppslag, Mina resultat och
  Inställningar.
- Plugga: snabbquiz (tio slumpade frågor), modulgenomgång (alla frågor i ordning), repetition,
  instudering med öppna frågor och tentaläge med tidsgräns.
- Alla frågetyper: flerval, flersvar, sant/falskt, lucktext, para ihop, ordning, beräkning och
  öppna frågor där du jämför med facit och bockar av vad du fick med.
- Efter varje svar: förklaring, lagrum och en markering om frågan ännu inte är granskad av
  handledaren. Lagrum som inte är kontrollerade visas med ett frågetecken.
- Siffertangenterna svarar och Enter går vidare, så att du kan plugga utan mus.
- Efter passet ser du rätt och fel per fråga och kan öva på felen direkt.
- Repetition som lär sig vad du kan: frågor du missar kommer tillbaka snart, frågor du kan
  kommer tillbaka allt mer sällan.
- Hem visar var du var, hur många frågor som väntar på repetition, din streak och hur väl du
  behärskar varje modul. Mina resultat visar senaste pass och de ämnen du oftast missar.
- 98 frågor om lovplikt (modul 3) och handläggningsprocessen (modul 6) enligt plan- och
  bygglagen som den gäller från den 1 december 2025.
- Ärenden: en förhandstitt på vilka ärenden som kommer. Själva ärendevyn kommer i nästa version.
- Uppslag: modulernas lagrum i korthet och ett register över alla paragrafer som frågorna
  hänvisar till, med sök.
- Inställningar: ljust och mörkt läge, tre textstorlekar, sök efter uppdatering, exportera och
  importera din studiedata och börja om från början.
- Appen uppdaterar sig själv. När en ny version finns visas en ruta överst, och efter
  uppdateringen ser du vad som är nytt.

[Oförsläppt]: https://github.com/sockulags/Bygglov-studieapp/compare/v0.5.0...master
[0.5.0]: https://github.com/sockulags/Bygglov-studieapp/releases/tag/v0.5.0
[0.4.0]: https://github.com/sockulags/Bygglov-studieapp/releases/tag/v0.4.0
[0.3.0]: https://github.com/sockulags/Bygglov-studieapp/releases/tag/v0.3.0
[0.2.0]: https://github.com/sockulags/Bygglov-studieapp/releases/tag/v0.2.0
[0.1.0]: https://github.com/sockulags/Bygglov-studieapp/releases/tag/v0.1.0
