// Vorgabe der Testversion: gemeinsamer Geräte-Schlüssel für den Test-Haven (Lennys Entscheidung, 15.11.2026:
// Testpersonen bekommen Marktpreise ohne Koppeln; ein einzelnes Handy lässt sich dafür nicht mehr sperren – nur
// der gemeinsame Schlüssel als Ganzes, in Haven unter „Geräte (m4rgin)“).
//
// Gesetzt wird sie NUR beim Bauen der Testversion: scripts/expo-update.ps1 (Kanal „laden“) bzw.
// scripts/apk-preview.ps1 lesen den Schlüssel aus firestream2/_secrets/tester/m4rgin_gemeinsam.txt und reichen ihn
// als EXPO_PUBLIC_HAVEN_* an Metro; der Wert steht nie im Repo, in app.json oder eas.json.
// Entwicklungs- und Produktions-Builds haben keine Vorgabe (Variablen leer → null).
// ⚠ Was im Bundle steht, lässt sich aus der App auslesen – deshalb nur für den Teststand.

import type { HavenZugang } from './lib/haven';

declare const process: { env: Record<string, string | undefined> };

// Metro ersetzt nur wörtliche Zugriffe auf process.env.EXPO_PUBLIC_… – nicht umschreiben
const ADRESSE = process.env.EXPO_PUBLIC_HAVEN_ADRESSE;
const SCHLUESSEL = process.env.EXPO_PUBLIC_HAVEN_SCHLUESSEL;

export const TEST_HAVEN: HavenZugang | null =
  ADRESSE && SCHLUESSEL && /^https?:\/\//i.test(ADRESSE) ? { adresse: ADRESSE, schluessel: SCHLUESSEL, preise: true } : null;

/** Nur der Host für die Anzeige („laden.kasse-test.fun“) – nie den Schlüssel zeigen */
export const TEST_HAVEN_NAME: string | null = TEST_HAVEN ? TEST_HAVEN.adresse.replace(/^https?:\/\//i, '').replace(/\/.*$/, '') : null;
