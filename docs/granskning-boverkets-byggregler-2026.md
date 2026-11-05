# Granskning mot e-boken *Boverkets byggregler* (2026)

Granskad 2026-11-05. Boken (Svensk Byggtjänst, 355 sidor) återger PBL, PBF, Boverkets nio nya
föreskrifter (BFS 2024:4, 2024:6–2024:13) och BBR 31 (BFS 2024:14) i lydelsen den 1 januari 2026.
Boken ligger i repots rot och är undantagen i `.gitignore`. Den är upphovsrättsskyddad, så
ingenting i appen ska kopieras därifrån.

Sidnummer nedan är PDF-sidor. Den tryckta sidsiffran är ett lägre.

> **Uppdaterat samma dag.** Boken visar läget den 1 januari 2026. Vid hämtning från Boverket
> visade det sig att **BBR upphävdes den 1 oktober 2026** genom BFS 2026:9, och att BFS 2026:4 om
> hållbar mobilitet har tillkommit. Det som står nedan om att BBR 31 finns kvar gäller alltså
> bara bokens lydelse. Appen följer dagens läge, se `docs/rattslage/README.md`. Förslagen i
> avsnitt 2 och 3 är genomförda, utom ärendehändelser och ritningsuppgifter.

## Sammanfattning

- **PBL och PBF i appen är nyare än boken.** Boken är ändrad t.o.m. SFS 2025:1079 (PBL) och
  SFS 2025:980 (PBF). Appens texter i `docs/rattslage/` är ändrade t.o.m. SFS 2026:1583 och
  2026:1722. Varje skillnad mellan bok och app beror på 2026 års ändringar, och där har appen
  rätt. Ingen PBL- eller PBF-skillnad visade att appen är föråldrad.
- **Det största felet gäller Boverkets byggregler.** Appen säger att BBR är ersatt och att bara
  de nya föreskrifterna gäller från 1 juli 2026. Det stämmer inte helt: BBR finns kvar som
  BBR 31 (energihushållning m.m.), och övergångsregeln beror på när ansökan kom in.
- **Appen lär inte ut de nya föreskrifterna.** Det saknas en källa för dem i `docs/rattslage/`,
  och författarreglerna förbjuder hänvisning till avsnitt. Bostäders lämplighet, tillgänglighet
  och tomter, som prövas redan vid bygglov, finns knappt med.
- **Boken har egna fel** (se sist). Använd den som läsbok, inte som ensam källa.

## 1. Fel i appen som bör rättas

Ordnade efter hur mycket de påverkar facit eller vad studenten lär sig.

1. **BBR beskrivs som helt ersatt.** `content/fragor/07-krav-byggnadsverk.yaml:11-12` (huvud),
   `:116` och `:124-125` (krav-005), `docs/02-innehall.md:103-104` och
   `docs/rattslage/README.md:108`.
   - BBR finns kvar som *Boverkets byggregler (2011:6) – föreskrifter och allmänna råd (BBR 31)*
     med avsnitt 1 (inledning, ändring av byggnader), 2 (allmänna regler) och 9
     (energihushållning). Se s. 328 och avsnittsrubrikerna fram till s. 353.
   - Övergången (BFS 2024:14, övergångsbestämmelserna punkt 2–3, s. 354): äldre regler **får**
     tillämpas om ansökan om bygglov eller anmälan kommer in före 1 juli 2026, eller om arbeten
     utan lov eller anmälan påbörjas före dess. I så fall ska **alla** äldre regler tillämpas
     tillsammans. Om bygglov gavs före 1 juli 2025 **ska** de äldre reglerna tillämpas.
   - Distraktorn "BBR gäller fortfarande, men avsnittsnumren har ändrats" i krav-005 är delvis
     sann och bör bytas.
   - Förslag på ny formulering: "Det mesta av BBR har ersatts av nio nya föreskrifter (BFS 2024:4
     och 2024:6–2024:13). BBR 31 finns kvar för energihushållning. Äldre regler får tillämpas,
     men bara alla tillsammans, om ansökan eller anmälan kom in före 1 juli 2026."

2. **"Boverkets byggregler består av föreskrifter och allmänna råd".**
   `content/fragor/02-pbl-systemet.yaml:660` (sys-028).
   - Allmänna råd finns bara kvar i BBR 31, BFS 2024:6 (bärförmåga) och BFS 2024:7 (brand).
     BFS 2024:4 och 2024:8–2024:13 har inga allmänna råd. Kontrollerat med textsökning i
     varje föreskrift.
   - `07-krav-byggnadsverk.yaml:927-928` (krav-039) säger att det är vanligt att avvika från de
     allmänna råden. Det går bara där sådana finns. Förklaringen nämner också bara dispens och
     missar regeln om *mindre avvikelse* som finns i nästan varje ny föreskrift (punkt 5 nedan).

3. **A004, avgiften för att ta byggnaden i bruk före slutbesked.**
   `content/arenden/A004-tillsyn-garage-tallen-9/arende.yaml:16-17, 246-247, 259`,
   `handlingar/modell-beslut.md:96-98` och `handlingar/modell-kommunicering.md:42`.
   - Facit räknar sanktionsarean som 40 − 15 = 25 kvm och hänvisar till PBF 9 kap. 18 § andra
     stycket. Den paragrafen säger bara att det som sägs om sanktionsarea "i stället" ska avse
     den area som tas i bruk (`docs/rattslage/pbf-9-kap.txt:185-187`). Avdraget på 15 kvm står
     inte där.
   - Bokstavligt läst blir det 40 kvm och 5 328 kr i stället för 25 kvm och 4 440 kr.
   - **Inte avgjort.** Boverkets vägledning säger att den ibruktagna arean ersätter arean i
     beräkningen, men inte om 15 kvm ska dras av. Beloppet är därför oförändrat. Ärendet anger
     nu att avdraget är en tolkning, och frågan står i `docs/07-roadmap.md`.

4. **A005, avsteg från tillgänglighet.**
   `content/arenden/A005-restaurang-kopparslagaren-3/arende.yaml:560` och `:573-574`.
   - Facit säger att avsteg bara får göras om det är uppenbart oskäligt, och att varsamhet ensam
     inte räcker. Men PBF 3 kap. 23 § (`docs/rattslage/pbf-3-kap.txt:208-213`) tillåter
     anpassning med hänsyn till varsamhet och förvanskning, och *därutöver* vid ombyggnad bara
     om det är uppenbart oskäligt. BFS 2024:12 4 kap. 1 § (s. 318) räknar upp sju grunder för
     anpassning, och varsamhet och förvanskning är de två första.
   - Utfallet (ramp och automatisk dörröppnare) är rätt. Bara resonemanget behöver ändras:
     "Varsamhet kan vara skäl för anpassning, men här går båda kraven att uppfylla."

5. **Rumsstorlekar.** `07-krav-byggnadsverk.yaml:593` (krav-026) säger att rumsstorlekar och
   planlösning preciseras i Boverkets byggregler. BFS 2024:11 har inga rumsareor, bara
   funktionskrav (2 kap. 1 §, s. 306–307). De enda siffrorna är att matlagning får delas av
   högst tolv personer och ett rum för personhygien av högst tre boendeenheter (2 kap. 7–8 §§,
   s. 307).

6. **Hänvisningar som inte stöder påståendet.**
   - `07-krav-byggnadsverk.yaml:687`: "Fukt och ventilation" hänvisas till PBF 3 kap. 9 § 6, men
     punkt 6 gäller bara fukt. Ventilation nämns inte i 9 §. Raden 684 ("varje krav i 8 kap. 4 §
     preciseras i 3 kap.") stämmer inte för avfall.
   - `09-genomforande.yaml:816`: certifieringskravet hänvisas till PBF 7 kap. 2 §, som i dag
     bara säger att certifieringen är tidsbegränsad.
   - `A004 .../handlingar/pm-byggsanktionsavgift.md:27`: regeln om noll eller negativ
     sanktionsarea saknar stöd i PBF 1 kap. 7 §. Raderna 52–53 nämner halvering bara vid
     bygglov, men PBF 9 kap. 3 a § gäller även fullgjord anmälan.
   - `content/uppslag/begrepp.yaml:719-722`: nockhöjd definieras inte i PBF 1 kap.
   - `A005 .../handlingar/remissvar-miljoenheten.md:27-28`: BFS 2024:10 har ingen särskild
     kategori för restauranger, bara raden "från lokaler till bostäder" (tabell 2:1, s. 297).

7. **Författarregler och visionsdokument som är inaktuella.** `content/README.md:27`
   ("hänvisa aldrig till BBR-avsnitt"), `docs/04-design.md:97` (register över BBR-kapitel) och
   `docs/01-vision.md:23`. Med de nya föreskrifterna bör man hänvisa till BFS-nummer, kapitel
   och paragraf, till exempel "BFS 2024:12 2 kap. 4 §".

## 2. Sådant som saknas, med förslag

Förslag, inte fakta. Varje regel är kontrollerad i boken på angiven sida.

1. **Den nya strukturen och övergången.** Nio föreskrifter plus BBR 31, och en övergångsregel
   som beror på när ansökan kom in. Handläggare kommer att möta ärenden under båda regelverken
   2026–2027.
   - Fråga: "En ansökan kom in 20 juni 2026 och beslutas i augusti. Måste de nya reglerna
     tillämpas?" (Nej, äldre regler får tillämpas, men bara samlat.)
   - Uppslag: en post per föreskrift med titel och vad den preciserar i PBF 3 kap.
2. **Utformningskrav prövas vid bygglov, tekniska egenskapskrav vid startbesked.** BFS 2024:11
   och 2024:12 har ett kapitel 2 med utformningskrav och ett kapitel 3 med tekniska
   egenskapskrav (s. 306, 308, 315–317). Det motsvarar precis uppdelningen i PBL 9 kap. och
   10 kap., och borde vara en grundfråga i modul 07.
3. **Bostäders lämplighet (BFS 2024:11).** Bostadsfunktioner, avskiljbar del av rum,
   boendeenheter med gemensamma funktioner (högst tolv per kök, högst tre per rum för
   personhygien), studentbostäder och att föreskriften inte gäller fritidshus med högst två
   bostäder (1 kap. 2 §, s. 304).
   - Ritningsuppgift: "Finns plats för alla bostadsfunktioner?"
   - Händelse i ett ärende: ett kollektivboende där fyra boendeenheter delar ett
     hygienrum.
4. **Tillgänglighet (BFS 2024:12).** Rullstolsmått och vändyta, ramp högst 1:12, hiss vid
   nivåskillnad över 1 m, tillgänglig entréplan, tillgängligt hygienrum, de sju grunderna för
   anpassning vid ändring och hiss vid större ändring av flerbostadshus (s. 313–318).
   - Ritningsuppgift: en ramp i 1:15 vid entrén.
   - Para ihop: varje anpassningsgrund med ett exempel.
5. **Mindre avvikelse.** Finns i BBR 31 avsnitt 1:21 och i alla nya föreskrifter utom BFS 2024:4
   och 2024:7 (i 2024:13 bara för vissa paragrafer). Villkoren är särskilda skäl, att byggnaden
   ändå blir tekniskt tillfredsställande och att det inte finns avsevärd olägenhet. Skälen ska
   dokumenteras i samband med projekteringen. Bokens läsanvisning säger att nämnden medger
   avvikelsen, men det står inte i föreskrifterna, så vem som avgör behöver kontrolleras innan
   det blir en fråga.
6. **Tomter (BFS 2024:13).** Angöringsplats inom 25 m gångavstånd från en tillgänglig entré,
   möjlighet att ordna minst en tillgänglig parkeringsplats, uppställning för räddningsfordon
   högst 50 m från byggnadens angreppspunkter, skydd vid pooler och brunnar och fast
   lekutrustning (s. 322–326). Prövas vid bygglov.
   - Ritningsuppgift: en situationsplan där angöringen ligger 35 m från entrén.
7. **Brand vid bygglov (BFS 2024:7).** Byggnadsklasser, skydd mot brandspridning mellan
   byggnader och undantaget för komplementbyggnader på högst 15 m² byggnadsarea till en- och
   tvåbostadshus (6 kap. 10 §, s. 251). Placeringen på situationsplanen kan göra brandskyddet
   omöjligt.
   - A001: förrådet är 28 kvm och ligger nära huset, så undantaget gäller inte. Ett lärandemål
     om detta kunde läggas till, men vilken regel som då gäller behöver kontrolleras.
8. **Buller inomhus (BFS 2024:10).** Appen lär ut utomhusvärdena enligt förordningen om
   trafikbuller, men inte inomhuskraven (tabell 2:8, s. 300–301) eller ljudisolering mellan
   lokaler och bostäder.
9. **Energi (BBR 31 avsnitt 9).** Undantag för bostadshus som används mindre än fyra månader om
   året (9:11, s. 338), primärenergital och krav vid ändring (9:9).
   - Sant eller falskt: "Energikraven försvann när BBR ersattes."
10. **Mindre luckor.** Barnsäkerhet vid fönster, trappor och räcken (BFS 2024:9 2 kap.), radon
    högst 200 Bq/m³ (BFS 2024:8 3 kap. 2 §, s. 271) och kontrollreglerna i varje föreskrift, som
    passar modul 09 och kontrollplanen.

## 3. Förslag på struktur

1. **Hämta Boverkets föreskrifter från boverket.se** till en ny mapp
   `docs/rattslage/boverket/`, med källa och datum, på samma sätt som PBL-texterna. Inte från
   boken. Det som behövs:
   - BFS 2024:4, 2024:6, 2024:7 (med BFS 2025:10), 2024:8, 2024:9, 2024:10, 2024:11, 2024:12 och
     2024:13
   - BFS 2011:6 i lydelsen enligt BFS 2024:14 (BBR 31)
   - Gärna BFS 2020:5 (föreskrifter om detaljplan), som modul 04 och 08 redan bygger på
2. **Byt författarregeln** i `content/README.md:27` till "hänvisa till BFS-nummer, kapitel och
   paragraf; BBR 31 bara för energi och avsnitt 1–2".
3. **Uppslag:** en post per föreskrift i `lagar.yaml` (i dag finns bara en samlad post på rad
   138), och begrepp som mindre avvikelse, anpassning vid ändring, byggnadsklass,
   angöringsplats, angreppspunkt, boendeenhet och avskiljbar del av rum.
4. **Lägg till PBF 10 kap.** i `docs/rattslage/`. `02-pbl-systemet.yaml:7` säger att
   kapitlet kontrollerats mot riksdagen.se, men filen saknas.
5. **Städa `docs/rattslage/pbf-9-kap.txt`.** Radbrytningar ger rader som ser ut som
   paragrafrubriker ("3 a §", "24 §") mitt i andra paragrafer, till exempel rad 41, 72, 108 och
   186. Det kan lura den som söker i filen.

## 4. Bekräftat utan anmärkning

- Alla belopp och formler för byggsanktionsavgifter i PBF 9 kap. 1–24 och 26 §§ är identiska i
  boken och appen. Uträkningarna i A004, A007, A008 och modul 10 är rätt räknade, med reservation
  för tolkningsfrågan i punkt 3 ovan.
- Ingen av de cirka 335 PBF-hänvisningarna på paragrafnivå i `content/` pekar på en paragraf som
  inte finns.
- Påståendena om de stora förändringarna i PBL 9 kap. i `docs/rattslage/README.md` stämmer mot
  boken: areor, höjder, frister, underrättelse, kungörelse och giltighetstid.
- Brand (krav-027), räcken och fukt (krav-030), radon (`11-angransande.yaml:778-783`), aktsamhet
  (gen-043), poolskydd (A008) och räddningstjänstens yttrande i A006 stämmer mot föreskrifterna.

## 5. Fel och brister i boken

Bra att känna till om boken används i studierna.

- **PBL 8 kap. 12 § har fel text** (s. 58). Där står marklovsregeln om trädfällning och
  skogsplantering, och den riktiga 12 § om allmänna platser saknas. Bokens egna hänvisningar
  till 8 kap. 12 § (9 kap. 56–59 §§, 11 kap. 19 §) blir därför obegripliga.
- **Förordet och läsanvisningen stämmer inte med föreskrifterna.** Förordet säger att de
  allmänna råden har utgått, men BBR 31, BFS 2024:6 och 2024:7 har kvar allmänna råd.
  Läsanvisningen kallar EKS det enda systemet för bärförmåga, men BFS 2024:6 upphäver EKS
  (s. 215).
- **PBF 6 kap. 3 §** står två gånger med samma text, en gång som upphörande och en gång som
  ikraftträdande 2027-12-01 (s. 146–147). Enligt riksdagens text upphävs paragrafen.
- **PBF 3 kap.:** ändringarna genom förordning 2025:627 (studentbostäder, 5 a–5 b, 12 a och
  19 a–19 b §§) saknas, trots att boken säger att den är ändrad t.o.m. 2025:980.
- **Allt som ändrades 2026 saknas**, till exempel byggbedömare, avfallshanteringsplan,
  "hållbar mobilitet" i stället för laddning av elfordon, de nya fristerna för solceller och
  värmepumpar (9 kap. 99–99 a §§) och att handlingar ska lämnas fem arbetsdagar före det
  tekniska samrådet (10 kap. 18 §).

## Hur granskningen gjordes

Texten togs ut ur PDF:en per avsnitt. PBL och PBF jämfördes paragraf för paragraf med
`docs/rattslage/`. Alla PBF-hänvisningar i `content/` kontrollerades med skript och för hand. De
tekniska påståendena i `content/` söktes fram med nyckelord och kontrollerades mot respektive
föreskrift. De fynd som ändrar facit eller lärandemål är kontrollerade en gång till direkt i
texten. Påståenden som boken inte täcker (till exempel trafikbullerförordningen, BFS 2020:5 och
Boverkets vägledning) är inte bedömda.
