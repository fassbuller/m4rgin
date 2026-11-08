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
  eurobuch: { aktiv: true, benutzer: 'test', passwort: 'test' },
  ebay: { aktiv: false, clientId: '', clientSecret: '' },
  versandPauschale: 3,
  trendAktiv: true,
  schnellmodus: true,
  googleBooksKey: '',
  seltenheit: STANDARD_SELTENHEIT,
};

/** Ältere Stände: Abschlag je Zustand, Merkmale verkleinerten ihn, „Mindestabschlag“ als Untergrenze. */
type AltZweig = Partial<ZweigRegeln> & { abschlagMin?: number };

function zweigMitStandards(d: ZweigRegeln, s?: AltZweig | null): ZweigRegeln {
  return {
    anker: s?.anker ?? d.anker,
    // Der alte Mindestabschlag war faktisch das Unterbieten des Markts
    marktAbschlag: s?.marktAbschlag ?? s?.abschlagMin ?? d.marktAbschlag,
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
    zustand: { ...d.zustand, ...s.zustand },
    merkmale: { ...d.merkmale, ...s.merkmale },
    raster: s.raster ?? d.raster,
    rundung: s.rundung ?? d.rundung,
    grabbelPreise: s.grabbelPreise?.length ? s.grabbelPreise : d.grabbelPreise,
    regalAb: s.regalAb ?? d.regalAb,
    lagerAb: s.lagerAb ?? d.lagerAb,
    knappheit: { ...d.knappheit, ...s.knappheit },
    pruefMerkmale: s.pruefMerkmale?.length ? s.pruefMerkmale : d.pruefMerkmale,
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
    versandPauschale: s.versandPauschale ?? d.versandPauschale,
    trendAktiv: s.trendAktiv ?? d.trendAktiv,
    schnellmodus: s.schnellmodus ?? d.schnellmodus,
    googleBooksKey: s.googleBooksKey ?? d.googleBooksKey,
    seltenheit: { ...d.seltenheit, ...s.seltenheit },
  };
}

/** "3,50" → 3.5; leer/ungültig → null */
export function parseZahl(s: string): number | null {
  const n = Number(s.trim().replace(/\s|€/g, '').replace(',', '.'));
  return s.trim() && Number.isFinite(n) ? n : null;
}

export const zahlText = (n: number | null | undefined): string =>
  n == null ? '' : String(n).replace('.', ',');
