// „Zuletzt angesehen“ unter der Suche von Hand: aus dem Log die jüngsten Bücher, jedes nur einmal.

import { norm } from './wiki';

export interface ZuletztQuelle {
  id: number;
  zeit: string;
  suchbegriff: string;
  isbn: string | null;
  titel: string | null;
  autor: string | null;
  endpreis: number | null;
  aktion: 'gesucht' | 'ausgepreist' | 'verworfen';
}

/**
 * Nur Einträge mit erkanntem Titel oder ISBN – reine Suchen speichern die DNB-Abfrage („tit=… and per=…“),
 * die niemand wiedererkennt. Neueste zuerst, doppelte Bücher (gleiche ISBN oder gleicher Titel) nur einmal.
 */
export function zuletzt<T extends ZuletztQuelle>(eintraege: T[], anzahl = 8): T[] {
  const gesehen = new Set<string>();
  const out: T[] = [];
  for (const e of [...eintraege].sort((a, b) => b.id - a.id)) {
    if (!e.titel && !e.isbn) continue;
    const schluessel = e.isbn ?? norm(`${e.titel} ${e.autor ?? ''}`);
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    out.push(e);
    if (out.length >= anzahl) break;
  }
  return out;
}
