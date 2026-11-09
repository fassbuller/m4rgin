# m4rgin – Auspreis-Helfer für Hennwack

App für den Ladenbetrieb der Buchgenossenschaft Hennwack: Buch scannen → Titel, Marktlage, nachvollziehbarer Preisvorschlag nach den Hennwack-Regeln, Seltenheit – und ab auf den Stapel. Eine Codebasis für **Android und iOS** (Expo SDK 58, React Native 0.88). Früherer Arbeitsname: „Bleistift“.

## Ablauf

1. **Scannen:** ISBN-Barcode, Titelseite fotografieren (Texterkennung) oder Suche von Hand.
2. **Während der Suche** steht das Buch unten, das Rädchen dreht sich bei der Preisabfrage.
3. **Erkannt** → das Buch springt als **Karte** in die Mitte: Bronze (gewöhnlich), Silber (gefragt), Gold (selten), Schwarz (Rarität). Gold und Schwarz mit Enthüllung und Vibration. Karten neigen sich leicht mit dem Handy.
4. **Antippen** = auspreisen (Zustand, Merkmale, Rechnung mit jedem Zu- und Abschlag) · **wegwischen** = weiter.
5. **Stapel:** nach Grabbelkiste / Regal / Lager gruppiert, Gesamtwert, CSV-Export. Tablets: Scanner und Stapel nebeneinander („Theke“).

## Preisquellen und Daten

- **Titel:** Deutsche Nationalbibliothek, sonst Open Library. Cover: DNB → Google Books → Open Library.
- **Markt:** booklooker, eurobuch (ZVAB, AbeBooks …), eBay – parallel, inkl. Versand.
- **Prüfung vor dem Preis:** Mängelexemplare, Hörbücher/CDs, Sets, nur Umschläge, teurer Auslandsversand, ignorierte Händler und – bei Titelsuche – fremde Titel/Autoren werden aussortiert (sichtbar, zurückholbar). Doppelte Exemplare (ZVAB + AbeBooks) zählen einmal. Ausreißer nach unten und Großhändler (momox, rebuy …) werden als Vergleich übergangen; im Laden ab 4 Angeboten zählt das Mittel der zwei günstigsten. Ausfallende Quellen bekommen einen zweiten Versuch, ISBN-Suchen ohne Treffer laufen noch einmal mit der ISBN-10.
- **Konfidenz-Ampel** (grün/gelb/rot) aus Angebotszahl, Streuung, Quellen, Suchart und Ausgabe. Bei Rot gibt es keine Gold-/Schwarz-Enthüllung.
- **Korrektur-Protokoll:** Preis von Hand geändert, anderer Vergleich, Angebot aussortiert → gespeichert und in den Einstellungen ausgewertet.
- **Trends:** eigene Marktverläufe, Wikipedia-Interesse, Neuauflagen.
- **KI (optional, lokal):** Ollama für Titelseiten und Kurzbeschreibungen.
- Zugangsdaten liegen im sicheren Speicher des Geräts, nicht in der Datenbank.

## Entwickeln

```bash
npm install
npm test            # Fachlogik (node:test) inkl. Testset
npm run testset     # Bericht: Preis alt (ohne Prüfung) gegen neu, je Testfall
npx tsc --noEmit    # Typprüfung
```

**Testset** (`test/testset/*.json`): Marktlagen mit erwartetem Preisbereich. Neue Fälle entstehen in der App über „Als Testfall teilen“ im Preis-Blatt (JSON ohne Links) und werden einfach als Datei abgelegt. Die mitgelieferten Fälle in `konstruiert.json` sind erfundene, aber typische Problemfälle.

**iPhone (Expo Go):** `powershell -ExecutionPolicy Bypass -File scripts\expo-tunnel.ps1` – fragt einen Expo-Zugangstoken ab, startet Metro mit Tunnel. In Expo Go fehlt nur die Titelseiten-Texterkennung.

**Testen ohne laufenden PC (EAS Update):** `powershell -ExecutionPolicy Bypass -File scripts\expo-update.ps1` – fragt den Expo-Token ab und veröffentlicht den aktuellen Stand im Kanal `laden` (Laufzeit `exposdk:58.0.0`). In Expo Go öffnen: `exp://u.expo.dev/8ca9cd0f-3043-41a2-8d15-32f0ca9aea2f?channel-name=laden&runtime-version=exposdk:58.0.0`. Nach jeder Änderung das Skript erneut ausführen; Expo Go lädt den neuen Stand beim nächsten Öffnen. Das Skript nutzt `.tmp/` im Projekt als Temp-Ordner, weil Hermes nicht nach `AppData\Local\Temp` schreiben darf.

**Android (eigener Build):** `powershell -ExecutionPolicy Bypass -File scripts\android-build.ps1 -Neu` (nach SDK-Updates oder neuen nativen Paketen `-Neu`, für den Emulator `-Abi x86_64`). Voraussetzungen: JDK 17 (Temurin), im Android-SDK **CMake 3.31.6** (Android Studio → SDK Manager → SDK Tools; dessen ninja kann Pfade über 260 Zeichen) und unter Windows `LongPathsEnabled=1`.

Die nativen Ordner `android/` und `ios/` werden aus `app.json` erzeugt (`npx expo prebuild`) und nicht eingecheckt.

## Aufbau

```
App.tsx                    Reiter, Thekenmodus, Einführung
src/screens/               Scannen · Stapel · Verlauf · Einstellungen
src/components/            Karten (BuchKarte, MitteKarte, Feier), Preis-Blatt, Glanz/Neigung, Bausteine
src/lib/                   reine Logik ohne React – getestet
  preis.ts                 Preisrechnung (Markt, Zustand ±, Merkmale, Knappheit)
  seltenheit.ts            Stufen + Fehlalarm-Schutz
  quellen/                 booklooker, eurobuch, eBay
src/db.ts                  SQLite: Log, Stapel, Marktverlauf, Einstellungen
test/lib.test.ts
scripts/                   Android-Build, Expo-Tunnel
```

## Offen

- eurobuch: Treffer laut Bedingungen nach 3 Stunden löschen (bisher werden die Top-5 dauerhaft gespeichert).
- Audit mit Testmatrix: `AUDIT-2026-11-08.md`.
