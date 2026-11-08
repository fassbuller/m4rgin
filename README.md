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
- **Trends:** eigene Marktverläufe, Wikipedia-Interesse, Neuauflagen.
- **KI (optional, lokal):** Ollama für Titelseiten und Kurzbeschreibungen.
- Zugangsdaten liegen im sicheren Speicher des Geräts, nicht in der Datenbank.

## Entwickeln

```bash
npm install
npm test            # Fachlogik (node:test)
npx tsc --noEmit    # Typprüfung
```

**iPhone (Expo Go):** `powershell -ExecutionPolicy Bypass -File scripts\expo-tunnel.ps1` – fragt einen Expo-Zugangstoken ab, startet Metro mit Tunnel. In Expo Go fehlt nur die Titelseiten-Texterkennung.

**Android (eigener Build):** `powershell -ExecutionPolicy Bypass -File scripts\android-build.ps1 -Neu` (nach SDK-Updates oder neuen nativen Paketen `-Neu`, für den Emulator `-Abi x86_64`). Das Skript umgeht per `subst` das Leerzeichen im Windows-Benutzerpfad, das der Android-NDK nicht verträgt, und nutzt JDK 17.

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
- Android-Build auf SDK 58 schlägt noch fehl (vermutlich das Texterkennungs-Paket).
- Audit mit Testmatrix: `AUDIT-2026-11-08.md`.
