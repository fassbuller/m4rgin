// Gemeinsames Datenmodell für einen gefundenen Titel (eine Ausgabe).

export interface Titel {
  quelle: 'dnb' | 'openlibrary' | 'manuell';
  id?: string; // DNB-IDN o. ä.
  titel: string;
  autoren: string[];
  verlag?: string;
  ort?: string;
  jahr?: string;
  isbn?: string;
  umfang?: string; // z. B. "317 S." (DNB dc:format)
  einband?: string; // z. B. "Broschur", "Pp." (aus DNB-ISBN-Feld)
  neupreis?: number; // deutscher Neupreis laut DNB, falls angegeben
  sprache?: string;
  /** DNB-Sachgruppen, z. B. ["830 Deutsche Literatur", "B Belletristik"] – oft mehrere, bei Altbestand manchmal leer */
  sachgruppen?: string[];
  coverUrl?: string;
}

export const titelKurz = (t: Titel): string =>
  [t.autoren[0], t.titel].filter(Boolean).join(': ');

export const titelZeile2 = (t: Titel): string =>
  [t.verlag, t.ort, t.jahr].filter(Boolean).join(' · ');
