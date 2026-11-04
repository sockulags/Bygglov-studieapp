# Installera Bygglov-studieapp på Windows

Det här gör du **en gång**. Efter det uppdaterar appen sig själv: när det finns en ny version
visas en ruta överst i appen, du trycker på **Uppdatera nu** och appen startar om med den nya
versionen.

Det tar ungefär fem minuter. Du behöver en dator med Windows 10 eller Windows 11 och
internet. Du behöver **inte** vara administratör på datorn.

> Skärmbilderna läggs in när den första versionen är släppt. Varje ruta nedan som börjar
> med **Skärmbild** visar var bilden ska sitta och vad den ska visa.

## 1. Öppna release-sidan

Öppna länken du fått, eller gå till

**<https://github.com/sockulags/Bygglov-studieapp/releases/latest>**

Överst står versionsnumret (till exempel *Bygglov-studieapp v0.1.0*) och en lista över vad som
är nytt.

> **Skärmbild 1:** Release-sidan på GitHub med versionsrubriken och avsnittet *Assets*.
> <!-- docs/bilder/installera/01-release-sidan.png -->

## 2. Ladda ner installationsfilen

Scrolla ner till rubriken **Assets** (klicka på den om listan är hopfälld) och klicka på filen
som slutar på **`_x64-setup.exe`**, till exempel

`Bygglov-studieapp_0.1.0_x64-setup.exe`

Ladda **inte** ner filerna som slutar på `.sig` eller `latest.json`. De används bara av appens
uppdaterare.

> **Skärmbild 2:** Listan *Assets* med filen `…_x64-setup.exe` markerad.
> <!-- docs/bilder/installera/02-assets.png -->

### Om webbläsaren varnar för filen

Edge kan skriva att filen *"inte laddas ner ofta"*. Det beror bara på att appen är ny och har
få användare.

1. Håll muspekaren över nedladdningen och klicka på **…** (tre punkter).
2. Välj **Behåll**.
3. Klicka på **Visa mer** och sedan **Behåll ändå**.

> **Skärmbild 3:** Edges nedladdningsruta med menyn *Behåll*.
> <!-- docs/bilder/installera/03-edge-behall.png -->

## 3. Starta installationen

Öppna den nedladdade filen, till exempel genom att klicka på den i webbläsarens
nedladdningslista eller dubbelklicka på den i mappen **Hämtade filer**.

## 4. Klicka förbi SmartScreen ("Windows skyddade datorn")

Första gången visar Windows en blå ruta: **Windows skyddade datorn**. Det är väntat. Appen är
inte "signerad" med ett köpt certifikat, och då varnar Windows för alla program från okända
utgivare. Det betyder inte att något är fel med filen.

1. Klicka på den understrukna texten **Mer info**.

   > **Skärmbild 4:** SmartScreen-rutan *Windows skyddade datorn* med länken *Mer info*
   > inringad.
   > <!-- docs/bilder/installera/04-smartscreen-mer-info.png -->

2. Nu syns en ny knapp längst ner. Klicka på **Kör ändå**.

   > **Skärmbild 5:** Samma ruta efter *Mer info*, med knappen *Kör ändå* inringad.
   > <!-- docs/bilder/installera/05-smartscreen-kor-anda.png -->

Ser du ingen knapp *Kör ändå*, utan bara *Kör inte*? Då har datorn strängare inställningar,
till exempel en jobb- eller skoldator. Se *Om något går fel* längst ner.

## 5. Följ installationsguiden

Installationsguiden är på svenska.

1. Klicka **Nästa** och sedan **Installera**.
2. Vänta någon minut. Om datorn saknar Microsoft Edge WebView2 (ovanligt på Windows 10 och 11)
   hämtar installationen den automatiskt.
3. Låt rutan **Starta Bygglov-studieapp** vara ikryssad och klicka på **Slutför**.

> **Skärmbild 6:** Installationsguidens sista sida med *Starta Bygglov-studieapp* ikryssad.
> <!-- docs/bilder/installera/06-installationsguide-klar.png -->

Appen installeras bara för ditt Windows-konto och kräver inget administratörslösenord.

## 6. Klart

Appen öppnas och visar **Hem**. Nästa gång hittar du den i **Start-menyn** under
*Bygglov-studieapp*. Fäst den gärna i aktivitetsfältet: högerklicka på ikonen medan appen är
öppen och välj **Fäst i aktivitetsfältet**.

> **Skärmbild 7:** Appen öppen på Hem, och ikonen i Start-menyn.
> <!-- docs/bilder/installera/07-appen-hem.png -->

## Så fungerar uppdateringarna

- Appen letar efter en ny version strax efter att den startat och sedan var sjätte timme.
- När det finns en ny version visas rutan **En ny version finns. Uppdatera nu?** överst, med
  en lista över vad som är nytt.
- Klicka **Uppdatera nu**. Appen hämtar uppdateringen, stänger sig och startar om av sig själv.
  Ingen SmartScreen-varning visas vid uppdateringar.
- Klickar du **Senare** frågar appen igen vid nästa kontroll. Du kan också söka själv under
  **Inställningar → Uppdateringar → Sök nu**.
- Efter uppdateringen visas **Vad är nytt** en gång.

Dina svar, resultat och ärenden finns kvar efter en uppdatering.

> **Skärmbild 8:** Uppdateringsrutan *En ny version finns* överst i appen.
> <!-- docs/bilder/installera/08-uppdateringsrutan.png -->

## Om något går fel

| Det här händer | Gör så här |
| --- | --- |
| Det finns ingen knapp *Kör ändå* i SmartScreen-rutan | Datorn har låsta inställningar (vanligt på jobb- och skoldatorer). Installera på en privat dator, eller be den som sköter datorn om hjälp. |
| Webbläsaren tar bort filen direkt | Följ stegen under *Om webbläsaren varnar för filen*. Fungerar det inte, prova en annan webbläsare. |
| Uppdateringen säger *Uppdateringen gick inte att hämta* | Kontrollera internet och klicka **Försök igen**. Hjälper inte det: ladda ner den senaste installationsfilen från release-sidan och installera den ovanpå. Inget försvinner. |
| Appen startar inte efter installationen | Starta om datorn och försök igen från Start-menyn. Hör av dig till storebror med en bild på eventuellt felmeddelande. |

## Avinstallera

**Inställningar → Appar → Installerade appar → Bygglov-studieapp → … → Avinstallera.**
Exportera gärna din studiedata först (**Inställningar → Data → Exportera** i appen) om du vill
kunna ta med den till en ny installation.
