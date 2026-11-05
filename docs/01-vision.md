# 01 · Vision och avgränsning

## Syfte

Hjälpa en studerande på YH-utbildningen till bygglovshandläggare att plugga på *riktiga* saker:
inte bara memorera paragrafer, utan träna det faktiska hantverket. Ta emot en ansökan, bedöma om
den är komplett, läsa ritningar mot planbestämmelser, höra grannar, fatta beslut med korrekt
motivering och lagstöd, och hantera det som händer efter beslutet.

## Användare

| Roll | Vem | Behov |
| --- | --- | --- |
| Studerande | Student på en YH-utbildning, inte teknisk | Plugga 20–60 min i taget, tydlig progression, aldrig behöva "fixa" något tekniskt |
| Handledare | Erfaren bygglovshandläggare | Se studentens beslut och resonemang, ge återkoppling, bidra med riktiga case |
| Utvecklare | Den som underhåller appen | Snabbt kunna släppa nya versioner och nytt innehåll, låg driftbörda |

## Principer

1. **Verklighetstroget framför gamifierat.** Handlingar ser ut som handlingar. Beslut skrivs som
   beslut. Progression och streaks finns, men diskret och vuxet.
2. **Lagrum överallt.** Varje facit, varje förklaring, varje case-händelse pekar på kapitel och
   paragraf (PBL, PBF, Boverkets föreskrifter, FL m.fl.). Det är så studenten kommer bli bedömd i verkligheten.
3. **Handledaren är facit, appen är träningspartner.** Appen ger omedelbar återkoppling där det finns ett
   entydigt rätt svar. För ärenden, där bedömning krävs, ger appen struktur, checklistor och en
   första återkoppling, men den verkliga värderingen gör handledaren.
4. **Noll friktion för användaren.** Installeras en gång, uppdaterar sig själv, fungerar offline,
   sparar allt lokalt.
5. **Innehåll är data, inte kod.** Frågor och ärenden skrivs i enkla textfiler (YAML/Markdown) som
   handledaren och utvecklaren kan skriva tillsammans utan att röra appkoden.

## Vad appen innehåller (sammanfattning)

- **Plugga**: quiz och instuderingsfrågor per ämnesområde, med repetition av det studenten är svag på.
- **Ärenden**: simulerade bygglovsärenden med diarium, handlingar, bedömningssteg, beslut och
  händelser som inträffar efter beslut (komplettering, grannyttrande, överklagande, tillsyn).
- **Uppslag**: snabbreferens till lagrum, begrepp och processkartor.
- **Mina resultat**: historik, svaga områden och export av beslut till handledaren.
- **Studiehjälp**: en AI-handledare som förklarar, förhör och ger första återkoppling på
  beslutsutkast (fas 3, se roadmap).

## Avgränsningar

- Inte en officiell utbildningsresurs. Alla fastigheter, personer, kommuner och planer är
  påhittade. Lagtexter refereras men appen är inte rättskälla.
- Ingen inloggning eller molnlagring i första versionerna. All data lokalt på studentens dator.
- Inget mobilstöd i första versionerna. Desktop (Windows och/eller macOS) först.
- Inte ett ärendehanteringssystem. Vi efterliknar flödet i ett sådant men bygger inte ett.

## Framgångsmått

- Studenten öppnar appen självmant flera gånger i veckan.
- Studenten klarar ärenden som handledaren bedömer som "godkänt beslut" i stigande svårighetsgrad.
- Nya versioner kommer fram utan att någon behöver hjälpa till.
