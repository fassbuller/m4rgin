// Ablauf-Logik, die Bildschirme nutzen: Titel finden, Markt abfragen, Trends holen, vorläufiger Preis.

import { Titel } from './lib/titel';
import { dnbIsbn, dnbSuche } from './lib/dnb';
import { openLibraryIsbn } from './lib/openlibrary';
import { baueCql, SuchFelder } from './lib/suche';
import { MarktErgebnis, marktAbfragen, mitTimeout } from './lib/markt';
import { eurobuchQuelle, eurobuchUrl, parseEurobuch } from './lib/quellen/eurobuch';
import { booklookerQuelle, booklookerUrl, parseBooklooker } from './lib/quellen/booklooker';
import { appToken, ebayQuelle } from './lib/quellen/ebay';
import { angebotsSignal, interesseSignal, neuauflageSignal, Signal } from './lib/trend';
import { berechnePreis, Merkmal, PreisErgebnis, PreisRegeln } from './lib/preis';
import { bewerteSeltenheit, Seltenheit, SeltenheitsRegeln } from './lib/seltenheit';
import { Einstellungen } from './einstellungen';
import { ignorierteHaendlerLaden, LogEintrag, verlaufLaden, verlaufSpeichern } from './db';
import { bindungAus } from './lib/ausgaben';
import { bewerteKonfidenz, Konfidenz } from './lib/konfidenz';

const nachname = (t: Titel) => t.autoren[0]?.split(',')[0]?.trim();

export function schluessel(t: Titel): string {
  return t.isbn ?? `${(nachname(t) ?? '').toLowerCase()}|${t.titel.toLowerCase()}`;
}

/** ISBN → Treffer (DNB, sonst Open Library). Das Cover sucht die Cover-Komponente selbst (DNB → Google → Open Library). */
export async function sucheIsbn(isbn: string): Promise<Titel[]> {
  let treffer: Titel[] = [];
  try {
    treffer = (await dnbIsbn(isbn)).titel;
  } catch {
    // DNB nicht erreichbar → weiter mit Open Library
  }
  if (treffer.length === 0) {
    const ol = await openLibraryIsbn(isbn).catch(() => null);
    if (ol) treffer = [ol];
  }
  return treffer.map((t) => ({ ...t, isbn: t.isbn ?? isbn }));
}

export async function sucheFelder(f: SuchFelder): Promise<{ cql: string | null; treffer: Titel[]; gesamt: number }> {
  const cql = baueCql(f);
  if (!cql) return { cql, treffer: [], gesamt: 0 };
  const { titel, gesamt } = await dnbSuche(cql, 30);
  return { cql, gesamt, treffer: titel };
}

/** Alle Preisquellen parallel, Kennzahlen in den Verlauf. */
export async function marktFuer(t: Titel, e: Einstellungen): Promise<MarktErgebnis> {
  const quellen = [
    booklookerQuelle(e.booklooker, e.versandPauschale),
    eurobuchQuelle(e.eurobuch, e.versandPauschale),
    ebayQuelle(e.ebay, e.versandPauschale),
  ];
  const anfrage = t.isbn ? { isbn: t.isbn } : { titel: t.titel, autor: nachname(t) };
  const ignorierteHaendler = await ignorierteHaendlerLaden().catch(() => []);
  const m = await marktAbfragen(quellen, anfrage, {
    pruef: { titel: t.titel, autor: t.autoren[0], bindung: bindungAus(t.einband), ignorierteHaendler },
  });
  if (m.status.some((s) => s.ok)) await verlaufSpeichern(schluessel(t), m).catch(() => undefined);
  return m;
}

/** Drei Signale; jedes darf einzeln fehlschlagen. */
export async function trendsFuer(t: Titel, e: Einstellungen): Promise<Signal[]> {
  const aufgaben: Promise<Signal>[] = [verlaufLaden(schluessel(t)).then(angebotsSignal)];
  if (e.trendAktiv) {
    aufgaben.push(interesseSignal(t.titel, t.autoren[0]));
    aufgaben.push(neuauflageSignal(t.titel, t.autoren[0], t.jahr));
  }
  const r = await Promise.allSettled(aufgaben);
  return r.filter((x): x is PromiseFulfilledResult<Signal> => x.status === 'fulfilled').map((x) => x.value);
}

/** Vorläufiger Preis fürs Live-Overlay: Zustand „gut“, keine Merkmale, Anker nach Regeln. */
export function vorlaeufig(m: MarktErgebnis | null, t: Titel, r: PreisRegeln): PreisErgebnis | null {
  if (!m) return null;
  return berechnePreis(
    {
      angebote: m.angebote,
      anzahlAngebote: m.lage.anzahl,
      zustand: 'gut',
      merkmale: [],
      neupreis: t.neupreis,
      jahr: t.jahr,
      marktUnvollstaendig: marktUnvollstaendig(m),
    },
    r,
  );
}

export const marktUnvollstaendig = (m: MarktErgebnis | null | undefined) => !!m?.status.some((s) => !s.ok);

/**
 * Seltenheit eines gespeicherten Eintrags (Stapel, Verlauf). Gespeichert sind nur Anzahl und die
 * günstigsten Angebote – das reicht für Stufe und Fehlalarm-Schutz. Ob damals eine Quelle fehlte, ist
 * nicht bekannt; die Zählung gilt dann als vollständig.
 */
export function seltenheitAusEintrag(
  e: LogEintrag,
  r: SeltenheitsRegeln,
  jetzt?: { markt?: MarktErgebnis | null; preis?: PreisErgebnis | null; endpreis?: number | null; merkmale?: Merkmal[] },
): Seltenheit | null {
  const m = jetzt?.markt;
  if (!m && e.markt_anzahl == null) return null;
  let gespeichert: { gesamt: number; zustandText?: string }[] = [];
  try {
    const x = e.markt_json ? JSON.parse(e.markt_json) : [];
    if (Array.isArray(x)) gespeichert = x.map((a: { g: number; z?: string | null }) => ({ gesamt: a.g, zustandText: a.z ?? undefined }));
  } catch {
    // alte/defekte Daten → ohne Angebote bewerten
  }
  return bewerteSeltenheit(
    {
      anzahl: m ? m.lage.anzahl : e.markt_anzahl,
      preis: jetzt?.endpreis ?? e.endpreis,
      vergleich: jetzt?.preis?.vergleichspreis ?? e.vergleichspreis,
      jahr: e.jahr,
      neupreis: e.neupreis,
      merkmale: jetzt?.merkmale ?? ((e.merkmale ?? '').split(',').map((x) => x.trim()).filter(Boolean) as Merkmal[]),
      angebote: m ? m.angebote : gespeichert,
      marktUnvollstaendig: m ? marktUnvollstaendig(m) : false,
      ueberIsbn: !!e.isbn,
    },
    r,
  );
}

/** Seltenheit aus dem, was ein Vorgang gerade weiß (Markt, Preis, Merkmale, Trends). */
export function seltenheitFuer(
  t: Titel,
  m: MarktErgebnis | null,
  preis: PreisErgebnis | null,
  merkmale: Merkmal[],
  trends: Signal[] | null,
  r: SeltenheitsRegeln,
  endpreis?: number | null,
  konfidenz?: Konfidenz | null,
): Seltenheit | null {
  if (!m) return null;
  const k = konfidenz ?? bewerteKonfidenz({ markt: m, preis });
  return bewerteSeltenheit(
    {
      anzahl: m.lage.anzahl,
      preis: endpreis ?? preis?.vorschlag ?? null,
      vergleich: preis?.vergleichspreis ?? null,
      jahr: t.jahr,
      neupreis: t.neupreis,
      merkmale,
      angebote: m.angebote,
      marktUnvollstaendig: marktUnvollstaendig(m),
      ueberIsbn: !!t.isbn,
      interesseHoch: !!trends?.some((s) => s.text.startsWith('Interesse') && s.richtung === 'hoch'),
      konfidenz: k.ampel,
    },
    r,
  );
}

/**
 * „Quellen testen“: holt für eine bekannte ISBN die Rohantwort jeder Quelle (gekürzt)
 * und die Zahl der erkannten Angebote. Zum Prüfen beim ersten Einrichten – nachvollziehbar statt Blackbox.
 */
// Testbuch: „Tschick“ – auf allen Plattformen reichlich vorhanden
export async function quellenTesten(e: Einstellungen, isbn = '9783499256356'): Promise<string> {
  const teile: string[] = [];
  const sek = (t0: number) => `${((Date.now() - t0) / 1000).toFixed(1)} s`;
  const roh = async (name: string, url: string, parse: (x: string) => number) => {
    const t0 = Date.now();
    try {
      const res = await mitTimeout(fetch(url), 15000);
      const text = await mitTimeout(res.text(), 15000);
      teile.push(`■ ${name}: HTTP ${res.status}, ${parse(text)} Angebote erkannt (${sek(t0)})\n${text.slice(0, 1500)}`);
    } catch (err) {
      teile.push(`■ ${name}: Fehler nach ${sek(t0)}: ${String(err)}`);
    }
  };
  if (e.booklooker.pid) {
    await roh('booklooker', booklookerUrl(e.booklooker, { isbn }), (x) => parseBooklooker(x, 0).length);
  } else teile.push('■ booklooker: keine Partner-ID eingetragen');
  if (e.eurobuch.benutzer) {
    await roh('eurobuch', eurobuchUrl(e.eurobuch, { isbn }), (x) => parseEurobuch(x, 0).length);
  } else teile.push('■ eurobuch: kein Zugang eingetragen');
  if (e.ebay.clientId) {
    // In zwei Schritten, damit man sieht, ob die Anmeldung oder die Suche hängt
    let t0 = Date.now();
    try {
      await mitTimeout(appToken({ ...e.ebay, aktiv: true }), 15000);
      teile.push(`■ eBay-Anmeldung: ok (${sek(t0)})`);
      t0 = Date.now();
      const n = (await mitTimeout(ebayQuelle({ ...e.ebay, aktiv: true }, 0).suche({ isbn }), 15000)).length;
      teile.push(`■ eBay-Suche: ${n} Angebote erkannt (${sek(t0)})`);
    } catch (err) {
      teile.push(`■ eBay: Fehler nach ${sek(t0)}: ${String(err)}`);
    }
  } else teile.push('■ eBay: kein Zugang eingetragen');
  return teile.join('\n\n');
}
