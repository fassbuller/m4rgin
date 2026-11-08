// Wert eines Stapels, aufgeteilt nach Ziel: Laden (Grabbelkiste + Regal) und Lager.
// Lager-Preise sind vorläufig – dort wird erst in Ruhe begutachtet.

import { Kategorie } from './preis';

export interface StapelWert {
  gesamt: number;
  laden: number;
  lager: number;
  je: Record<Kategorie, { anzahl: number; summe: number }>;
}

export type Sortierung = 'kategorie' | 'preis' | 'zeit';

export interface StapelGruppe<T> {
  /** null = keine Gruppierung (nach Preis oder Zeit sortiert) */
  kategorie: Kategorie | null;
  anzahl: number;
  summe: number;
  data: T[];
}

/**
 * Liste für den Stapel-Reiter. Standard: nach Kategorie gruppiert in der Reihenfolge, in der man die
 * Bücher wegträgt (Grabbelkiste, Regal, Lager), innerhalb in Scan-Reihenfolge (neueste oben).
 */
export function stapelGruppen<T extends { id: number; kategorie: Kategorie | null; endpreis: number | null }>(
  eintraege: T[],
  sortierung: Sortierung = 'kategorie',
): StapelGruppe<T>[] {
  const neuesteZuerst = [...eintraege].sort((a, b) => b.id - a.id);
  const summe = (l: T[]) => l.reduce((s, e) => s + (e.endpreis ?? 0), 0);
  if (sortierung !== 'kategorie') {
    const data = sortierung === 'preis' ? [...neuesteZuerst].sort((a, b) => (b.endpreis ?? 0) - (a.endpreis ?? 0)) : neuesteZuerst;
    return data.length ? [{ kategorie: null, anzahl: data.length, summe: summe(data), data }] : [];
  }
  return (['grabbel', 'regal', 'lager'] as Kategorie[])
    .map((k) => {
      const data = neuesteZuerst.filter((e) => (e.kategorie ?? 'regal') === k);
      return { kategorie: k, anzahl: data.length, summe: summe(data), data };
    })
    .filter((g) => g.anzahl > 0);
}

export function stapelWert(eintraege: { kategorie: Kategorie | null; endpreis: number | null }[]): StapelWert {
  const je: StapelWert['je'] = {
    grabbel: { anzahl: 0, summe: 0 },
    regal: { anzahl: 0, summe: 0 },
    lager: { anzahl: 0, summe: 0 },
  };
  for (const e of eintraege) {
    // Ohne Kategorie (alte Einträge) zählt das Buch zum Regal
    const k = je[e.kategorie ?? 'regal'];
    k.anzahl++;
    k.summe += e.endpreis ?? 0;
  }
  const laden = je.grabbel.summe + je.regal.summe;
  return { gesamt: laden + je.lager.summe, laden, lager: je.lager.summe, je };
}
