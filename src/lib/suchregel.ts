// Eine Suchregel für Marktpreise – dieselbe wie in Pegel (firestream2 v0.99.153/154, Pegel/src/markt.ts).
// Lennys Wunsch: Es soll weder in Haven noch in m4rgin vorkommen, dass man ein Buch nicht findet, weil man statt
// Titel ISBN gesucht hat oder andersherum. Gilt hier, wenn die App die Quellen DIREKT fragt (eigene Zugänge, oder
// als Ersatz, wenn Haven nicht antwortet); über Haven rechnet Pegel dieselbe Regel.
//
//  1. Steht im Titel eine ISBN, gilt sie als ISBN; eine ungültige ISBN ohne Titel wird als Text gesucht.
//  2. Nur ISBN: Titel und Person aus dem Katalog holen (DNB, Open Library), dann auch darüber suchen.
//  3. ISBN und Titel: jede Quelle über die ISBN UND über Titel und Person, gleichzeitig.
//  4. Titelsuche je Quelle geformt: booklooker/eurobuch Haupttitel + Nachname, eBay die ersten drei Titelwörter.
//  5. Zusammenführen: über die ISBN zählt voll; über den Titel kommt dazu, was nicht doppelt ist und dessen Titel
//     passt – markiert als `andereAusgabe`. Findet die ISBN nichts, gilt allein die Titelsuche.
//  6. Verweigert eine Quelle die Abfrage, ruht sie 30 Minuten (sonst träfe jede Suche sie zweimal).

import { Angebot, MarktErgebnis, MarktOptionen, marktAbfragen, marktlage, mitTimeout, PreisQuelle, QUELLEN_NAME,
  QuellenId, QuellenStatus } from './markt';
import { normalisiereIsbn } from './isbn';
import { angebotSchluessel, titelPasst } from './pruefung';
import { kernTitel } from './wiki';

export const TITEL_MS = 4000;
export const SPERRPAUSE_MS = 30 * 60_000;
const GESPERRT = /verweigert|no service/i;
const ISBN_TEXT = /^[\d\s\-–]{9,17}[\dXx]$/;

export interface Suchwege {
  isbn?: string;
  titel?: string;
  autor?: string;
}

/** „Respektlosigkeit : provokative Strategien …“ → „Respektlosigkeit“ – der Untertitel fehlt in vielen Anzeigen. */
export function haupttitel(t: string): string {
  return kernTitel(t) || t.trim();
}

/** Regel 1: welche Wege eine Anfrage nimmt. */
export function suchwege(a: Suchwege): Suchwege {
  let isbn = a.isbn ? normalisiereIsbn(a.isbn) ?? undefined : undefined;
  let titel = a.titel?.trim() || undefined;
  const autor = a.autor?.trim() || undefined;
  if (!isbn && titel && ISBN_TEXT.test(titel)) {
    const n = normalisiereIsbn(titel);
    if (n) [isbn, titel] = [n, undefined];
  }
  if (!isbn && !titel && a.isbn?.trim()) titel = a.isbn.trim();
  return { isbn, titel, autor };
}

const FUELLWORT = new Set(['der', 'die', 'das', 'und', 'ein', 'eine', 'von', 'mit', 'im', 'in', 'zu', 'zum', 'zur', 'des',
  'den', 'dem', 'für', 'fur', 'the', 'and', 'of', 'a', 'roman', 'band']);

/**
 * Suchtext für eBay: die ersten drei aussagekräftigen Titelwörter, ohne Person – eBay sucht nur in der oft
 * abgeschnittenen Überschrift, die selten die Person nennt. Bei Ein-Wort-Titeln kommt der Nachname dazu.
 */
export function ebaySuchtext(titel: string, autor?: string): string {
  const woerter = titel.replace(/[^\p{L}\p{N}'’-]+/gu, ' ').split(' ').filter((w) => w && !FUELLWORT.has(w.toLowerCase()));
  const kern = woerter.slice(0, 3);
  if (kern.length === 0) return titel.trim();
  const nachname = autor?.split(',')[0].trim().split(/\s+/).pop();
  return (kern.length < 2 && nachname ? [...kern, nachname] : kern).join(' ');
}

/** Regel 4: Titelsuche je Quelle formen. ISBN-Suchen bleiben, wie sie sind. */
export function titelFormen(q: PreisQuelle): PreisQuelle {
  return {
    ...q,
    suche(anfrage) {
      if (anfrage.isbn || !anfrage.titel) return q.suche(anfrage);
      if (q.id === 'ebay') return q.suche({ ...anfrage, titel: ebaySuchtext(anfrage.titel, anfrage.autor), autor: undefined });
      const nachname = anfrage.autor?.split(',')[0].trim() || undefined;
      return q.suche({ ...anfrage, titel: haupttitel(anfrage.titel), autor: nachname });
    },
  };
}

/** Gleicher Händler, gleicher Preis = dasselbe Angebot (wie entdoppeln in markt.ts). */
const doppelSchluessel = (a: Angebot) => {
  const h = (a.haendler ?? '').trim().toLowerCase();
  return h && h !== 'privat' ? `${h}|${a.preis.toFixed(2)}` : `${a.plattform.toLowerCase()}|${h}|${a.preis.toFixed(2)}`;
};

/** Regel 5: beide Wege zu einem Ergebnis. */
export function zusammenfuehren(i: MarktErgebnis | null, t: MarktErgebnis | null, w: Suchwege = {}): MarktErgebnis {
  if (!i && !t) throw new Error('Keine ISBN und kein Titel.');
  if (!i) return t!;
  const mitTitelStatus = (s: QuellenStatus[]) => {
    if (!t) return s;
    const tt = new Map(t.status.map((x) => [x.quelle, x]));
    return s.map((x) => {
      const y = tt.get(x.quelle);
      return y && !x.ok && y.ok ? { ...y } : x;
    });
  };
  if (!t || t.angebote.length === 0) return { ...i, status: mitTitelStatus(i.status) };
  if (i.angebote.length === 0) {
    return { ...t, status: mitTitelStatus(i.status),
      hinweise: ['Keine Angebote zu dieser ISBN – über Titel und Person gesucht, andere Ausgaben möglich.', ...(t.hinweise ?? [])] };
  }
  const schon = new Set(i.angebote.map(doppelSchluessel));
  // Es gibt Angebote über die ISBN – Titel-Treffer kommen nur mit passendem Titel dazu (streng)
  const dazu = t.angebote
    .filter((x) => !schon.has(doppelSchluessel(x)))
    .filter((x) => !w.titel || !x.titel || titelPasst(x.titel, w.titel, w.autor, x.autor))
    .map((x) => ({ ...x, andereAusgabe: true }));
  const angebote = [...i.angebote, ...dazu].sort((a, b) => a.gesamt - b.gesamt);
  const drin = new Set(angebote.map(angebotSchluessel));
  const aussortiert = [...(i.aussortiert ?? []), ...(t.aussortiert ?? [])]
    .filter((x, n, alle) => !drin.has(angebotSchluessel(x)) && alle.findIndex((y) => angebotSchluessel(y) === angebotSchluessel(x)) === n);
  const status = mitTitelStatus(i.status).map((s) => ({ ...s, anzahl: angebote.filter((x) => x.quelle === s.quelle).length }));
  return {
    ...i, angebote, aussortiert, status, lage: marktlage(angebote),
    hinweise: [...(i.hinweise ?? []),
      ...(dazu.length ? [`${dazu.length} weitere über Titel und Person gefunden – andere Ausgabe möglich (markiert).`] : [])],
  };
}

/** Regel 6: Quellen, die die Abfrage verweigert haben, ruhen (je Gerät, solange die App läuft). */
const ruhtBis = new Map<QuellenId, number>();
export const sperrpauseZuruecksetzen = () => ruhtBis.clear();

const uhrzeit = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/**
 * Marktabfrage nach der Suchregel. `titelZurIsbn` holt nach einem Scan Titel und Person aus dem Katalog
 * (ohne: es bleibt bei der ISBN). `uhr` nur für Tests.
 */
export async function marktMitSuchregel(
  quellen: PreisQuelle[],
  a: Suchwege,
  opt: MarktOptionen = {},
  titelZurIsbn?: (isbn: string) => Promise<{ titel?: string; autor?: string } | null>,
  uhr: () => number = Date.now,
): Promise<MarktErgebnis> {
  const w = suchwege(a);
  if (w.isbn && !w.titel && titelZurIsbn) {
    const t = await mitTimeout(titelZurIsbn(w.isbn), TITEL_MS).catch(() => null);
    if (t?.titel) [w.titel, w.autor] = [t.titel, w.autor ?? t.autor];
  }
  const jetzt = uhr();
  const ruhend = quellen.filter((q) => q.aktiv && (ruhtBis.get(q.id) ?? 0) > jetzt);
  const fragen = quellen.filter((q) => !ruhend.includes(q)).map(titelFormen);
  const pruef = { ...opt.pruef, titel: w.titel ?? opt.pruef?.titel, autor: w.autor ?? opt.pruef?.autor };
  const [ueberIsbn, ueberTitel] = await Promise.all([
    w.isbn ? marktAbfragen(fragen, { isbn: w.isbn }, { ...opt, pruef }) : null,
    w.titel ? marktAbfragen(fragen, { titel: w.titel, autor: w.autor }, { ...opt, pruef }) : null,
  ]);
  for (const r of [ueberIsbn, ueberTitel]) {
    for (const st of r?.status ?? []) {
      if (!st.ok && GESPERRT.test(st.fehler ?? '')) ruhtBis.set(st.quelle, uhr() + SPERRPAUSE_MS);
    }
  }
  const m = zusammenfuehren(ueberIsbn, ueberTitel, w);
  if (!ruhend.length) return m;
  return { ...m, status: [...m.status, ...ruhend.map((q): QuellenStatus => ({
    quelle: q.id, ok: false, anzahl: 0, ms: 0,
    fehler: `${QUELLEN_NAME[q.id]} hat die Abfrage verweigert – Pause bis ${uhrzeit(ruhtBis.get(q.id)!)}`,
  }))] };
}
