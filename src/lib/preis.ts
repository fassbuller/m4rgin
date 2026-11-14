// Preislogik nach den Hennwack-Regeln (Stand 07.11.2026):
//
// - Zwei getrennte Regelsätze: **Laden** (Grabbelkiste/Regal) und **Lager** (Aufnahme/Begutachtung).
// - Anker ist ein Vergleichsangebot: im Laden das günstigste, im Lager das **zweitgünstigste**
//   vergleichbare Angebot. „Vergleichbar“ heißt: gleiche Ausgabe (Jahr) und/oder gleicher Zustand,
//   soweit es dafür genug Angebote gibt – sonst wird der Filter gelockert und das steht in der Erklärung.
// - Preis = Anker − Markt-Abschlag (Laden unterbietet) ± Zustand + Merkmal-Zuschläge (in % oder €).
//   Jeder Posten steht als eigene Zeile in der Rechnung, Prozente beziehen sich alle auf den Anker.
// - Ab `lagerAb` (Ladenpreis) geht ein Buch ins Lager und wird mit den Lager-Regeln gerechnet.
// - Raster, Grabbelkiste, Grenzen und alle Sätze sind in den Einstellungen änderbar.

import type { Angebot } from './markt';
import { ausreisserUnten, istGrosshaendler } from './pruefung';

export type Zustand = 'wie_neu' | 'sehr_gut' | 'gut' | 'akzeptabel' | 'maengel';
export type Merkmal = 'erstausgabe' | 'signiert' | 'schutzumschlag' | 'selten';
export type Kategorie = 'grabbel' | 'regal' | 'lager';
/** Welcher Regelsatz gerechnet hat */
export type Zweig = 'laden' | 'lager';
/** Welches Vergleichsangebot als Anker dient */
export type AnkerStrategie = 'guenstigstes' | 'zweitguenstigstes';

/** Zustände in Sammelkarten-Sprache (wie Cardmarket); intern bleiben die Buch-Stufen. */
export const ZUSTAND_LABEL: Record<Zustand, string> = {
  wie_neu: 'Mint',
  sehr_gut: 'Near Mint',
  gut: 'Excellent',
  akzeptabel: 'Played',
  maengel: 'Poor',
};

/** Die klassische Antiquariats-Bezeichnung dazu – für Erklärungen und Export. */
export const ZUSTAND_BUCH: Record<Zustand, string> = {
  wie_neu: 'wie neu',
  sehr_gut: 'sehr gut',
  gut: 'gut',
  akzeptabel: 'akzeptabel',
  maengel: 'mit Mängeln',
};

export const MERKMAL_LABEL: Record<Merkmal, string> = {
  erstausgabe: 'Erstausgabe',
  signiert: 'Signiert/Widmung',
  schutzumschlag: 'Schutzumschlag/Top',
  selten: 'Selten',
};

/** Merkmal-Zuschlag: prozentual auf den Anker oder fester Betrag (z. B. Signatur). */
export interface Zuschlag {
  art: 'prozent' | 'euro';
  /** 0.1 = +10 % bzw. Euro */
  wert: number;
}

/**
 * Knappheit: Wenige Angebote → Zuschlag, sehr viele → Massenware-Abschlag.
 * Bei ganz wenigen Vergleichen ist der Vergleichspreis selbst unsicher – dann wird nicht unterboten.
 */
export interface Knappheit {
  /** genau 1 Angebot (0.3 = +30 %) */
  einAngebot: number;
  /** 2–3 Angebote */
  zweiDrei: number;
  /** 4–6 Angebote */
  vierSechs: number;
  /** Ab so vielen Angeboten gilt ein Buch als Massenware … */
  massenwareAb: number;
  /** … und bekommt diesen Abschlag (0.05 = −5 %) */
  massenware: number;
  /** Bis zu so vielen Angeboten wird der Markt nicht unterboten */
  nichtUnterbietenBis: number;
  /** Erschienen in den letzten so vielen Jahren oder neu lieferbar → keine Knappheit (es gibt nur noch wenige Gebrauchte) */
  neuBisJahre: number;
}

/** Regeln für einen Verkaufskanal. Laden und Lager haben je einen eigenen Satz. */
export interface ZweigRegeln {
  /** Welches Angebot als Anker dient */
  anker: AnkerStrategie;
  /** Abschlag vom Anker, damit das Buch günstiger als online ist (0.1 = 10 %) */
  marktAbschlag: number;
  /** Anker nur aus Angeboten derselben Ausgabe (Jahr) wählen */
  nurGleicheAusgabe: boolean;
  /** Anker nur aus Angeboten im selben Zustand wählen */
  nurGleicherZustand: boolean;
}

export interface PreisRegeln {
  laden: ZweigRegeln;
  lager: ZweigRegeln;
  /** Auf- oder Abschlag je Zustand, bezogen auf den Anker (+0.1 = +10 %, −0.2 = −20 %) */
  zustand: Record<Zustand, number>;
  /** Zuschläge je Merkmal – nur positiv */
  merkmale: Record<Merkmal, Zuschlag>;
  /** Rasterweite in Euro */
  raster: number;
  /** 'naechst' = kaufmännisch auf das nächste Raster, 'ab' = immer abrunden */
  rundung: 'naechst' | 'ab';
  /** Mögliche Grabbelkisten-Preise, aufsteigend */
  grabbelPreise: number[];
  /** Kleinster Regalpreis */
  regalAb: number;
  /** Ab diesem (noch ungerundeten) Ladenpreis: ins Lager zur Aufnahme */
  lagerAb: number;
  /** Zu- und Abschläge nach Zahl der Online-Angebote */
  knappheit: Knappheit;
  /** Merkmale, die immer einen Hinweis „im Lager begutachten“ auslösen */
  pruefMerkmale: Merkmal[];
  /** Schutz gegen Ausreißer und Großhändler beim Vergleich */
  robust: RobusteRegeln;
}

export const STANDARD_REGELN: PreisRegeln = {
  // Laden: günstigstes Angebot unterbieten, damit das Buch im Regal weggeht
  laden: {
    anker: 'guenstigstes',
    marktAbschlag: 0.1,
    nurGleicheAusgabe: true,
    nurGleicherZustand: false,
  },
  // Lager: ungefähr das zweitgünstigste vergleichbare Angebot – dort kann in Ruhe
  // verkauft werden, deshalb keine Unterbietung.
  lager: {
    anker: 'zweitguenstigstes',
    marktAbschlag: 0,
    nurGleicheAusgabe: true,
    nurGleicherZustand: true,
  },
  // „Sehr gut“ ist der Normalfall eines ordentlichen Antiquariatsbuchs → ±0
  zustand: {
    wie_neu: 0.1,
    sehr_gut: 0,
    gut: -0.1,
    akzeptabel: -0.2,
    maengel: -0.3,
  },
  // Übliche Größenordnungen im Antiquariat; Signaturen schwanken stark → fester Betrag, im Zweifel begutachten
  merkmale: {
    erstausgabe: { art: 'prozent', wert: 0.25 },
    signiert: { art: 'euro', wert: 20 },
    schutzumschlag: { art: 'prozent', wert: 0.1 },
    selten: { art: 'prozent', wert: 0.2 },
  },
  raster: 0.5,
  rundung: 'naechst',
  grabbelPreise: [1, 2],
  regalAb: 2.5,
  lagerAb: 15,
  knappheit: {
    einAngebot: 0.3,
    zweiDrei: 0.2,
    vierSechs: 0.1,
    massenwareAb: 50,
    massenware: 0.05,
    nichtUnterbietenBis: 2,
    neuBisJahre: 3,
  },
  pruefMerkmale: ['signiert', 'erstausgabe'],
  robust: { ausreisserUebergehen: true, grosshaendlerUebergehen: true, mittelAusZweiAb: 4 },
};

export interface PreisEingabe {
  /** Alle Angebote – daraus wird der Anker nach den Regeln gewählt */
  angebote?: Angebot[] | null;
  /** Fest gewähltes Vergleichsangebot in Euro (überschreibt die Ankerwahl) */
  vergleichspreis?: number | null;
  /** Wie viele Angebote es online insgesamt gab (optional) */
  anzahlAngebote?: number | null;
  /** Wenn es keinen Vergleich gibt: eigene Schätzung in Euro */
  schaetzpreis?: number | null;
  zustand: Zustand;
  merkmale: Merkmal[];
  /** Eine Preisquelle ist ausgefallen → Angebotszahl unvollständig, keine Knappheit werten */
  marktUnvollstaendig?: boolean;
  /** Für Tests: „heute“ (Neuerscheinung) */
  jetzt?: Date;
  /** Neupreis laut DNB (nur für einen Plausibilitäts-Hinweis) */
  neupreis?: number | null;
  /** Jahr dieser Ausgabe – für „nur gleiche Ausgabe“ */
  jahr?: string | null;
}

export type SchrittArt = 'anker' | 'abschlag' | 'zuschlag' | 'summe' | 'wechsel' | 'grenze' | 'raster';

/** Eine Zeile der Rechnung: links die Begründung, rechts der Betrag. */
export interface Rechenschritt {
  art: SchrittArt;
  label: string;
  /** rechts stehender Betrag, z. B. „7,70 €“ oder „− 1,16 €“ */
  wert?: string;
}

export interface PreisErgebnis {
  vorschlag: number;
  kategorie: Kategorie;
  /** Regelsatz, der gerechnet hat */
  zweig: Zweig;
  /** Wert vor Rundung */
  rohwert: number;
  /** Summe aller Prozent-Posten (−0.2 = −20 %; 0 bei Schätzpreis) */
  prozent: number;
  /** Summe der festen Euro-Zuschläge */
  euroZuschlag: number;
  quelle: 'vergleich' | 'schaetzung';
  /** benutztes Vergleichsangebot */
  anker: Angebot | null;
  /** alle Angebote, aus denen der Vergleichswert stammt (bei „Mittel der 2 günstigsten“ zwei) */
  ankerAngebote: Angebot[];
  /** Ein Filter (Ausgabe/Zustand) musste gelockert werden */
  gelockert: boolean;
  /** Bewusst übergangene Angebote (Ausreißer, Großhändler) */
  uebergangen: { angebot: Angebot; grund: string }[];
  /** gerechneter Vergleichspreis (Anker inkl. Versand) */
  vergleichspreis: number | null;
  /** gewählte Merkmale */
  merkmale: Merkmal[];
  /** Rechnung als kurze Tabelle */
  schritte: Rechenschritt[];
  /** Hinweise zur Ankerwahl (Filter gelockert o. ä.) */
  notizen: string[];
  hinweise: string[];
}

export const euro = (n: number): string =>
  n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

const prozentText = (n: number): string =>
  `${n < 0 ? '−' : '+'} ${(Math.round(Math.abs(n) * 1000) / 10).toLocaleString('de-DE')} %`;
const betragText = (n: number): string => `${n < 0 ? '−' : '+'} ${euro(Math.abs(n))}`;

export function zuschlagText(z: Zuschlag): string {
  return z.art === 'euro' ? betragText(z.wert) : prozentText(z.wert);
}

/** Rundet auf das Raster. Kleiner Epsilon-Ausgleich gegen Fließkomma-Fehler (z. B. 2.75 → 3.00). */
export function aufRaster(wert: number, raster: number, rundung: 'naechst' | 'ab'): number {
  const schritte = wert / raster;
  const n = rundung === 'ab' ? Math.floor(schritte + 1e-9) : Math.round(schritte + 1e-9);
  return Math.round(n * raster * 100) / 100;
}

// ---------- Zustand aus dem Angebotstext ----------

/** Reihenfolge zählt: das genauere Muster zuerst („sehr gut“ vor „gut“). */
const ZUSTAND_MUSTER: [Zustand, RegExp][] = [
  ['maengel', /mängel|maengel|beschädigt|beschaedigt|defekt|zerrissen|stark abgenutzt|stark beschädigt|ausschnitt/],
  ['akzeptabel', /akzeptabel|deutliche gebrauchsspuren|starke gebrauchsspuren|altersspuren|abgenutzt|abgenützt|nachgedunkelt/],
  ['wie_neu', /wie neu|neuwertig|neuwertige|ungelesen|wie unbenutzt/],
  ['sehr_gut', /sehr gut|sehr guten|sehr schön|sehr schoen/],
  ['gut', /gut|gut erhalten|gebraucht|ordentlich|guter zustand/],
];

/** Liest aus dem freien Zustandstext der Händler einen groben Zustand. */
export function zustandAusText(text?: string | null): Zustand | null {
  if (!text) return null;
  const t = text.toLowerCase();
  for (const [z, muster] of ZUSTAND_MUSTER) if (muster.test(t)) return z;
  return null;
}

// ---------- Anker-Auswahl ----------

export interface AnkerWahl {
  anker: Angebot | null;
  /** Klartext für die Erklärung, z. B. „zweitgünstigstes Angebot (gleiche Ausgabe 2013)“ */
  bezeichnung: string;
  /** true, wenn wirklich das zweitgünstigste genommen wurde (nicht ersatzweise das einzige) */
  zweitguenstigstes: boolean;
  /** Anker stammt aus Angeboten im selben Zustand → Zustand steckt schon im Preis */
  gleicherZustand: boolean;
  /** Warum ein Filter nicht greifen konnte */
  hinweise: string[];
  /** Vergleichswert in Euro – meist der Gesamtpreis des Ankers, bei „Mittel der zwei günstigsten“ deren Mittel */
  wert: number | null;
  /** Alle Angebote, aus denen der Wert stammt (1 oder 2) */
  angebote: Angebot[];
  /** Ein Filter (Ausgabe/Zustand) musste gelockert werden → Vergleich unsicherer */
  gelockert: boolean;
  /** Bewusst übergangene Angebote (Ausreißer, Großhändler) mit Grund */
  uebergangen: { angebot: Angebot; grund: string }[];
}

/** Schutz gegen einzelne irreführende Angebote ganz unten */
export interface RobusteRegeln {
  /** Angebote weit unter dem Rest des Marktes nicht als Vergleich nehmen */
  ausreisserUebergehen: boolean;
  /** Großhändler-Kampfpreise (momox, rebuy …) nicht als Vergleich nehmen, solange es andere gibt */
  grosshaendlerUebergehen: boolean;
  /** Ab so vielen vergleichbaren Angeboten: Mittel der zwei günstigsten statt nur des günstigsten (0 = aus) */
  mittelAusZweiAb: number;
}

export const STANDARD_ROBUST: RobusteRegeln = STANDARD_REGELN.robust;

const KEIN_ROBUST: RobusteRegeln = { ausreisserUebergehen: false, grosshaendlerUebergehen: false, mittelAusZweiAb: 0 };

const kurz = (a: Angebot) => `${a.haendler || a.plattform} ${euro(a.gesamt)}`;

/**
 * Wählt das Vergleichsangebot nach den Regeln des Zweigs.
 * Filter (Ausgabe, Zustand) greifen nur, wenn danach noch genug Angebote übrig sind –
 * sonst wird gelockert und das in `hinweise` begründet. Danach werden Ausreißer nach unten und
 * Großhändler-Kampfpreise übergangen (ebenfalls nur, wenn genug übrig bleibt).
 */
export function waehleAnker(
  angebote: Angebot[],
  r: ZweigRegeln,
  opts: { zustand: Zustand; jahr?: string | null; robust?: RobusteRegeln },
): AnkerWahl {
  const robust = opts.robust ?? KEIN_ROBUST;
  const sortiert = [...angebote].sort((a, b) => a.gesamt - b.gesamt);
  const noetig = r.anker === 'zweitguenstigstes' ? 2 : 1;
  let pool = sortiert;
  const einschraenkungen: string[] = [];
  const hinweise: string[] = [];
  const uebergangen: AnkerWahl['uebergangen'] = [];
  let gelockert = false;

  if (r.nurGleicheAusgabe && opts.jahr) {
    const g = pool.filter((a) => a.jahr === opts.jahr);
    if (g.length >= noetig) {
      pool = g;
      einschraenkungen.push(`gleiche Ausgabe ${opts.jahr}`);
    } else if (g.length !== pool.length) {
      hinweise.push(`Zu wenige Angebote mit Ausgabe ${opts.jahr} → alle Ausgaben verglichen`);
      gelockert = true;
    }
  }

  let gleicherZustand = false;
  if (r.nurGleicherZustand) {
    const g = pool.filter((a) => zustandAusText(a.zustandText) === opts.zustand);
    if (g.length >= noetig) {
      pool = g;
      gleicherZustand = true;
      einschraenkungen.push(`Zustand ${ZUSTAND_LABEL[opts.zustand]}`);
    } else {
      hinweise.push(`Zu wenige Angebote im Zustand ${ZUSTAND_LABEL[opts.zustand]} → alle Zustände verglichen`);
      gelockert = true;
    }
  }

  // Ausreißer nach unten: z. B. ein falsch eingestelltes Angebot für 1 € zwischen lauter 20-€-Angeboten
  if (robust.ausreisserUebergehen) {
    const raus = ausreisserUnten(pool.map((a) => a.gesamt));
    if (raus.size > 0 && pool.length - raus.size >= noetig) {
      for (const i of raus) {
        uebergangen.push({ angebot: pool[i], grund: 'Ausreißer weit unter dem Markt' });
        hinweise.push(`Ausreißer übergangen: ${kurz(pool[i])} (weit unter dem Rest)`);
      }
      pool = pool.filter((_, i) => !raus.has(i));
    }
  }
  // Großhändler unterbieten jeden – ihr Preis ist eher die Untergrenze des Marktes als ein Vergleich
  if (robust.grosshaendlerUebergehen) {
    const gross = pool.filter(istGrosshaendler);
    if (gross.length > 0 && pool.length - gross.length >= noetig) {
      for (const a of gross) {
        uebergangen.push({ angebot: a, grund: 'Großhändler-Preis' });
        hinweise.push(`Großhändler übergangen: ${kurz(a)}`);
      }
      pool = pool.filter((a) => !istGrosshaendler(a));
    }
  }

  const anker = pool.length ? pool[Math.min(noetig - 1, pool.length - 1)] : null;
  const zweitguenstigstes = r.anker === 'zweitguenstigstes' && pool.length > 1;
  if (anker && r.anker === 'zweitguenstigstes' && pool.length === 1) {
    hinweise.push('Nur ein vergleichbares Angebot → das günstigste genommen');
  }
  // Ein einzelnes Angebot ganz unten ist Zufall; das Mittel der zwei günstigsten ist stabiler
  const mittel = r.anker === 'guenstigstes' && robust.mittelAusZweiAb > 0 && pool.length >= robust.mittelAusZweiAb;
  const ankerAngebote = !anker ? [] : mittel ? pool.slice(0, 2) : [anker];
  const wert = !anker ? null : mittel ? Math.round(((pool[0].gesamt + pool[1].gesamt) / 2) * 100) / 100 : anker.gesamt;
  const zusatz = einschraenkungen.length ? ` (${einschraenkungen.join(', ')})` : '';

  return {
    anker,
    zweitguenstigstes,
    gleicherZustand,
    bezeichnung: mittel
      ? `Mittel der 2 günstigsten Angebote${zusatz}`
      : `${zweitguenstigstes ? 'zweitgünstigstes' : 'günstigstes'} Angebot${zusatz}`,
    hinweise,
    wert,
    angebote: ankerAngebote,
    gelockert,
    uebergangen,
  };
}

// ---------- Preis berechnen ----------

interface Basis {
  rohwert: number;
  /** true, wenn der Neupreis die Referenz war (dann wird abgerundet) */
  neupreisBasis: boolean;
  prozent: number;
  euroZuschlag: number;
  quelle: PreisErgebnis['quelle'];
  anker: Angebot | null;
  vergleichspreis: number | null;
  schritte: Rechenschritt[];
  notizen: string[];
  /** Hinweis bei unsicherem Vergleich */
  pruefen?: string;
  ankerAngebote: Angebot[];
  gelockert: boolean;
  uebergangen: AnkerWahl['uebergangen'];
}

function basisRechnen(e: PreisEingabe, merkmale: Merkmal[], zr: ZweigRegeln, r: PreisRegeln): Basis | null {
  /**
   * Gebraucht muss günstiger als neu sein: Referenz ist der niedrigere von Marktpreis
   * und Neupreis. Alle Prozent-Posten beziehen sich auf diese Referenz, damit jede Zeile
   * für sich lesbar ist („Zustand Gut − 10 % = − 1,20 €“) und die Reihenfolge egal bleibt.
   */
  const mitAnker = (preis: number, bezeichnung: string, zustandSchonDrin = false) => {
    const neupreis = e.neupreis != null && e.neupreis > 0 ? e.neupreis : null;
    const neupreisBasis = neupreis != null && neupreis < preis - 0.005;
    const referenz = neupreisBasis ? neupreis! : preis;
    const schritte: Rechenschritt[] = [
      {
        art: 'anker',
        label: neupreisBasis ? `Neupreis ${euro(neupreis!)} (Markt ${euro(preis)})` : `Vergleich: ${bezeichnung}`,
        wert: euro(referenz),
      },
    ];
    let prozent = 0;
    let euroZuschlag = 0;
    const posten = (label: string, anteil: number) => {
      if (Math.abs(anteil) < 0.0001) return;
      prozent += anteil;
      schritte.push({
        art: anteil < 0 ? 'abschlag' : 'zuschlag',
        label: `${label} ${prozentText(anteil)}`,
        wert: betragText(referenz * anteil),
      });
    };
    const k = r.knappheit;
    const n = e.anzahlAngebote ?? e.angebote?.length ?? null;
    const wenig = n != null && n > 0 && n <= k.nichtUnterbietenBis;
    // Laden unterbietet den Markt; im Lager meist 0 → keine Zeile.
    // Bei ganz wenigen Vergleichen ist der Preis selbst unsicher → nicht noch drunter gehen.
    if (wenig && zr.marktAbschlag > 0) {
      schritte.push({ art: 'grenze', label: `Nur ${n} Vergleich${n === 1 ? '' : 'e'} → nicht unterboten` });
    } else {
      posten('Unter Markt', -zr.marktAbschlag);
    }
    if (zustandSchonDrin) {
      schritte.push({ art: 'grenze', label: `Zustand ${ZUSTAND_LABEL[e.zustand]}: steckt schon im Vergleich` });
    } else {
      posten(`Zustand ${ZUSTAND_LABEL[e.zustand]}`, r.zustand[e.zustand] ?? 0);
    }
    const jahr = Number(e.jahr?.match(/\d{4}/)?.[0]);
    const neu = Number.isFinite(jahr) && jahr >= (e.jetzt ?? new Date()).getFullYear() - k.neuBisJahre;
    const lieferbar = !!e.angebote?.some((a) => a.neu);
    if (n != null && n > 0) {
      if (e.marktUnvollstaendig && n <= 6) {
        schritte.push({ art: 'grenze', label: 'Eine Preisquelle fehlt → Knappheit nicht gewertet' });
      } else if ((neu || lieferbar) && n <= 6) {
        schritte.push({ art: 'grenze', label: `${neu ? `Neuerscheinung ${jahr}` : 'Noch neu lieferbar'} → Knappheit nicht gewertet` });
      } else if (n === 1) posten('Knappheit: 1 Angebot', k.einAngebot);
      else if (n <= 3) posten(`Knappheit: ${n} Angebote`, k.zweiDrei);
      else if (n <= 6) posten(`Knappheit: ${n} Angebote`, k.vierSechs);
      else if (n >= k.massenwareAb) posten(`Massenware: ${n} Angebote`, -k.massenware);
    }
    for (const m of merkmale) {
      const z = r.merkmale[m];
      if (!z || z.wert <= 0) continue; // Merkmale wirken nur positiv
      if (z.art === 'prozent') posten(MERKMAL_LABEL[m], z.wert);
      else {
        euroZuschlag += z.wert;
        schritte.push({ art: 'zuschlag', label: MERKMAL_LABEL[m], wert: betragText(z.wert) });
      }
    }
    const rohwert = Math.max(0, referenz * (1 + prozent) + euroZuschlag);
    if (schritte.length > 1) schritte.push({ art: 'summe', label: '=', wert: euro(rohwert) });
    const pruefen = wenig ? `Nur ${n} Vergleich${n === 1 ? '' : 'e'} online – Preis selbst prüfen` : undefined;
    return { rohwert, prozent, euroZuschlag, neupreisBasis, schritte, pruefen };
  };

  // 1. Von Hand gewähltes Vergleichsangebot
  if (e.vergleichspreis != null && e.vergleichspreis > 0) {
    const x = mitAnker(e.vergleichspreis, 'gewähltes Angebot');
    return {
      ...x,
      quelle: 'vergleich',
      anker: e.angebote?.find((a) => Math.abs(a.gesamt - e.vergleichspreis!) < 0.005) ?? null,
      ankerAngebote: e.angebote?.filter((a) => Math.abs(a.gesamt - e.vergleichspreis!) < 0.005).slice(0, 1) ?? [],
      vergleichspreis: e.vergleichspreis,
      notizen: [],
      gelockert: false,
      uebergangen: [],
    };
  }

  // 2. Anker nach Regel aus den Angeboten wählen
  if (e.angebote?.length) {
    const wahl = waehleAnker(e.angebote, zr, { zustand: e.zustand, jahr: e.jahr, robust: r.robust });
    if (!wahl.anker || wahl.wert == null) return null;
    const x = mitAnker(wahl.wert, wahl.bezeichnung, wahl.gleicherZustand);
    return {
      ...x,
      quelle: 'vergleich',
      anker: wahl.anker,
      ankerAngebote: wahl.angebote,
      vergleichspreis: wahl.wert,
      notizen: wahl.hinweise,
      gelockert: wahl.gelockert,
      uebergangen: wahl.uebergangen,
    };
  }

  // 3. Eigene Schätzung (bewusst ohne Auf-/Abschläge und ohne Neupreis-Deckel – sie ist schon das Urteil)
  if (e.schaetzpreis != null && e.schaetzpreis > 0) {
    return {
      rohwert: e.schaetzpreis,
      prozent: 0,
      euroZuschlag: 0,
      neupreisBasis: false,
      quelle: 'schaetzung',
      anker: null,
      ankerAngebote: [],
      gelockert: false,
      uebergangen: [],
      vergleichspreis: null,
      schritte: [
        { art: 'anker', label: 'eigene Schätzung (kein Online-Vergleich)', wert: euro(e.schaetzpreis) },
      ],
      notizen: [],
    };
  }

  return null;
}

export function berechnePreis(e: PreisEingabe, r: PreisRegeln = STANDARD_REGELN): PreisErgebnis | null {
  const hinweise: string[] = [];
  const notizen: string[] = [];
  const merkmale = new Set<Merkmal>(e.merkmale);

  const merkmalListe = [...merkmale];

  // Immer erst der Ladenpreis: er entscheidet, ob das Buch überhaupt ins Lager geht.
  const laden = basisRechnen(e, merkmalListe, r.laden, r);
  if (!laden) return null;

  let basis = laden;
  let zweig: Zweig = 'laden';
  let schritte: Rechenschritt[] = [];

  if (laden.rohwert >= r.lagerAb) {
    if (laden.quelle === 'vergleich') {
      const lager = basisRechnen(e, merkmalListe, r.lager, r);
      // Drückt der Neupreis auch den Lagerpreis unter die Lagergrenze, bleibt das Buch im Laden.
      if (lager && lager.rohwert >= r.lagerAb) {
        basis = lager;
        zweig = 'lager';
        schritte = [
          { art: 'wechsel', label: `Laden ${euro(laden.rohwert)} ≥ ${euro(r.lagerAb)} → ins Lager` },
          ...lager.schritte,
        ];
        notizen.push(...laden.notizen, ...lager.notizen);
      } else {
        schritte = laden.schritte;
        notizen.push(...laden.notizen);
      }
    } else {
      zweig = 'lager';
      schritte = [
        ...laden.schritte,
        { art: 'wechsel', label: `${euro(laden.rohwert)} ≥ ${euro(r.lagerAb)} → ins Lager` },
      ];
      notizen.push(...laden.notizen);
    }
  } else {
    schritte = laden.schritte;
    notizen.push(...laden.notizen);
  }

  if (basis.pruefen) hinweise.push(basis.pruefen);
  for (const m of r.pruefMerkmale) {
    if (merkmale.has(m)) hinweise.push(`${MERKMAL_LABEL[m]}: lieber im Lager in Ruhe begutachten`);
  }

  let kategorie: Kategorie;
  let vorschlag: number;
  // Ist der Neupreis die Referenz, wird abgerundet, damit der Preis sicher darunter bleibt.
  const runden = basis.neupreisBasis ? 'ab' : r.rundung;
  const rasterText = `Raster ${euro(r.raster)}${runden === 'ab' ? ' · abgerundet' : ''}`;

  if (zweig === 'lager') {
    kategorie = 'lager';
    vorschlag = aufRaster(basis.rohwert, r.raster, runden);
    schritte.push({ art: 'raster', label: rasterText, wert: euro(vorschlag) });
  } else {
    const gerundet = aufRaster(basis.rohwert, r.raster, runden);
    if (gerundet < r.regalAb && r.grabbelPreise.length > 0) {
      kategorie = 'grabbel';
      // nächstgelegener Grabbelpreis
      vorschlag = r.grabbelPreise.reduce((best, p) =>
        Math.abs(p - basis.rohwert) < Math.abs(best - basis.rohwert) ? p : best,
      );
      schritte.push({ art: 'raster', label: `Bücherbox (unter ${euro(r.regalAb)})`, wert: euro(vorschlag) });
    } else {
      kategorie = 'regal';
      vorschlag = Math.max(gerundet, r.regalAb);
      schritte.push({ art: 'raster', label: rasterText, wert: euro(vorschlag) });
    }
  }

  return {
    vorschlag,
    kategorie,
    zweig,
    rohwert: Math.round(basis.rohwert * 100) / 100,
    prozent: basis.prozent,
    euroZuschlag: basis.euroZuschlag,
    quelle: basis.quelle,
    anker: basis.anker,
    ankerAngebote: basis.ankerAngebote,
    gelockert: basis.gelockert,
    uebergangen: basis.uebergangen,
    vergleichspreis: basis.vergleichspreis,
    merkmale: merkmalListe,
    schritte,
    notizen,
    hinweise,
  };
}

// Intern heißt die günstigste Kategorie weiter „grabbel“ (gespeicherte Daten, CSV); angezeigt wird „Bücherbox“.
export const KATEGORIE_LABEL: Record<Kategorie, string> = {
  grabbel: 'Bücherbox',
  regal: 'Regal',
  lager: 'Ins Lager',
};

/**
 * Kategorie, die zum tatsächlichen Endpreis passt – auch wenn der Preis von Hand geändert wurde:
 * - unter „Regal ab“ (also 1 €/2 €) → Bücherbox, egal was vorher berechnet war
 * - ein Bücherbox-Buch, das von Hand teurer gemacht wurde → Regal (ab „Lager ab“: Lager)
 * - sonst bleibt die berechnete Kategorie (Regal ↔ Lager entscheidet die Rechnung, nicht der Feinschliff)
 */
export function kategorieFuerEndpreis(endpreis: number, berechnet: Kategorie, r: Pick<PreisRegeln, 'regalAb' | 'lagerAb'>): Kategorie {
  if (endpreis < r.regalAb - 0.001) return 'grabbel';
  if (berechnet === 'grabbel') return endpreis >= r.lagerAb ? 'lager' : 'regal';
  return berechnet;
}

export const ZWEIG_LABEL: Record<Zweig, string> = {
  laden: 'Laden-Regeln',
  lager: 'Lager-Regeln',
};
