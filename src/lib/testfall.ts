// Testfälle für die Preisermittlung: echte Marktlagen samt dem Preis, den ein Mensch für richtig hielt.
// Aus der App heraus teilbar („Als Testfall teilen“), abgelegt unter test/testset/*.json.
// So lässt sich jede Regeländerung messen: Wie viele Fälle landen im erwarteten Bereich?

import { Angebot, entdoppeln } from './markt';
import { pruefeAngebote } from './pruefung';
import { bindungAus } from './ausgaben';
import { berechnePreis, PreisRegeln, STANDARD_REGELN, Zustand } from './preis';

export interface Testfall {
  name: string;
  /** Warum dieser Fall interessant ist */
  notiz?: string;
  titel: { titel: string; autor?: string; jahr?: string; einband?: string; isbn?: string; neupreis?: number };
  zustand: Zustand;
  /** Alle Angebote, wie die Quellen sie geliefert haben (ohne Links) */
  angebote: Angebot[];
  /** Erwarteter Endpreis-Bereich (inklusive) */
  erwartet: { min: number; max: number };
  /** Wenn gesetzt: Diese Angebote (Händler) dürfen nicht als Vergleich dienen */
  nichtAlsVergleich?: string[];
}

export interface TestfallErgebnis {
  name: string;
  vorschlag: number | null;
  imZiel: boolean;
  vergleich: string;
  falscherVergleich: boolean;
}

/**
 * Läuft denselben Weg wie die App: Doppelte zusammenführen → prüfen → Vergleich wählen → rechnen.
 * `ohnePruefung` rechnet wie vor der Prüfung (alle Angebote, ohne Ausreißer-/Großhändler-Schutz) – zum Vergleich alt/neu.
 */
export function bewerteTestfall(tf: Testfall, regeln: PreisRegeln = STANDARD_REGELN, opt: { ohnePruefung?: boolean } = {}): TestfallErgebnis {
  if (opt.ohnePruefung) regeln = { ...regeln, robust: { ausreisserUebergehen: false, grosshaendlerUebergehen: false, mittelAusZweiAb: 0 } };
  const roh = opt.ohnePruefung ? tf.angebote : entdoppeln(tf.angebote);
  const p = opt.ohnePruefung
    ? { gueltig: roh }
    : pruefeAngebote(roh, {
        titel: tf.titel.titel,
        autor: tf.titel.autor,
        ueberIsbn: !!tf.titel.isbn,
        bindung: bindungAus(tf.titel.einband),
      });
  const angebote = [...p.gueltig].sort((a, b) => a.gesamt - b.gesamt);
  const e = berechnePreis(
    {
      angebote,
      anzahlAngebote: angebote.length,
      zustand: tf.zustand,
      merkmale: [],
      jahr: tf.titel.jahr,
      neupreis: tf.titel.neupreis,
      jetzt: new Date('2026-11-08'),
    },
    regeln,
  );
  const vorschlag = e?.vorschlag ?? null;
  const vergleichHaendler = (e?.ankerAngebote ?? []).map((a) => a.haendler ?? a.plattform);
  return {
    name: tf.name,
    vorschlag,
    imZiel: vorschlag != null && vorschlag >= tf.erwartet.min - 0.001 && vorschlag <= tf.erwartet.max + 0.001,
    vergleich: vergleichHaendler.join(' + ') || '–',
    falscherVergleich: vergleichHaendler.some((h) => tf.nichtAlsVergleich?.includes(h)),
  };
}

/** Aus dem, was die App gerade weiß, einen Testfall bauen (zum Teilen). Links werden weggelassen. */
export function testfallAus(
  t: { titel: string; autoren: string[]; jahr?: string; einband?: string; isbn?: string; neupreis?: number },
  zustand: Zustand,
  angebote: Angebot[],
  endpreis: number,
): Testfall {
  return {
    name: `${t.titel}${t.jahr ? ` (${t.jahr})` : ''}`,
    titel: { titel: t.titel, autor: t.autoren[0], jahr: t.jahr, einband: t.einband, isbn: t.isbn, neupreis: t.neupreis },
    zustand,
    angebote: angebote.map(({ url: _url, ...a }) => a),
    // Ein Raster-Schritt Spielraum nach unten und oben
    erwartet: { min: Math.max(0.5, endpreis - 0.5), max: endpreis + 0.5 },
  };
}
