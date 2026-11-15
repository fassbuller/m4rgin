// Ablauf-Logik, die Bildschirme nutzen: Titel finden, Markt abfragen, Trends holen, vorläufiger Preis.

import { Titel } from './lib/titel';
import { dnbIsbn, dnbSuche } from './lib/dnb';
import { openLibraryIsbn } from './lib/openlibrary';
import { baueCql, SuchFelder } from './lib/suche';
import { kurzerFehler, MarktErgebnis, mitTimeout, QUELLEN_NAME, vollstaendig } from './lib/markt';
import { marktMitSuchregel } from './lib/suchregel';
import { eurobuchAbgelehnt, eurobuchQuelle, eurobuchUrl, parseEurobuch } from './lib/quellen/eurobuch';
import { booklookerQuelle, booklookerRoh, booklookerToken, parseBooklookerAntwort } from './lib/quellen/booklooker';
import { VERSION_TEXT } from './version';
import { erschliessung } from './lib/erschliessung';
import { marktUeberHaven } from './lib/havenMarkt';
import { HavenZugang, wirksamerHaven } from './lib/haven';
import { TEST_HAVEN } from './testvorgabe';
import { LADENPLAN, standort, Standort } from './lib/ladenplan';
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

/**
 * Wo steht das Buch im Laden vermutlich? DNB-Sacherschließung (MARC21) → Ladenplan.
 * Ohne ISBN/DNB-Nummer oder ohne DNB-Treffer: null (dann zeigt die App nichts statt zu raten).
 */
export async function standortFuer(t: Titel): Promise<Standort | null> {
  if (!t.isbn && !(t.quelle === 'dnb' && t.id)) return null;
  const e = await erschliessung({ isbn: t.isbn, idn: t.quelle === 'dnb' ? t.id : undefined });
  if (!e.gefunden) return null;
  return standort(LADENPLAN, e);
}

/** Alle Preisquellen parallel, Kennzahlen in den Verlauf. */
export async function marktFuer(t: Titel, e: Einstellungen): Promise<MarktErgebnis> {
  const quellen = [
    booklookerQuelle(e.booklooker, e.versandPauschale),
    eurobuchQuelle(e.eurobuch, e.versandPauschale),
    ebayQuelle(e.ebay, e.versandPauschale),
  ];
  // Titel und Autor reisen mit der ISBN mit: Die Suchregel (lib/suchregel.ts, in Pegel dieselbe) sucht über
  // beide Wege. Ohne erkannten Titel („ISBN 978…“) holt sie ihn selbst aus dem Katalog.
  const titelBekannt = t.quelle !== 'manuell' || !/^ISBN /.test(t.titel);
  const anfrage = t.isbn
    ? { isbn: t.isbn, ...(titelBekannt ? { titel: t.titel, autor: nachname(t) } : {}) }
    : { titel: t.titel, autor: nachname(t) };
  const ignorierteHaendler = await ignorierteHaendlerLaden().catch(() => []);
  const pruef = { titel: t.titel, autor: t.autoren[0], bindung: bindungAus(t.einband), ignorierteHaendler };

  // Preise über Haven (Zugänge des Ladens), wenn eingerichtet und nicht abgeschaltet – so bekommen auch
  // Testpersonen ohne eigene booklooker/eurobuch/eBay-Zugänge echte Preise. Scheitert Haven und es gibt
  // eigene Zugänge, wird direkt gefragt; sonst kommt der Haven-Fehler verständlich an.
  let havenFehler: string | null = null;
  if (preiseUeberHaven(e)) {
    try {
      const m = await marktUeberHaven(havenFuer(e)!, anfrage, pruef);
      if (vollstaendig(m)) await verlaufSpeichern(schluessel(t), m).catch(() => undefined);
      return m;
    } catch (err) {
      if (!quellen.some((q) => q.aktiv)) throw err;
      havenFehler = String((err as Error)?.message ?? err);
    }
  }

  const katalog = async (isbn: string) => {
    const treffer = (await sucheIsbn(isbn))[0];
    return treffer ? { titel: treffer.titel, autor: treffer.autoren[0]?.split(',')[0]?.trim() } : null;
  };
  const m = await marktMitSuchregel(quellen, anfrage, { pruef }, katalog);
  if (havenFehler) m.hinweise = [`Preise über Haven gingen nicht (${havenFehler}) – direkt gefragt.`, ...(m.hinweise ?? [])];
  // Nur vollständige Abfragen in den Verlauf – ein Quellenausfall ist kein „Buch kaum am Markt“
  if (vollstaendig(m)) await verlaufSpeichern(schluessel(t), m).catch(() => undefined);
  return m;
}

/** Preise über Haven holen? Ja, sobald Haven eingerichtet ist – außer der Schalter steht auf aus. */
export function preiseUeberHaven(e: Einstellungen): boolean {
  const h = havenFuer(e);
  return !!h && h.preise !== false;
}

/**
 * Haven fürs Senden („An Haven“): nur eine EIGENE Kopplung. Der gemeinsame Schlüssel der Testversion gilt in Haven
 * nur für Marktpreise (403 market_only, Haven v0.99.151) – damit nicht jede Testperson Bücher in Haven ablegen kann.
 */
export function havenZumSenden(e: Einstellungen): { zugang: HavenZugang | null; nurTestVorgabe: boolean } {
  const w = wirksamerHaven(e.haven, TEST_HAVEN);
  return w && !w.vorgabe ? { zugang: w.zugang, nurTestVorgabe: false } : { zugang: null, nurTestVorgabe: !!w?.vorgabe };
}

/** Der Haven, der gilt: eigene Kopplung, sonst die Vorgabe der Testversion (TEST_HAVEN), sonst keiner. */
export function havenFuer(e: Einstellungen): HavenZugang | null {
  return wirksamerHaven(e.haven, TEST_HAVEN)?.zugang ?? null;
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
  const teile: string[] = [VERSION_TEXT];
  const sek =(t0: number) => `${((Date.now() - t0) / 1000).toFixed(1)} s`;
  // Preise über Haven: so, wie beim Scannen gefragt wird
  if (preiseUeberHaven(e)) {
    const t0 = Date.now();
    try {
      const m = await marktUeberHaven(havenFuer(e)!, { isbn, titel: 'Tschick', autor: 'Herrndorf' }, { titel: 'Tschick', autor: 'Herrndorf' });
      const quellen = m.status.map((s) => `${QUELLEN_NAME[s.quelle]} ${s.ok ? s.anzahl : kurzerFehler(s.fehler)}`).join(' · ');
      teile.push(`■ Haven (Preise über die Zugänge des Ladens): ${m.angebote.length} Angebote (${sek(t0)})\n  ${quellen || 'keine Quelle gemeldet'}`);
    } catch (err) {
      teile.push(`■ Haven: Fehler nach ${sek(t0)}: ${String((err as Error)?.message ?? err)}`);
    }
    teile.push('Eigene Zugänge (nur Ersatz, wenn Haven nicht antwortet):');
  }
  // Ausgeschaltete Quellen werden beim Scannen gar nicht gefragt – das muss der Test deutlich sagen
  const aus = (an: boolean) => (an ? '' : '\n  ⚠ In der App ausgeschaltet – beim Scannen wird diese Quelle nicht gefragt (Schalter oben einschalten).');
  const roh = async (name: string, url: string, parse: (x: string) => number, an: boolean, gesperrt?: (x: string) => string | null) => {
    const t0 = Date.now();
    try {
      const res = await mitTimeout(fetch(url), 15000);
      const text = await mitTimeout(res.text(), 15000);
      const sperre = gesperrt?.(text);
      if (sperre) {
        teile.push(`■ ${name}: gesperrt („${sperre}“) – meist nach einigen Stunden wieder frei${aus(an)}`);
        return;
      }
      teile.push(`■ ${name}: HTTP ${res.status}, ${parse(text)} Angebote erkannt (${sek(t0)})${aus(an)}\n${text.slice(0, 1500)}`);
    } catch (err) {
      teile.push(`■ ${name}: Fehler nach ${sek(t0)}: ${String(err)}${aus(an)}`);
    }
  };
  if (e.booklooker.apiKey) {
    // REST API: erst Anmeldung (Token), dann Suche – Rohantwort zeigen, damit man die Feldnamen sieht
    let t0 = Date.now();
    try {
      await mitTimeout(booklookerToken(e.booklooker, true), 15000);
      teile.push(`■ booklooker-Anmeldung: ok (${sek(t0)})`);
      t0 = Date.now();
      const rv = await mitTimeout(booklookerRoh(e.booklooker, { isbn }), 15000);
      const n = parseBooklookerAntwort(rv, 0).length;
      teile.push(`■ booklooker-Suche: ${n} Angebote erkannt (${sek(t0)})${aus(e.booklooker.aktiv)}\n${(typeof rv === 'string' ? rv : JSON.stringify(rv)).slice(0, 1500)}`);
    } catch (err) {
      teile.push(`■ booklooker: ${kurzerFehler(String(err))} nach ${sek(t0)}: ${String(err)}${aus(e.booklooker.aktiv)}`);
    }
  } else teile.push('■ booklooker: kein API-Key eingetragen');
  if (e.eurobuch.benutzer) {
    await roh('eurobuch', eurobuchUrl(e.eurobuch, { isbn }), (x) => parseEurobuch(x, 0).length, e.eurobuch.aktiv, eurobuchAbgelehnt);
  } else teile.push('■ eurobuch: kein Zugang eingetragen');
  if (e.ebay.clientId && !e.ebay.aktiv) teile.push(`■ eBay:${aus(false).replace('\n  ', ' ')}`);
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
