// Wert eines Stapels, aufgeteilt nach Ziel: Laden (Grabbelkiste + Regal) und Lager.
// Lager-Preise sind vorläufig – dort wird erst in Ruhe begutachtet.

import { Kategorie } from './preis';

export interface StapelWert {
  gesamt: number;
  laden: number;
  lager: number;
  je: Record<Kategorie, { anzahl: number; summe: number }>;
}

export type Sortierung = 'kategorie' | 'raum' | 'preis' | 'zeit';

export interface StapelGruppe<T> {
  /** null = keine Gruppierung (nach Preis oder Zeit sortiert) bzw. Raum-Gruppe */
  kategorie: Kategorie | null;
  anzahl: number;
  summe: number;
  data: T[];
  /** Raum-Gruppen: Überschrift („Wintergarten“, „Raum unbekannt“) und Raumfarbe */
  titel?: string;
  farbe?: string;
}

/** Was die Raum-Sortierung von einem Raum wissen muss (aus dem Ladenplan) */
export interface RaumInfo {
  id: string;
  name: string;
  farbe: string;
  reihenfolge: number;
}

/**
 * Liste für den Stapel-Reiter. Standard: nach Kategorie gruppiert in der Reihenfolge, in der man die
 * Bücher wegträgt (Grabbelkiste, Regal, Lager), innerhalb in Scan-Reihenfolge (neueste oben).
 */
export function stapelGruppen<
  T extends { id: number; kategorie: Kategorie | null; endpreis: number | null; standort_raum?: string | null; standort_abteilung?: string | null },
>(eintraege: T[], sortierung: Sortierung = 'kategorie', raeume: RaumInfo[] = []): StapelGruppe<T>[] {
  const neuesteZuerst = [...eintraege].sort((a, b) => b.id - a.id);
  const summe = (l: T[]) => l.reduce((s, e) => s + (e.endpreis ?? 0), 0);
  if (sortierung === 'raum') {
    // Wegtrage-Reihenfolge: Grabbelkiste, dann die Räume wie im Ladenplan (innerhalb nach Abteilung),
    // dann Regal ohne bekannten Raum, zuletzt das Lager
    const kat = (e: T) => e.kategorie ?? 'regal';
    const gruppen: StapelGruppe<T>[] = [];
    const grabbel = neuesteZuerst.filter((e) => kat(e) === 'grabbel');
    if (grabbel.length) gruppen.push({ kategorie: 'grabbel', anzahl: grabbel.length, summe: summe(grabbel), data: grabbel });
    const regal = neuesteZuerst.filter((e) => kat(e) === 'regal');
    const bekannt = new Set(raeume.map((r) => r.id));
    for (const r of [...raeume].sort((a, b) => a.reihenfolge - b.reihenfolge)) {
      const data = regal
        .filter((e) => e.standort_raum === r.id)
        .sort((a, b) => (a.standort_abteilung ?? '').localeCompare(b.standort_abteilung ?? '', 'de') || b.id - a.id);
      if (data.length) gruppen.push({ kategorie: null, titel: r.name, farbe: r.farbe, anzahl: data.length, summe: summe(data), data });
    }
    const ohne = regal.filter((e) => !e.standort_raum || !bekannt.has(e.standort_raum));
    if (ohne.length) gruppen.push({ kategorie: null, titel: 'Raum unbekannt', anzahl: ohne.length, summe: summe(ohne), data: ohne });
    const lager = neuesteZuerst.filter((e) => kat(e) === 'lager');
    if (lager.length) gruppen.push({ kategorie: 'lager', anzahl: lager.length, summe: summe(lager), data: lager });
    return gruppen;
  }
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
