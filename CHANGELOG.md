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

[Oförsläppt]: https://github.com/sockulags/Bygglov-studieapp/commits/master
