// Seltenheitsstufen wie bei Sammelkarten: gewöhnlich → gefragt → selten → Rarität.
// Grundlage sind Angebotszahl, Preis, Alter und Merkmale. Damit kein Glitzer für Fehlalarme kommt,
// prüft ein Schutz, ob die Gründe belastbar sind – sonst gibt es nur ein gedämpftes „prüfen“.

import type { Merkmal } from './preis';
import type { Ampel } from './konfidenz';
import { SAMMEL } from './pruefung';

export type Stufe = 'gewoehnlich' | 'gefragt' | 'selten' | 'raritaet';
export const STUFEN: Stufe[] = ['gewoehnlich', 'gefragt', 'selten', 'raritaet'];
export const STUFE_LABEL: Record<Stufe, string> = {
  gewoehnlich: 'Gewöhnlich',
  gefragt: 'Gefragt',
  selten: 'Selten',
  raritaet: 'Rarität',
};

export interface SeltenheitsRegeln {
  /** Glitzer, Glanz, Funkeln … (Abzeichen gibt es immer) */
  effekte: boolean;
  /** Vibration beim Scannen eines bestätigt seltenen Buchs */
  vibration: boolean;
  /** Vollbild-Feier mit Teilen-Karte bei bestätigt seltenen Büchern */
  feier: boolean;
  /** Kurzes Aufklappen der Buch-Karte bei jedem Scan (ohne große Feier) */
  aufklappen: boolean;
  /** Karten neigen sich leicht mit dem Handy (3D) */
  neigung: boolean;
  gefragtBisAngebote: number;
  seltenBisAngebote: number;
  raritaetBisAngebote: number;
  gefragtAbPreis: number;
  seltenAbPreis: number;
  raritaetAbPreis: number;
  /** Erscheinungsjahr vor diesem Jahr gilt als „alt“ */
  altVor: number;
  /** Ein bestätigender Vergleich darf so weit vom Vergleichspreis abweichen (0.35 = ±35 %) */
  bestaetigungsSpanne: number;
  /**
   * Neuerscheinung: erschienen in den letzten so vielen Jahren. Wenige Gebrauchtangebote heißen dann
   * nur „noch neu“, ein hoher Preis meist nur „teures neues Buch“ → zählt nicht als selten.
   */
  neuBisJahre: number;
  /** Neuerscheinung zählt nach Preis nur, wenn sie so viel über dem Neupreis gehandelt wird (0.2 = +20 %) */
  neuUeberNeupreis: number;
}

export const STANDARD_SELTENHEIT: SeltenheitsRegeln = {
  effekte: true,
  vibration: true,
  feier: true,
  aufklappen: true,
  neigung: true,
  gefragtBisAngebote: 10,
  seltenBisAngebote: 3,
  raritaetBisAngebote: 1,
  gefragtAbPreis: 15,
  seltenAbPreis: 40,
  raritaetAbPreis: 100,
  altVor: 1950,
  bestaetigungsSpanne: 0.35,
  neuBisJahre: 3,
  neuUeberNeupreis: 0.2,
};

export interface SeltenheitsEingabe {
  /** Zahl der Online-Angebote; null = Markt (noch) unbekannt */
  anzahl: number | null;
  /** Vorgeschlagener bzw. gewählter Preis */
  preis: number | null;
  /** Vergleichspreis (Anker) */
  vergleich?: number | null;
  jahr?: string | null;
  merkmale: Merkmal[];
  /** neu = Neubuch-Angebot eines Händlers (Buch ist noch lieferbar) */
  angebote?: { gesamt: number; titel?: string; zustandText?: string; neu?: boolean }[];
  /** Neupreis laut DNB – für Neuerscheinungen */
  neupreis?: number | null;
  /** Für Tests: „heute“ */
  jetzt?: Date;
  /** Eine Preisquelle ist ausgefallen */
  marktUnvollstaendig?: boolean;
  /** Markt per ISBN abgefragt (zuverlässige Zahl) statt per Titelsuche */
  ueberIsbn?: boolean;
  /** Wikipedia-Interesse steigt */
  interesseHoch?: boolean;
  /** Konfidenz-Ampel des Preises: Bei Rot gibt es keine bestätigte Seltenheit aus Zahl oder Preis */
  konfidenz?: Ampel;
}

export interface Seltenheit {
  stufe: Stufe;
  /** Alle Gründe sind belastbar → volle Effekte */
  bestaetigt: boolean;
  /** Warum diese Stufe */
  gruende: string[];
  /** Warum (noch) nicht bestätigt – Fehlalarm-Schutz */
  vorbehalte: string[];
  /** 0 Angebote, aber alt oder mit Merkmal: könnte eine Rarität sein */
  moeglich: boolean;
  /** Welche Darstellung: volle Show, gedämpft (nur Abzeichen/Rahmen) oder nichts */
  effekt: 'voll' | 'gedaempft' | 'keiner';
}

const rang = (s: Stufe) => STUFEN.indexOf(s);
const max = (a: Stufe, b: Stufe) => (rang(a) >= rang(b) ? a : b);

export function bewerteSeltenheit(e: SeltenheitsEingabe, r: SeltenheitsRegeln = STANDARD_SELTENHEIT): Seltenheit {
  const gruende: string[] = [];
  const vorbehalte: string[] = [];
  const jahr = Number(e.jahr?.match(/\d{4}/)?.[0]);
  const alt = Number.isFinite(jahr) && jahr > 1400 && jahr < r.altVor;
  const stark = e.merkmale.includes('erstausgabe') || e.merkmale.includes('signiert');
  const vonHandSelten = e.merkmale.includes('selten');
  const n = e.anzahl;
  const heute = (e.jetzt ?? new Date()).getFullYear();
  const neu = Number.isFinite(jahr) && jahr >= heute - r.neuBisJahre;
  // Ein Händler bietet es neu an → im Buchhandel lieferbar, also nicht selten
  const lieferbar = !!e.angebote?.some((a) => a.neu);
  const neuGrund = neu ? `Neuerscheinung (${jahr})` : lieferbar ? 'noch neu lieferbar' : null;

  // --- 0 Angebote: zweideutig – wertlos oder sehr selten. Nie Glitzer, höchstens „prüfen“.
  if (n === 0) {
    if (alt || stark || vonHandSelten) {
      return {
        stufe: 'raritaet',
        bestaetigt: false,
        moeglich: true,
        gruende: [
          'Kein Online-Angebot',
          ...(alt ? [`erschienen ${jahr}`] : []),
          ...(stark ? ['Erstausgabe/Signatur'] : []),
        ],
        vorbehalte: [
          ...(e.marktUnvollstaendig ? ['Eine Preisquelle ist ausgefallen – evtl. gibt es doch Angebote'] : []),
          'Ohne Vergleich lässt sich nicht sagen, ob es selten oder unverkäuflich ist – im Lager begutachten',
        ],
        effekt: 'gedaempft',
      };
    }
    return { stufe: 'gewoehnlich', bestaetigt: true, moeglich: false, gruende: [], vorbehalte: [], effekt: 'keiner' };
  }

  // --- Stufe aus der Angebotszahl
  let nachZahl: Stufe = 'gewoehnlich';
  // Neue bzw. lieferbare Bücher haben einfach noch wenige Gebrauchtangebote – das ist keine Seltenheit
  if (n != null && !neuGrund) {
    if (n <= r.raritaetBisAngebote && (alt || stark)) nachZahl = 'raritaet';
    else if (n <= r.seltenBisAngebote) nachZahl = 'selten';
    else if (n <= r.gefragtBisAngebote) nachZahl = 'gefragt';
    if (nachZahl !== 'gewoehnlich') gruende.push(`nur ${n} Angebot${n === 1 ? '' : 'e'} online`);
  }

  // --- Stufe aus dem Preis
  let nachPreis: Stufe = 'gewoehnlich';
  const p = e.preis ?? 0;
  // Ein teures neues Buch ist nur teuer – es sei denn, es wird deutlich über dem Neupreis gehandelt
  const preisZaehlt = !neuGrund || (e.neupreis != null && e.neupreis > 0 && p > e.neupreis * (1 + r.neuUeberNeupreis));
  if (!preisZaehlt) {
    // nichts
  } else if (p >= r.raritaetAbPreis) nachPreis = 'raritaet';
  else if (p >= r.seltenAbPreis) nachPreis = 'selten';
  else if (p >= r.gefragtAbPreis) nachPreis = 'gefragt';
  if (nachPreis !== 'gewoehnlich') gruende.push(`Preis ${p.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);

  // --- Alter + Merkmal, von Hand „selten“, Interesse
  let nachMerkmal: Stufe = 'gewoehnlich';
  if (alt && stark) {
    nachMerkmal = 'selten';
    gruende.push(`erschienen ${jahr}, Erstausgabe/Signatur`);
  }
  if (vonHandSelten) {
    nachMerkmal = max(nachMerkmal, 'selten');
    gruende.push('von Hand als selten markiert');
  }

  // --- Fehlalarm-Schutz: Welche Gründe sind belastbar?
  // 1. Angebotszahl: nur verlässlich, wenn alle Quellen geantwortet haben und per ISBN gesucht wurde.
  let zahlBelastbar = nachZahl !== 'gewoehnlich';
  if (zahlBelastbar && e.marktUnvollstaendig) {
    vorbehalte.push('Eine Preisquelle ist ausgefallen – die Angebotszahl ist zu niedrig');
    zahlBelastbar = false;
  }
  if (zahlBelastbar && e.ueberIsbn === false) {
    vorbehalte.push('Per Titel gesucht – andere Ausgaben/Schreibweisen fehlen evtl. in der Zählung');
    zahlBelastbar = false;
  }
  // 2. Preis: Ein einzelnes teures Angebot reicht nicht. Mindestens ein zweites in der Nähe muss ihn stützen –
  //    es sei denn, der Preis kommt von Merkmalen, die jemand von Hand gesetzt hat.
  let preisBelastbar = nachPreis !== 'gewoehnlich';
  if (preisBelastbar && !stark && !vonHandSelten) {
    const v = e.vergleich ?? null;
    const angebote = (e.angebote ?? []).filter((a) => !SAMMEL.test(`${a.titel ?? ''} ${a.zustandText ?? ''}`));
    const sammelAnker = (e.angebote ?? []).some(
      (a) => v != null && Math.abs(a.gesamt - v) < 0.005 && SAMMEL.test(`${a.titel ?? ''} ${a.zustandText ?? ''}`),
    );
    if (sammelAnker) {
      vorbehalte.push('Der Vergleich sieht nach Set/Konvolut aus – Einzelbuch ist meist günstiger');
      preisBelastbar = false;
    } else if (v != null) {
      const nahe = angebote.filter((a) => Math.abs(a.gesamt - v) <= v * r.bestaetigungsSpanne).length;
      if (nahe < 2) {
        vorbehalte.push('Hoher Preis stützt sich auf ein einzelnes Angebot');
        preisBelastbar = false;
      }
    } else if (e.angebote) {
      vorbehalte.push('Kein Vergleichsangebot – Preis ist eine Schätzung');
      preisBelastbar = false;
    }
  }

  // 3. Die ganze Preisermittlung ist unsicher (Ampel rot) → weder Zahl noch Preis tragen eine Enthüllung
  if (e.konfidenz === 'rot' && (zahlBelastbar || preisBelastbar)) {
    vorbehalte.push('Preisermittlung unsicher (Ampel rot) – erst prüfen');
    zahlBelastbar = false;
    preisBelastbar = false;
  }

  let stufe = max(max(nachZahl, nachPreis), nachMerkmal);
  let angehoben = false;
  if (e.interesseHoch && rang(stufe) >= rang('gefragt') && rang(stufe) < rang('raritaet')) {
    stufe = STUFEN[rang(stufe) + 1];
    angehoben = true;
    gruende.push('Interesse steigt (Wikipedia)');
  }
  if (stufe === 'gewoehnlich') {
    return { stufe, bestaetigt: true, moeglich: false, gruende: [], vorbehalte: [], effekt: 'keiner' };
  }

  // Bestätigt ist die Stufe, wenn mindestens ein belastbarer Grund sie (ohne Interesse-Bonus) trägt
  const getragen = max(
    max(zahlBelastbar ? nachZahl : 'gewoehnlich', preisBelastbar ? nachPreis : 'gewoehnlich'),
    nachMerkmal,
  );
  const getragenMitBonus = angehoben && rang(getragen) > 0 ? STUFEN[Math.min(rang(getragen) + 1, rang('raritaet'))] : getragen;
  if (rang(getragenMitBonus) >= rang(stufe)) {
    return { stufe, bestaetigt: true, moeglich: false, gruende, vorbehalte: [], effekt: 'voll' };
  }
  // Teilweise belegt: Die belegte Stufe gilt voll, die höhere bleibt ein Vorbehalt („evtl. sogar …“).
  if (rang(getragenMitBonus) > 0) {
    return {
      stufe: getragenMitBonus,
      bestaetigt: true,
      moeglich: false,
      gruende,
      vorbehalte: [`Evtl. sogar ${STUFE_LABEL[stufe]}, aber: ${vorbehalte.join('; ') || 'nicht ausreichend belegt'}`],
      effekt: 'voll',
    };
  }
  if (vorbehalte.length === 0) vorbehalte.push('Gründe nicht ausreichend belegt');
  return { stufe, bestaetigt: false, moeglich: false, gruende, vorbehalte, effekt: 'gedaempft' };
}
