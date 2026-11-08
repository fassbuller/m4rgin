// Preisvergleich per Link: Es gibt keine offenen Preis-APIs bei eurobuch/booklooker/ZVAB.
// Die App öffnet die Suche mit vorausgefüllter ISBN (oder Titel/Autor), die Nutzer:in liest
// den günstigsten Gesamtpreis ab und tippt ihn ein.
// Platzhalter: {isbn}, {suche} (Autor + Titel, URL-kodiert)
// Die Vorlagen sind in den Einstellungen änderbar, falls eine Seite ihr URL-Schema ändert.

import { Titel } from './titel';

export interface LinkVorlage {
  name: string;
  isbn: string; // Vorlage mit {isbn}
  text: string; // Vorlage mit {suche}
}

export const STANDARD_LINKS: LinkVorlage[] = [
  {
    name: 'eurobuch',
    // ⚠ Muster nicht live geprüft – beim ersten Test kontrollieren
    isbn: 'https://www.eurobuch.com/buch/isbn/{isbn}.html',
    text: 'https://www.eurobuch.com/buch/suche.html?search={suche}',
  },
  {
    name: 'booklooker',
    // ISBN-Muster geprüft (07.11.2026); Textsuche nicht geprüft
    isbn: 'https://www.booklooker.de/B%C3%BCcher/Angebote/isbn={isbn}',
    text: 'https://www.booklooker.de/B%C3%BCcher/Angebote/titel={suche}',
  },
  {
    name: 'ZVAB',
    // ⚠ Muster nicht live geprüft (AbeBooks-Schema)
    isbn: 'https://www.zvab.com/servlet/SearchResults?isbn={isbn}',
    text: 'https://www.zvab.com/servlet/SearchResults?kn={suche}',
  },
];

export function vergleichsLink(v: LinkVorlage, t: Titel): string {
  if (t.isbn) return v.isbn.replace('{isbn}', t.isbn);
  const nachname = t.autoren[0]?.split(',')[0] ?? '';
  const suche = encodeURIComponent(`${nachname} ${t.titel}`.trim());
  return v.text.replace('{suche}', suche);
}
