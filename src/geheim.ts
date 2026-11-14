// Passwörter und Schlüssel gehören nicht in die SQLite-Datei (Klartext, landet in Backups),
// sondern in den Schlüsselbund (iOS) bzw. Keystore (Android). Die übrigen Einstellungen bleiben in SQLite.

import * as SecureStore from 'expo-secure-store';
import { Einstellungen } from './einstellungen';

/** Welche Felder geheim sind – Pfad im Einstellungs-Objekt. */
const GEHEIM = {
  booklookerSchluessel: (e: Einstellungen) => e.booklooker.apiKey,
  eurobuchPasswort: (e: Einstellungen) => e.eurobuch.passwort,
  ebaySecret: (e: Einstellungen) => e.ebay.clientSecret,
  kiSchluessel: (e: Einstellungen) => e.ki.apiKey,
  googleSchluessel: (e: Einstellungen) => e.googleBooksKey,
  havenSchluessel: (e: Einstellungen) => e.haven.schluessel,
} as const;
type GeheimName = keyof typeof GEHEIM;

// Schlüsselnamen aus der Zeit als „Bleistift“ – umbenennen würde gespeicherte Passwörter verlieren
const schluessel = (n: GeheimName) => `bleistift.${n}`;

/** Kopie ohne Geheimnisse – das ist, was in SQLite gespeichert wird. */
export function ohneGeheimnisse(e: Einstellungen): Einstellungen {
  return {
    ...e,
    booklooker: { ...e.booklooker, apiKey: '' },
    eurobuch: { ...e.eurobuch, passwort: '' },
    ebay: { ...e.ebay, clientSecret: '' },
    ki: { ...e.ki, apiKey: '' },
    googleBooksKey: '',
    haven: { ...e.haven, schluessel: '' },
  };
}

/** Geheimnisse aus dem sicheren Speicher einsetzen. Ältere Stände hatten sie noch im JSON – die bleiben, bis neu gespeichert wird. */
export async function mitGeheimnissen(e: Einstellungen): Promise<Einstellungen> {
  const lies = async (n: GeheimName, bisher: string) => {
    try {
      return (await SecureStore.getItemAsync(schluessel(n))) ?? bisher;
    } catch {
      return bisher; // Schlüsselbund gesperrt o. ä. → mit dem weiterarbeiten, was da ist
    }
  };
  return {
    ...e,
    booklooker: { ...e.booklooker, apiKey: await lies('booklookerSchluessel', e.booklooker.apiKey ?? '') },
    eurobuch: { ...e.eurobuch, passwort: await lies('eurobuchPasswort', e.eurobuch.passwort) },
    ebay: { ...e.ebay, clientSecret: await lies('ebaySecret', e.ebay.clientSecret) },
    ki: { ...e.ki, apiKey: await lies('kiSchluessel', e.ki.apiKey) },
    googleBooksKey: await lies('googleSchluessel', e.googleBooksKey),
    haven: { ...e.haven, schluessel: await lies('havenSchluessel', e.haven?.schluessel ?? '') },
  };
}

export async function geheimnisseSpeichern(e: Einstellungen): Promise<void> {
  for (const n of Object.keys(GEHEIM) as GeheimName[]) {
    const wert = GEHEIM[n](e);
    if (wert) await SecureStore.setItemAsync(schluessel(n), wert);
    else await SecureStore.deleteItemAsync(schluessel(n));
  }
}
