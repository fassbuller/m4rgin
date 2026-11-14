// Ladenplan: Wo steht ein Buch bei Hennwack vermutlich? (Raum + Abteilung, nicht regalgenau)
// Nachbau von firestream2/ladenplan/referenz.js (Spezifikation: firestream2/ladenplan/spec.md, Stand 14.11.2026,
// firestream2 f0ba299 / v0.99.128). Der Plan selbst (ladenplan-v1.json) ist eine Kopie von dort; in Firestream
// pflegt ihn die Administration in Haven (Verwaltung → Betrieb → Ladenplan). Die Testfälle aus
// firestream2/ladenplan/test.js laufen in test/ladenplan.test.ts mit – sie sind der Maßstab.
//
// Grundidee: Die DNB-Sachgruppe ist nur ein Merkmal. Der Raum hängt immer an Hennwacks eigener Abteilung,
// denn z. B. Feminismus, Gewerkschaften und Antisemitismus sind bei der DNB alle Gruppe 300, stehen bei
// Hennwack aber in drei Räumen. Jede Abteilung hat Bedingungen (eine reicht, innerhalb einer müssen alle Felder
// passen) und eine Priorität; die höchste passende gewinnt, Alternativen kommen aus anderen Räumen.

import PLAN_V1 from './ladenplan-v1.json';

export interface Raum {
  id: string;
  name: string;
  farbe: string;
  reihenfolge: number;
  /** Umriss im Koordinatensystem von grundriss.viewBox */
  punkte?: [number, number][];
}

export type Bedingung = Partial<
  Record<'dnb' | 'status' | 'sprache' | 'sprache_nicht' | 'schlagwort' | 'geografikum_nicht' | 'reihe' | 'medium' | 'erschienen_monate', string[]>
>;

export interface Abteilung {
  id: string;
  name: string;
  raum: string;
  prioritaet: number;
  hinweis?: string;
  wenn: Bedingung[];
  rueckfall?: boolean;
}

export interface Ladenplan {
  version: number;
  stand: string;
  raeume: Raum[];
  abteilungen: Abteilung[];
  grundriss?: { viewBox: [number, number, number, number]; eingang?: [number, number] };
  anzeige?: { alternativen?: number; hinweis_geraten?: string };
}

/** Das Buch, wie die Regeln es sehen (aus der DNB-Sacherschließung, siehe erschliessung.ts) */
export interface LadenBuch {
  dnb?: string[] | string;
  sprache?: string[] | string;
  schlagwoerter?: string[] | string;
  geografika?: string[] | string;
  form?: string[] | string;
  reihen?: string[] | string;
  medium?: string[] | string;
  /** „2026-07“ oder „2026“ */
  erschienen?: string;
  /** m4rgin kauft gebraucht an → immer „antiquarisch“ */
  status?: 'neu' | 'antiquarisch';
}

export interface Platz {
  abteilung: string;
  name: string;
  raum: string;
  raumName: string;
}

export interface Standort {
  vorschlag: Platz;
  alternativen: Platz[];
  /** Nur die Rückfall-Abteilung hat gepasst – „Kein klarer Platz, am ehesten …“ */
  geraten: boolean;
}

export const LADENPLAN: Ladenplan = PLAN_V1 as unknown as Ladenplan;

const entschaerfe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Begriff steht an einem Wortanfang („Krimi“ passt auf „Kriminalroman“, „SED“ nicht auf „Sedimente“) */
const wortanfang = (begriff: string, text: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${entschaerfe(begriff)}`, 'u').test(text);
const trifft = (begriffe: string[], werte: string[]) => werte.some((w) => begriffe.some((b) => wortanfang(b, w)));

/** Alter in Monaten. erschienen = „2026-03“ oder nur „2026“ (dann ab Jahresmitte), heute = „2026-11“. */
export function alterMonate(erschienen: string | undefined, heute: string): number | null {
  const m = /^(\d{4})(?:-(\d{2}))?/.exec(String(erschienen || ''));
  if (!m) return null;
  const [hj, hm] = heute.split('-').map(Number);
  return (hj - Number(m[1])) * 12 + hm - (m[2] ? Number(m[2]) : 7);
}

const monat = (h?: Date | string) =>
  typeof h === 'string' ? h.slice(0, 7) : ((d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)(h ?? new Date());

interface Normal {
  dnb: string[];
  status: string;
  sprache: string[];
  schlagwoerter: string[];
  geografika: string[];
  reihen: string[];
  medium: string[];
  erschienen: string;
  heute: string;
}

function erfuellt(bed: Bedingung, b: Normal): boolean {
  for (const [feld, liste] of Object.entries(bed) as [string, string[]][]) {
    switch (feld) {
      case 'dnb': if (!b.dnb.some((x) => liste.includes(x))) return false; break;
      case 'status': if (!liste.includes(b.status)) return false; break;
      case 'sprache': if (!b.sprache.some((x) => liste.includes(x))) return false; break;
      case 'sprache_nicht': if (!b.sprache.length || b.sprache.some((x) => liste.includes(x))) return false; break;
      case 'schlagwort': if (!trifft(liste, b.schlagwoerter)) return false; break;
      case 'geografikum_nicht': if (!b.geografika.length || trifft(liste, b.geografika)) return false; break;
      case 'reihe': if (!trifft(liste, b.reihen)) return false; break;
      case 'medium': if (!trifft(liste, b.medium)) return false; break;
      case 'erschienen_monate': {
        const alter = alterMonate(b.erschienen, b.heute);
        if (alter === null || alter > Math.max(...liste.map(Number))) return false;
        break;
      }
      default:
        throw new Error(`Unbekanntes Bedingungsfeld: ${feld}`);
    }
  }
  return true;
}

function normalisiere(buch: LadenBuch, heute?: Date | string): Normal {
  const liste = (x: unknown): string[] => (Array.isArray(x) ? x.map(String) : x ? [String(x)] : []);
  const geografika = liste(buch.geografika);
  return {
    dnb: liste(buch.dnb),
    status: buch.status || 'antiquarisch',
    sprache: liste(buch.sprache),
    schlagwoerter: liste(buch.schlagwoerter).concat(geografika, liste(buch.form)),
    geografika,
    reihen: liste(buch.reihen),
    medium: liste(buch.medium),
    erschienen: buch.erschienen || '',
    heute: monat(heute),
  };
}

/** Wo könnte das Buch stehen? heute: Datum oder „JJJJ-MM“ (Standard: jetzt) – wichtig für „Neue Bücher“. */
export function standort(plan: Ladenplan, buch: LadenBuch, heute?: Date | string): Standort {
  const b = normalisiere(buch, heute);
  const raum = Object.fromEntries(plan.raeume.map((r) => [r.id, r]));
  const treffer = plan.abteilungen
    .filter((a) => a.wenn.some((bed) => erfuellt(bed, b)))
    .sort((x, y) => y.prioritaet - x.prioritaet); // stabil: bei Gleichstand gilt die Reihenfolge in der Datei
  const echt = treffer.filter((a) => !a.rueckfall);
  const liste = (echt.length ? echt : treffer).map((a) => ({ abteilung: a.id, name: a.name, raum: a.raum, raumName: raum[a.raum]?.name ?? a.raum }));
  const [vorschlag, ...rest] = liste;
  const gesehen = new Set([vorschlag.raum]);
  const anzahl = Math.max(0, Math.min(2, plan.anzeige?.alternativen ?? 2));
  const alternativen = rest.filter((x) => !gesehen.has(x.raum) && gesehen.add(x.raum)).slice(0, anzahl);
  return { vorschlag, alternativen, geraten: !echt.length };
}

/** Formale Prüfung eines Plans (wie in Haven vor dem Speichern) */
export function pruefe(plan: Ladenplan): string[] {
  const fehler: string[] = [];
  const raeume = new Set(plan.raeume.map((r) => r.id));
  const ids = new Set<string>();
  for (const a of plan.abteilungen) {
    if (ids.has(a.id)) fehler.push(`Doppelte Abteilung: ${a.id}`);
    ids.add(a.id);
    if (!raeume.has(a.raum)) fehler.push(`${a.id}: unbekannter Raum ${a.raum}`);
    if (!Array.isArray(a.wenn) || !a.wenn.length) fehler.push(`${a.id}: keine Bedingung`);
  }
  if (plan.abteilungen.filter((a) => a.rueckfall).length !== 1) fehler.push('Es muss genau eine Rückfall-Abteilung geben.');
  return fehler;
}

export function raumVon(plan: Ladenplan, id: string): Raum | undefined {
  return plan.raeume.find((r) => r.id === id);
}

/** Ein Satz für Anzeige und Screenreader: „Wintergarten · Lyrik“ bzw. „Kein klarer Platz, am ehesten Mittelraum“ */
export function standortText(plan: Ladenplan, s: Standort): string {
  if (s.geraten) {
    const vorlage = plan.anzeige?.hinweis_geraten ?? 'Kein klarer Platz, am ehesten {raum}';
    return vorlage.includes('{raum}') ? vorlage.replace('{raum}', s.vorschlag.raumName) : `${vorlage} ${s.vorschlag.raumName}`;
  }
  return `${s.vorschlag.raumName} · ${s.vorschlag.name}`;
}
