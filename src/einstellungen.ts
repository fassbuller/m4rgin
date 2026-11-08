import { PreisRegeln, STANDARD_REGELN, ZweigRegeln } from './lib/preis';
import { LinkVorlage, STANDARD_LINKS } from './lib/links';
import { KiEinstellungen, STANDARD_KI } from './lib/ki';
import { EurobuchZugang } from './lib/quellen/eurobuch';
import { EbayZugang } from './lib/quellen/ebay';
import { BooklookerZugang } from './lib/quellen/booklooker';
import { SeltenheitsRegeln, STANDARD_SELTENHEIT } from './lib/seltenheit';

export interface Einstellungen {
  regeln: PreisRegeln;
  links: LinkVorlage[];
  ki: KiEinstellungen;
  booklooker: BooklookerZugang;
  eurobuch: EurobuchZugang;
  ebay: EbayZugang;
  /** Versand, wenn eine Quelle keinen nennt (eurobuch nennt nie welchen) */
  versandPauschale: number;
  /** Wikipedia-Interesse + Neuauflage abfragen */
  trendAktiv: boolean;
  /** Wie ManaBox' Quick-Mode: genau ein Treffer → direkt weiter, sonst Auswahl */
  schnellmodus: boolean;
  /** Google-Books-Schlüssel für Cover; ohne geht's auch, fällt aber oft wegen des geteilten Tageslimits aus */
  googleBooksKey: string;
  /** Seltenheitsstufen, Glitzer-Effekte, Fehlalarm-Schutz */
  seltenheit: SeltenheitsRegeln;
}

export const STANDARD_EINSTELLUNGEN: Einstellungen = {
  regeln: STANDARD_REGELN,
  links: STANDARD_LINKS,
  ki: STANDARD_KI,
  booklooker: { aktiv: true, pid: '' }, // Partner-ID bei booklooker beantragen
  // Testzugang laut eurobuch-Doku – liefert echte Daten, aber ohne Provision; echten Zugang beantragen
  // Kein fest eingebauter Testzugang mehr (der wird gedrosselt) – echten Partnerzugang eintragen
  eurobuch: { aktiv: true, benutzer: '', passwort: '' },
  ebay: { aktiv: false, clientId: '', clientSecret: '' },
  versandPauschale: 3,
  trendAktiv: true,
  schnellmodus: true,
  googleBooksKey: '',
  seltenheit: STANDARD_SELTENHEIT,
};

/**
 * Zahl aus gespeicherten Einstellungen prüfen: keine Zahl (kaputt, Text, NaN) → Standard,
 * sonst in den sinnvollen Bereich klemmen. Schützt z. B. vor Raster 0 (Endlos-Rundung) oder −500 %.
 */
export function geprueft(v: unknown, standard: number, min: number, max: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : standard;
}

/** Alle Zahlen eines Objekts mit gleichem Bereich prüfen (Zustands-Prozente, Knappheit …). */
function alleGeprueft<T extends { [K in keyof T]: number }>(d: T, s: Partial<T> | undefined, min: number, max: number): T {
  const out = { ...d };
  for (const k of Object.keys(d) as (keyof T)[]) out[k] = geprueft(s?.[k], d[k], min, max) as T[keyof T];
  return out;
}

/** Ältere Stände: Abschlag je Zustand, Merkmale verkleinerten ihn, „Mindestabschlag“ als Untergrenze. */
type AltZweig = Partial<ZweigRegeln> & { abschlagMin?: number };

function zweigMitStandards(d: ZweigRegeln, s?: AltZweig | null): ZweigRegeln {
  return {
    anker: s?.anker ?? d.anker,
    // Der alte Mindestabschlag war faktisch das Unterbieten des Markts
    marktAbschlag: geprueft(s?.marktAbschlag ?? s?.abschlagMin, d.marktAbschlag, 0, 0.9),
    nurGleicheAusgabe: s?.nurGleicheAusgabe ?? d.nurGleicheAusgabe,
    nurGleicherZustand: s?.nurGleicherZustand ?? d.nurGleicherZustand,
  };
}

/**
 * Preisregeln mit Standardwerten auffüllen. Ältere Stände hatten nur einen flachen
 * Regelsatz – der wird als Laden-Regeln übernommen. Die alten Zustands-Abschläge passen
 * nicht zur neuen ±-Rechnung und werden durch die Standards ersetzt.
 */
export function regelnMitStandards(gespeichert?: Partial<PreisRegeln> | null): PreisRegeln {
  const d = STANDARD_REGELN;
  const s = gespeichert ?? {};
  const ladenAlt: AltZweig = s.laden ?? (s as AltZweig);
  return {
    laden: zweigMitStandards(d.laden, ladenAlt),
    lager: zweigMitStandards(d.lager, s.lager),
    zustand: alleGeprueft(d.zustand, s.zustand, -0.9, 1),
    merkmale: Object.fromEntries(
      (Object.keys(d.merkmale) as (keyof typeof d.merkmale)[]).map((m) => {
        const z = s.merkmale?.[m];
        const art = z?.art === 'euro' || z?.art === 'prozent' ? z.art : d.merkmale[m].art;
        return [m, { art, wert: geprueft(z?.wert, d.merkmale[m].wert, 0, art === 'euro' ? 100000 : 5) }];
      }),
    ) as PreisRegeln['merkmale'],
    raster: geprueft(s.raster, d.raster, 0.05, 50),
    rundung: s.rundung === 'ab' || s.rundung === 'naechst' ? s.rundung : d.rundung,
    grabbelPreise: (s.grabbelPreise ?? []).filter((x) => typeof x === 'number' && x > 0).length
      ? s.grabbelPreise!.filter((x) => typeof x === 'number' && x > 0)
      : d.grabbelPreise,
    regalAb: geprueft(s.regalAb, d.regalAb, 0, 10000),
    lagerAb: geprueft(s.lagerAb, d.lagerAb, 0, 100000),
    knappheit: {
      ...alleGeprueft(d.knappheit, s.knappheit, 0, 3),
      massenwareAb: Math.round(geprueft(s.knappheit?.massenwareAb, d.knappheit.massenwareAb, 7, 10000)),
      massenware: geprueft(s.knappheit?.massenware, d.knappheit.massenware, 0, 0.9),
      nichtUnterbietenBis: Math.round(geprueft(s.knappheit?.nichtUnterbietenBis, d.knappheit.nichtUnterbietenBis, 0, 50)),
      neuBisJahre: Math.round(geprueft(s.knappheit?.neuBisJahre, d.knappheit.neuBisJahre, 0, 50)),
    },
    pruefMerkmale: s.pruefMerkmale?.length ? s.pruefMerkmale : d.pruefMerkmale,
    robust: {
      ausreisserUebergehen: s.robust?.ausreisserUebergehen ?? d.robust.ausreisserUebergehen,
      grosshaendlerUebergehen: s.robust?.grosshaendlerUebergehen ?? d.robust.grosshaendlerUebergehen,
      mittelAusZweiAb: Math.round(geprueft(s.robust?.mittelAusZweiAb, d.robust.mittelAusZweiAb, 0, 100)),
    },
  };
}

/** Gespeicherte Einstellungen mit Standardwerten auffüllen (falls neue Felder dazukommen). */
export function mitStandards(gespeichert: Partial<Einstellungen> | null): Einstellungen {
  const s = gespeichert ?? {};
  const d = STANDARD_EINSTELLUNGEN;
  return {
    regeln: regelnMitStandards(s.regeln),
    links: s.links?.length ? s.links : d.links,
    ki: { ...d.ki, ...s.ki },
    booklooker: { ...d.booklooker, ...s.booklooker },
    eurobuch: { ...d.eurobuch, ...s.eurobuch },
    ebay: { ...d.ebay, ...s.ebay },
    versandPauschale: geprueft(s.versandPauschale, d.versandPauschale, 0, 100),
    trendAktiv: s.trendAktiv ?? d.trendAktiv,
    schnellmodus: s.schnellmodus ?? d.schnellmodus,
    googleBooksKey: s.googleBooksKey ?? d.googleBooksKey,
    seltenheit: {
      ...d.seltenheit,
      ...s.seltenheit,
      ...alleGeprueft(
        {
          gefragtBisAngebote: d.seltenheit.gefragtBisAngebote, seltenBisAngebote: d.seltenheit.seltenBisAngebote,
          raritaetBisAngebote: d.seltenheit.raritaetBisAngebote, gefragtAbPreis: d.seltenheit.gefragtAbPreis,
          seltenAbPreis: d.seltenheit.seltenAbPreis, raritaetAbPreis: d.seltenheit.raritaetAbPreis,
          neuBisJahre: d.seltenheit.neuBisJahre,
        },
        s.seltenheit,
        0,
        100000,
      ),
      altVor: geprueft(s.seltenheit?.altVor, d.seltenheit.altVor, 1450, 2100),
      bestaetigungsSpanne: geprueft(s.seltenheit?.bestaetigungsSpanne, d.seltenheit.bestaetigungsSpanne, 0.05, 2),
      neuUeberNeupreis: geprueft(s.seltenheit?.neuUeberNeupreis, d.seltenheit.neuUeberNeupreis, 0, 5),
    },
  };
}

/** "3,50" → 3.5; leer/ungültig → null */
export function parseZahl(s: string): number | null {
  const n = Number(s.trim().replace(/\s|€/g, '').replace(',', '.'));
  return s.trim() && Number.isFinite(n) ? n : null;
}

export const zahlText = (n: number | null | undefined): string =>
  n == null ? '' : String(n).replace('.', ',');
