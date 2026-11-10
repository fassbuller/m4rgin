// Gemeinsames Modell für Marktangebote aus allen Preisquellen + Zusammenfassung.
// Grundsatz „nachvollziehbar“: Jede Zahl, die die App zeigt, lässt sich auf konkrete Angebote zurückführen.

import { angebotSchluessel, AussortiertesAngebot, pruefeAngebote, PruefKontext } from './pruefung';
import { isbn13zu10 } from './isbn';

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
  /** Autor laut Anbieter, getrennt vom Titel – für den Titelabgleich */
  autor?: string;
  /** Neubuch eines Händlers (Amazon, Thalia …) → Buch ist noch lieferbar */
  neu?: boolean;
}

export interface QuellenStatus {
  quelle: QuellenId;
  ok: boolean;
  anzahl: number;
  fehler?: string;
  ms: number;
  /** 2 = erst der zweite Versuch hat geklappt (oder ist auch gescheitert) */
  versuche?: number;
}

export interface Marktlage {
  anzahl: number;
  min: number | null;
  median: number | null;
  max: number | null;
}

export interface MarktErgebnis {
  /** Geprüfte Angebote, sortiert nach Gesamtpreis – nur diese zählen für Preis und Seltenheit */
  angebote: Angebot[];
  /** Aussortierte Angebote mit Grund (Mängelexemplar, anderes Buch …) – sichtbar, von Hand zurückholbar */
  aussortiert?: AussortiertesAngebot[];
  /** Hinweise der Prüfung, z. B. „Titelabgleich hätte alles aussortiert → nicht angewendet“ */
  hinweise?: string[];
  /** Per ISBN gesucht (zuverlässig) statt per Titel */
  ueberIsbn?: boolean;
  status: QuellenStatus[];
  /** Quellen, die gar nicht gefragt wurden (ausgeschaltet oder ohne Zugang) */
  aus?: QuellenId[];
  lage: Marktlage;
  zeit: string;
}

/** Fehlertext einer Quelle in zwei, drei Wörtern – der volle Text steht im Quellen-Test bzw. beim Antippen. */
export function kurzerFehler(fehler?: string): string {
  const f = fehler ?? '';
  if (/verweigert|no service|gesperrt/i.test(f)) return 'gesperrt';
  if (/zeitüberschreitung/i.test(f)) return 'antwortet nicht';
  if (/anmeldung|mit 401|mit 403/i.test(f)) return 'Zugang falsch';
  if (/network|netz/i.test(f)) return 'kein Netz';
  if (/mit 5\d\d/.test(f)) return 'Störung';
  return 'Fehler';
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
  /**
   * Bei 0 Treffern noch einmal mit der ISBN-10 fragen? (Standard: ja.) Aus bei Quellen mit knappem
   * Kontingent, die die ISBN-10 ohnehin selbst zuordnen – jede Nachfrage zählt dort mit.
   */
  isbn10Nachfrage?: boolean;
  suche(anfrage: { isbn?: string; titel?: string; autor?: string }): Promise<Angebot[]>;
}

/**
 * Dasselbe Angebot kann über eurobuch UND direkt (z. B. booklooker) kommen, und viele Antiquariate
 * stellen dasselbe Exemplar auf ZVAB und AbeBooks ein. Doppelte (gleicher Händler, gleicher Preis –
 * ohne Händlernamen zusätzlich gleiche Plattform) werden zusammengeführt; bevorzugt wird der Eintrag mit echtem Versand.
 * Sonst zählte ein Buch doppelt und wirkte weniger selten, als es ist.
 */
export function entdoppeln(angebote: Angebot[]): Angebot[] {
  const map = new Map<string, Angebot>();
  for (const a of angebote) {
    const h = (a.haendler ?? '').trim().toLowerCase();
    const k = h && h !== 'privat' ? `${h}|${a.preis.toFixed(2)}` : `${a.plattform.toLowerCase()}|${h}|${a.preis.toFixed(2)}`;
    const vorhanden = map.get(k);
    if (!vorhanden || (vorhanden.versandGeschaetzt && !a.versandGeschaetzt)) map.set(k, a);
  }
  return [...map.values()];
}

export interface MarktOptionen {
  timeoutMs?: number;
  /** Prüfkontext für die Angebote (ohne: alle Angebote gelten) */
  pruef?: Omit<PruefKontext, 'ueberIsbn'>;
  /** Pause vor dem zweiten Versuch einer zickenden Quelle */
  wiederholenNachMs?: number;
}

/**
 * Zugang falsch, Anfrage kaputt oder Quelle zu langsam: Ein zweiter Versuch ändert daran nichts
 * (eine überlastete Quelle wird beim zweiten Mal nicht schneller – nur die Wartezeit verdoppelt sich).
 * Wiederholt werden nur schnelle Fehler wie Netzaussetzer oder 5xx.
 */
export const endgueltig = (fehler: string) => /mit 4\d\d|anmeldung|nicht eingerichtet|zeitüberschreitung|verweigert/i.test(fehler);

/**
 * Eine Quelle abfragen – mit einem zweiten Versuch bei Netz- oder Serverfehlern und, bei ISBN-Suche ohne
 * Treffer, einem Versuch mit der alten 10-stelligen ISBN (ältere Bücher sind oft nur so eingestellt).
 */
async function frageQuelle(
  q: PreisQuelle,
  anfrage: { isbn?: string; titel?: string; autor?: string },
  timeoutMs: number,
  pauseMs: number,
): Promise<{ angebote: Angebot[]; status: QuellenStatus }> {
  const start = Date.now();
  const einmal = () => mitTimeout(q.suche(anfrage), timeoutMs);
  let versuche = 1;
  try {
    let angebote: Angebot[];
    try {
      angebote = await einmal();
    } catch (e) {
      const text = String((e as Error)?.message ?? e);
      if (endgueltig(text)) throw e;
      await new Promise((r) => setTimeout(r, pauseMs));
      versuche = 2;
      angebote = await einmal();
    }
    const isbn10 = anfrage.isbn ? isbn13zu10(anfrage.isbn) : null;
    if (angebote.length === 0 && isbn10 && q.isbn10Nachfrage !== false) {
      angebote = await mitTimeout(q.suche({ isbn: isbn10 }), timeoutMs).catch(() => []);
    }
    return { angebote, status: { quelle: q.id, ok: true, anzahl: angebote.length, ms: Date.now() - start, versuche } };
  } catch (e) {
    return {
      angebote: [],
      status: { quelle: q.id, ok: false, anzahl: 0, fehler: String((e as Error)?.message ?? e), ms: Date.now() - start, versuche },
    };
  }
}

/**
 * Alle aktiven Quellen parallel abfragen. Fällt eine aus, laufen die anderen weiter.
 * Danach: Doppelte zusammenführen, Angebote prüfen (Mängelexemplare, anderes Buch …), nach Preis sortieren.
 */
export async function marktAbfragen(
  quellen: PreisQuelle[],
  anfrage: { isbn?: string; titel?: string; autor?: string },
  opt: MarktOptionen = {},
): Promise<MarktErgebnis> {
  const aktive = quellen.filter((q) => q.aktiv);
  const ergebnisse = await Promise.all(
    aktive.map((q) => frageQuelle(q, anfrage, opt.timeoutMs ?? 12000, opt.wiederholenNachMs ?? 700)),
  );
  const alle = entdoppeln(ergebnisse.flatMap((e) => e.angebote));
  const ueberIsbn = !!anfrage.isbn;
  const p = pruefeAngebote(alle, { ...opt.pruef, titel: opt.pruef?.titel ?? anfrage.titel, autor: opt.pruef?.autor ?? anfrage.autor, ueberIsbn });
  const angebote = p.gueltig.sort((a, b) => a.gesamt - b.gesamt);
  return {
    angebote,
    aussortiert: p.aussortiert.sort((a, b) => a.gesamt - b.gesamt),
    hinweise: p.hinweise,
    ueberIsbn,
    status: ergebnisse.map((e) => e.status),
    aus: quellen.filter((q) => !q.aktiv).map((q) => q.id),
    lage: marktlage(angebote),
    zeit: new Date().toISOString(),
  };
}

/**
 * Markt mit anderer Auswahl neu zusammensetzen: von Hand aussortierte raus, von Hand zurückgeholte rein.
 * Schlüssel siehe `angebotSchluessel`.
 */
export function marktMitAuswahl(m: MarktErgebnis, raus: string[], rein: string[]): MarktErgebnis {
  if (raus.length === 0 && rein.length === 0) return m;
  const r = new Set(raus);
  const z = new Set(rein);
  const zurueck = (m.aussortiert ?? []).filter((a) => z.has(angebotSchluessel(a)));
  const vonHand = m.angebote.filter((a) => r.has(angebotSchluessel(a)));
  const angebote = [
    ...m.angebote.filter((a) => !r.has(angebotSchluessel(a))),
    ...zurueck.map(({ grund: _grund, ...a }) => a),
  ].sort((a, b) => a.gesamt - b.gesamt);
  const aussortiert = [
    ...(m.aussortiert ?? []).filter((a) => !z.has(angebotSchluessel(a))),
    ...vonHand.map((a) => ({ ...a, grund: 'von Hand aussortiert' })),
  ].sort((a, b) => a.gesamt - b.gesamt);
  return { ...m, angebote, aussortiert, lage: marktlage(angebote) };
}

/**
 * Haben alle eingeschalteten Quellen geantwortet? Nur dann taugt das Ergebnis für den Verlauf –
 * sonst sähe ein Ausfall später aus wie „kaum Angebote am Markt“ und verfälschte Trend und Seltenheit.
 */
export function vollstaendig(m: MarktErgebnis): boolean {
  return m.status.length > 0 && m.status.every((s) => s.ok);
}

export function mitTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Zeitüberschreitung')), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

export const runde2 = (n: number) => Math.round(n * 100) / 100;
