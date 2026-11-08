// Gemeinsames Modell für Marktangebote aus allen Preisquellen + Zusammenfassung.
// Grundsatz „nachvollziehbar“: Jede Zahl, die die App zeigt, lässt sich auf konkrete Angebote zurückführen.

export type QuellenId = 'booklooker' | 'eurobuch' | 'ebay';

export const QUELLEN_NAME: Record<QuellenId, string> = { booklooker: 'booklooker', eurobuch: 'eurobuch', ebay: 'eBay' };

export interface Angebot {
  quelle: QuellenId;
  plattform: string; // z. B. "ZVAB", "AbeBooks", "eBay"
  haendler?: string;
  preis: number; // Artikelpreis in EUR
  versand: number; // Versand in EUR (echt oder geschätzt)
  versandGeschaetzt: boolean;
  gesamt: number; // preis + versand
  zustandText?: string;
  jahr?: string;
  erstausgabe?: boolean;
  signiert?: boolean;
  gebunden?: boolean;
  land?: string;
  url?: string;
  titel?: string; // wie beim Anbieter angegeben (zur Kontrolle, ob es dasselbe Buch ist)
  /** Neubuch eines Händlers (Amazon, Thalia …) → Buch ist noch lieferbar */
  neu?: boolean;
}

export interface QuellenStatus {
  quelle: QuellenId;
  ok: boolean;
  anzahl: number;
  fehler?: string;
  ms: number;
}

export interface Marktlage {
  anzahl: number;
  min: number | null;
  median: number | null;
  max: number | null;
}

export interface MarktErgebnis {
  angebote: Angebot[]; // sortiert nach Gesamtpreis
  status: QuellenStatus[];
  lage: Marktlage;
  zeit: string;
}

export function median(werte: number[]): number | null {
  if (werte.length === 0) return null;
  const s = [...werte].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return Math.round((s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) * 100) / 100;
}

export function marktlage(angebote: Angebot[]): Marktlage {
  const g = angebote.map((a) => a.gesamt);
  return {
    anzahl: g.length,
    min: g.length ? Math.min(...g) : null,
    median: median(g),
    max: g.length ? Math.max(...g) : null,
  };
}

/** Günstigstes Angebot als Anker – mit Ausreißer-Hinweis, wenn es weit unter dem Median liegt. */
export function ankerAngebot(angebote: Angebot[]): { anker: Angebot | null; ausreisser: boolean } {
  if (angebote.length === 0) return { anker: null, ausreisser: false };
  const anker = angebote[0];
  const med = median(angebote.map((a) => a.gesamt));
  return { anker, ausreisser: angebote.length >= 4 && med != null && anker.gesamt < med * 0.5 };
}

export interface PreisQuelle {
  id: QuellenId;
  aktiv: boolean;
  suche(anfrage: { isbn?: string; titel?: string; autor?: string }): Promise<Angebot[]>;
}

/**
 * Dasselbe Angebot kann über eurobuch UND direkt (z. B. booklooker) kommen.
 * Doppelte (gleiche Plattform, gleicher Händler, gleicher Preis) werden zusammengeführt;
 * bevorzugt wird der Eintrag mit echtem Versand.
 */
export function entdoppeln(angebote: Angebot[]): Angebot[] {
  const map = new Map<string, Angebot>();
  for (const a of angebote) {
    const k = `${a.plattform.toLowerCase()}|${(a.haendler ?? '').toLowerCase()}|${a.preis.toFixed(2)}`;
    const vorhanden = map.get(k);
    if (!vorhanden || (vorhanden.versandGeschaetzt && !a.versandGeschaetzt)) map.set(k, a);
  }
  return [...map.values()];
}

/** Alle aktiven Quellen parallel abfragen. Fällt eine aus, laufen die anderen weiter. */
export async function marktAbfragen(
  quellen: PreisQuelle[],
  anfrage: { isbn?: string; titel?: string; autor?: string },
  timeoutMs = 12000,
): Promise<MarktErgebnis> {
  const aktive = quellen.filter((q) => q.aktiv);
  const ergebnisse = await Promise.all(
    aktive.map(async (q) => {
      const start = Date.now();
      try {
        const angebote = await mitTimeout(q.suche(anfrage), timeoutMs);
        return { angebote, status: { quelle: q.id, ok: true, anzahl: angebote.length, ms: Date.now() - start } };
      } catch (e) {
        return {
          angebote: [] as Angebot[],
          status: { quelle: q.id, ok: false, anzahl: 0, fehler: String((e as Error)?.message ?? e), ms: Date.now() - start },
        };
      }
    }),
  );
  const angebote = entdoppeln(ergebnisse.flatMap((e) => e.angebote)).sort((a, b) => a.gesamt - b.gesamt);
  return {
    angebote,
    status: ergebnisse.map((e) => e.status),
    lage: marktlage(angebote),
    zeit: new Date().toISOString(),
  };
}

function mitTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Zeitüberschreitung')), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

export const runde2 = (n: number) => Math.round(n * 100) / 100;
