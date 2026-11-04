# Ändringslogg

Här står allt som ändras i Bygglov-studieapp, version för version. Texten under varje version
visas i appen under "Vad är nytt" efter en uppdatering och som beskrivning på GitHub-releasen,
så skriv den för den som pluggar, inte för den som programmerar.

Formatet följer [Keep a Changelog](https://keepachangelog.com/sv/1.1.0/) och versionerna följer
[semantisk versionering](https://semver.org/lang/sv/). Rubrikerna under en version är
**Nytt**, **Ändrat**, **Rättat** och **Borttaget**. Hur en version släpps står i
[docs/release-checklista.md](docs/release-checklista.md).

## [Oförsläppt]

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

[Oförsläppt]: https://github.com/sockulags/Bygglov-studieapp/compare/v0.1.0...master
[0.1.0]: https://github.com/sockulags/Bygglov-studieapp/releases/tag/v0.1.0
