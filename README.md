# Bleistift – Auspreis-Helfer für Hennwack (Prototyp 0.1)

Android-App für den Ladenbetrieb: Buch scannen oder Titelseite fotografieren → Titel, Genre, Marktlage, Trend und ein Preisvorschlag nach den Hennwack-Regeln. Arbeitsname „Bleistift“, weil Antiquariatspreise mit Bleistift ins Buch kommen.

Stand 07.11.2026. Logik getestet (26 Tests). Die App läuft auf dem Emulator (Android 16 / API 36): Kamera, Barcode, Texterkennung, Titeldaten, Marktpreise, Auspreisen, Stapel, Verlauf und CSV-Export sind durchgeklickt – siehe „Unsicherheiten“.

## Was ManaBox vorgemacht hat – und was daraus wurde

| ManaBox (Magic-Karten) | Bleistift (Bücher) |
|---|---|
| Karte erkennen am Artwork | ISBN-Barcode · Titelseite per Texterkennung · Suche von Hand · optional KI |
| Live-Infos noch während des Scannens | Live-Karte über der Kamera: Cover, Titel, Genre, Marktlage, ≈ Preis, Grabbel/Regal/Lager, Trend |
| Scan-Session mit Gesamtwert, überlebt Neustart | **Stapel** mit Summe, pausierbar, mehrere parallel, umbenennbar |
| Quick-Mode vs. strikt (Versionswahl) | Schnellmodus: 1 Treffer → direkt; sonst Ausgabe wählen. OCR-Zeilen per Tipp umordnen |
| Preise von Cardmarket, TCGplayer … | booklooker, eurobuch (ZVAB, AbeBooks …), eBay – parallel, eine Liste |
| Preistrend aus dem Cardmarket-Index | Für Bücher gibt es keinen solchen Index → drei eigene Signale (siehe unten) |
| Bulk-Edit im Scanner | ±0,50 € direkt im Ergebnis und im Stapel |

## Funktionen

- **Erkennen:** Barcode (EAN-13 → ISBN) · Foto der Titelseite (Texterkennung auf dem Handy, offline; ist eine ISBN im Bild, z. B. Impressum, wird direkt danach gesucht) · Suche von Hand · optional „KI fragen“.
- **Titeldaten:** Deutsche Nationalbibliothek (kostenlos, ohne Anmeldung), Ausweich: Open Library. Inklusive Einband und Neupreis, wenn die DNB ihn kennt.
- **Genre:** DNB-Sachgruppen, oft mehrere (z. B. „Deutsche Literatur“ + „Belletristik“). Die Firestream-Kategorien orientieren sich laut Backend-Plan an genau diesen Sachgruppen.
- **Markt (nachvollziehbar):** alle aktiven Quellen parallel, zusammengeführt, Dubletten entfernt, sortiert nach Gesamtpreis inkl. Versand. Jede Zeile zeigt Plattform, Händler, Zustand und einen Link aufs Angebot. Fällt eine Quelle aus, steht das da – der Rest läuft weiter. Ein anderes Angebot als Vergleich wählen: antippen.
- **Preisvorschlag:** siehe Regeln. Erklärt jede Rechnung in Klartext.
- **Stapel:** mehrere benannte Arbeitsvorräte, **einer aktiv, die anderen pausiert**. Tipp auf einen Chip wechselt, „Pausieren“ legt den aktuellen beiseite, „Umbenennen“ (oder langes Drücken eines Chips) ändert den Namen, „Abschließen“ löst den Stapel auf (Bücher bleiben im Verlauf). Ausgepreiste Bücher landen immer im aktiven Stapel; ist keiner aktiv, legt die App beim nächsten Auspreisen einen neuen an.
- **Buch im Stapel antippen:** Detailansicht mit Cover, ISBN, Genre, Trend, den gespeicherten Angeboten (Link zur Quelle) und der Rechnung. Dort lässt sich der **Zustand ändern** (Preis rechnet live neu), der **Markt neu abfragen** (frische Angebote, dann Regel-Anker) und mit „Übernehmen“ alles speichern; „Entfernen“ nimmt es aus dem Stapel.
- **Trend – drei Signale, jedes antippbar mit Quelle:**
  - *Preis ↗↘*: eigene Marktabfragen über die Zeit (Angebotszahl, günstigster Preis). Baut sich mit jeder Abfrage auf.
  - *Interesse ↗↘*: Wikipedia-Seitenaufrufe zu Werk/Autor:in, letzte 30 Tage gegen Jahresmittel (offizielle Wikimedia-API).
  - *Neuauflage*: neuere Ausgabe bei der DNB → drückt meist Gebrauchtpreise.
- **Log:** jede Suche, auch ohne Treffer oder ohne Auspreisen, mit Methode, Dauer, Marktlage, Vergleichsangebot, Top-5-Angeboten und Trend. Export als CSV (Excel/LibreOffice-tauglich: Semikolon, Dezimalkomma).

## Preisregeln (Standard, alles in den Einstellungen änderbar)

Zwei getrennte Regelsätze: **Laden** (Grabbelkiste/Regal) und **Lager**. Der Ladenpreis entscheidet, ob ein Buch überhaupt ins Lager geht – ab „Ins Lager ab“ rechnet die App mit den Lager-Regeln.

| Regel | Laden | Lager |
|---|---|---|
| Anker | günstigstes vergleichbares Angebot inkl. Versand | **zweitgünstigstes** vergleichbares Angebot |
| Vergleichbar heißt | gleiche Ausgabe (Jahr) | gleiche Ausgabe **und** gleicher Zustand |
| Abschlag je Zustand | wie neu 10 % · sehr gut 12,5 % · gut 15 % · akzeptabel 17,5 % · Mängel 20 % | 0 % · 2 % · 5 % · 7,5 % · 10 % |
| Merkmale | je −2,5 Punkte, nie unter 10 % | je −1 Punkt, nie unter 0 % |

Gemeinsam: **Neupreis als zweite Referenz** – gerechnet wird mit dem niedrigeren von Marktpreis und Neupreis, darauf der Zustandsabschlag (bei Neupreis-Referenz wird abgerundet) · selten ab ≤ 3 Angeboten · Raster 0,50 € kaufmännisch · Grabbelkiste 1 €/2 €, Regal ab 2,50 € · ab 15 € Ladenpreis ins Lager · Signiert/Erstausgabe → Prüfhinweis.

Beispiel Laden: günstigstes Angebot 12 € inkl. Versand, Zustand gut → −15 % = 10,20 € → **10,00 €, Regal**.
Beispiel Lager: günstigstes 18 €, zweitgünstigstes 22 € (beide gut) → Laden 15,30 € ≥ 15 € → ins Lager, Anker 22 € − 5 % = 20,90 € → **21,00 €**.
Beispiel Neupreis: Reclam-Band, neu 5,80 €, Markt 7,70 € → Referenz 5,80 € − 15 % (Gut) = 4,93 € → **4,50 €, Regal**; im Zustand Wie neu −10 % = 5,22 € → **5,00 €**.

Fehlt bei den Angeboten das Jahr oder der Zustand, lockert die App den Vergleich und schreibt das in die Erklärung („alle Ausgaben verglichen“). Dort steht immer, welches Angebot als Anker diente und mit welchem Regelsatz gerechnet wurde.

**Annahmen, die ich getroffen habe** (bitte prüfen): Abstufung der 10–20 % über die Zustände; Merkmale verkleinern den Abschlag statt Aufschläge obendrauf; „1/2 € Grabbelkiste“ heißt zwei Kisten; **Lagerpreis = zweitgünstigstes vergleichbares Angebot minus kleiner Zustandsabschlag (0–10 %)**, weil im Lager in Ruhe verkauft wird statt im Regal unterboten; **liegt der Neupreis unter dem Marktpreis, ist der Neupreis die Referenz** – der Zustandsabschlag gilt dann darauf, damit ein besserer Zustand weiterhin mehr bringt (bei 0,50er-Raster können benachbarte Zustände auf denselben Preis fallen). Der Neupreis stammt aus der DNB und ist dort der Stand der Katalogisierung – **oft veraltet** (Beispiel Reclam 7114: DNB 5,80 €, aktuell 6,40 €). Deshalb ist er im Auspreis-Sheet und in der Stapel-Detailansicht von Hand korrigierbar und wird mit dem Eintrag gespeichert.

## Bauen und aufs Handy bringen

Die Texterkennung (ML Kit) braucht einen nativen Build – **Expo Go reicht nicht**.

```bash
npm install
npx expo install --fix      # gleicht alle Paketversionen an die Expo-Version an
npm test                    # 26 Tests der Logik
```

**Weg A – APK über Expo (am einfachsten):** kostenloses Konto auf expo.dev, dann

```bash
npm install -g eas-cli
eas login
eas build -p android --profile preview
```

Am Ende kommt ein Link zur APK. Auf den Laden-Handys öffnen, „Installation aus unbekannten Quellen“ erlauben, fertig.

**Weg B – lokal:** Android Studio installieren, Handy per USB mit USB-Debugging anschließen, `npx expo run:android`.

### Einrichtung auf diesem Rechner (bereits erledigt)

Der Windows-Benutzerpfad enthält ein Leerzeichen (`C:\Users\Lennard Markus`). CMake schreibt für Ninja dann 8.3-Kurznamen, `clang++.exe` wird zu `CLANG_~1.EXE`, clang fällt in den C-Modus und linkt die libc++ nicht. Ergebnis:

```
ld.lld: error: undefined symbol: std::__ndk1::basic_string<…>
```

Deshalb liegt das SDK zusätzlich unter einem Pfad ohne Leerzeichen:

| Einstellung | Wert |
|---|---|
| SDK-Junction | `C:\Users\Public\asdk` → `C:\Users\Lennard Markus\AppData\Local\Android\Sdk` |
| `android/local.properties` | `sdk.dir=C:\Users\Public\asdk` |
| `ANDROID_HOME`, `ANDROID_SDK_ROOT` | `C:\Users\Public\asdk` (Benutzervariablen) |
| `JAVA_HOME` | `C:\Users\Lennard Markus\AppData\Local\Programs\Temurin\jdk-17.0.21+9` |

Dann genügt:

```powershell
npm run android      # baut, installiert, startet Metro
npm start            # nur Metro, wenn schon gebaut wurde
```

**Android Studio:** Settings → Languages & Frameworks → Android SDK → *Android SDK Location* ebenfalls auf `C:\Users\Public\asdk` setzen. Sonst schreibt Studio `local.properties` beim Sync auf den Pfad mit Leerzeichen zurück und der Linkerfehler kommt wieder.

**Häkchen, die sonst Zeit kosten:**

- **Neue native Abhängigkeit** (z. B. `npx expo install react-native-safe-area-context`): danach `android\build\generated\autolinking` löschen. Gradle sieht die geänderte `package.json` nicht als Eingabe an, behält die alte Paketliste und die App stürzt mit `Can't find ViewManager 'RNCSafeAreaProvider'` ab.
- **`app.json` (Icon, Splash, Berechtigungen):** Bei vorhandenem `android/`-Ordner landet das nicht automatisch im Build → `npx expo prebuild -p android` (Android Studio dabei geschlossen halten). Die Bilddateien erzeugt `assets/icon-quelle.js` aus einer SVG-Vorlage.
- **Metro:** `metro.config.js` hält `.cxx`- und `build`-Ordner aus dem Watcher. Sonst beendet sich Metro, wenn Gradle beim Linken Temp-Ordner löscht (`ENOENT … CMakeTmp`).
- **Emulator statt Handy:** Die Emulator-Kamera zeigt eine Beispielszene mit Barcode, damit lässt sich der Scanweg ohne Buch testen.

## Farben im Stapel (nach dem Ladenplan)

Die Zeilenfarbe zeigt, **in welches Fach** das Buch gehört – nicht die Preis-Kategorie. Die Farben stammen aus dem Grundriss:

| Bereich | Farbe | Fächer |
|---|---|---|
| Belletristik | Pink `#DC274C` | Belletristik A–Z |
| Krimi & Fantastik | Hellblau `#256DB5` | Krimi, Fantasy, SciFi |
| Geschichte | Dunkelblau `#14549C` | Geschichte, DDR, NS-Zeit, Bundesländer |
| Sachbuch | Orange `#E76535` | Mittelraum: Psychologie, Religion, Natur & Technik, Medizin, Musik, Sport, Film, Foto |
| Geist & Gesellschaft | Gelb `#EDCB33` | Philosophie, Soziologie, Politik, Wirtschaft, Recht, Literaturwissenschaft |
| Vorderraum | Grün `#378A4F` | Kunst & Architektur, Kinder & Jugend, Lyrik, Judaica |
| Grabbelkiste | Lila `#7B4FD6` | nicht im Plan – die 1–2-€-Kiste |

Zuordnung: die **erste** DNB-Sachgruppe entscheidet (Code wie „100 Philosophie“ oder „830 Deutsche Literatur“, sonst Stichwort); die Grabbelkiste schlägt alles. Das Etikett in der Zeile nennt das **konkrete Fach** („Psychologie“, „Philosophie“), die Farbe kommt vom Bereich. „Regal“ / „Ins Lager“ steht als neutrales Etikett daneben. Die Tabelle liegt in `src/lib/bereiche.ts` und lässt sich dort anpassen.

## Einrichten (Einstellungen)

1. **booklooker:** Partner-ID (pid) bei booklooker beantragen (Artikelsuche/Partnerprogramm). Kostenlos bis 50 Abfragen pro 10 Minuten. Liefert Versand nach DE, Zustand, gewerblich/privat.
2. **eurobuch:** vorbelegt mit dem öffentlichen Testzugang `test`/`test`. Für den echten Betrieb Zugang über das Affiliate-Programm beantragen und **schriftlich klären, ob die interne Nutzung erlaubt ist**. eurobuch nennt keine Versandkosten → Pauschale (Standard 3 €, als „geschätzt“ markiert).
3. **eBay (optional):** kostenloser Entwicklerzugang auf developer.ebay.com, Client-ID + Secret eintragen.
4. **„Quellen testen“** drücken: zeigt die Rohantwort jeder Quelle und wie viele Angebote erkannt wurden. Das ist der erste Test, bevor man den Zahlen traut.
5. **KI (optional):** jede OpenAI-kompatible Schnittstelle. Später das lokale Modell im Laden: Basis-URL z. B. `http://<IP>:11434/v1` (Ollama), Modell z. B. ein Qwen-Vision-Modell.

## Unsicherheiten – ehrlich

- **booklooker-Antwort:** Die Doku nennt nur `<DetailLinkUrl>`, nicht die übrigen Elementnamen. Der Parser sucht tolerant nach mehreren Namen. Beim ersten Test mit „Quellen testen“ prüfen, ob Preis und Versand stimmen; sonst in `src/lib/quellen/booklooker.ts` die Namen anpassen (eine Zeile).
- **eurobuch:** gegen die Doku gebaut, live nicht getestet (die Schnittstelle sperrt automatische Abrufe aus meiner Umgebung). Nutzungsbedingungen für interne Nutzung offen. Treffer sollen nach 3 Stunden gelöscht werden – wir speichern dauerhaft nur Kennzahlen und die Top-5 zum Zeitpunkt des Auspreisens im Log; auch das bei eurobuch abklären.
- **eBay:** Feldnamen und Bücher-Kategorie (267) aus Erfahrung, nicht live geprüft.
- **Paketversionen:** gebaut für Expo SDK 54. `npx expo install --fix` gleicht an. Bei neuerem SDK können sich `expo-camera`/`expo-file-system`-APIs leicht geändert haben.
- **Texterkennung:** kann keine Fraktur. Dafür ist der KI-Knopf gedacht.
- **Zugangsdaten** liegen im Prototyp im Klartext auf dem Handy. Für den echten Betrieb gehören sie in einen kleinen Dienst auf dem Laden-Rechner (siehe unten).
- **Wikipedia-Zuordnung** ist eine Suche nach dem besten Artikel – der Artikelname steht im Detail, bitte prüfen.
- **firestream2-Leitlinie „KI nur lokal“:** Der externe KI-Anbieter ist nur für den Prototyp gedacht.

## Erste Experimente (klein, vor allem anderen)

1. `npm test` – läuft die Logik bei dir?
2. App bauen, „Quellen testen“ – kommen echte Angebote an?
3. 20 Bücher aus dem Laden scannen, Log exportieren, Vorschläge mit dem Bauchgefühl der Leute an der Kasse vergleichen → Regeln justieren.

## Aufbau

```
App.tsx                      Reiter: Scannen · Stapel · Log · Einstellungen
src/screens/ScanScreen.tsx   Kamera, Live-Karte, Abläufe
src/components/PreisSheet    Auspreisen: Markt, Trend, Zustand, Merkmale, Ergebnis
src/dienste.ts               Titel finden, Markt, Trends, vorläufiger Preis
src/db.ts                    SQLite: Log, Stapel, Marktverlauf, Einstellungen, CSV
src/lib/                     reine Logik, ohne React – getestet
  preis.ts  isbn.ts  dnb.ts  openlibrary.ts  suche.ts  markt.ts  trend.ts  ki.ts  links.ts  csv.ts  bereiche.ts
  quellen/booklooker.ts  quellen/eurobuch.ts  quellen/ebay.ts
test/lib.test.ts
```

Neue Preisquelle = eine Datei in `src/lib/quellen/`, die `PreisQuelle` erfüllt, plus eine Zeile in `dienste.ts`.

## Vorschläge für danach

- **Preis-Dienst auf dem Laden-Rechner:** fragt die Quellen ab, verwahrt Zugangsdaten, hält die eurobuch-Regeln ein, puffert. Die App ruft dann nur noch diesen Dienst. Passt als eigener Dienst in firestream2.
- **„Ins Lager“ → Firestream:** Datensatz mit Titeldaten und Marktlage vorbereiten, damit die Aufnahme im Lager schneller geht.
- **Sachgruppen → Ladenregale:** einmalige Zuordnungstabelle, dann zeigt die App „gehört ins Regal Philosophie“.
- **Eigene Verkaufsdaten:** Was Hennwack selbst verkauft hat (booklooker/ZVAB, Kasse), ist die beste Preisquelle überhaupt – sobald Firestream sie liefert.
