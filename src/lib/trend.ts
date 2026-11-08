// Drei Trend-Signale, jedes mit nachvollziehbarer Quelle:
// 1. Angebot: eigene Marktabfragen über die Zeit (Angebotszahl + günstigster Preis)
// 2. Interesse: Wikipedia-Seitenaufrufe zu Werk oder Autor:in (Wikimedia REST API, kostenlos)
// 3. Neuauflage: neuere Ausgabe laut DNB

import { dnbSuche } from './dnb';
import { baueCql } from './suche';
import { findeWikiArtikel, WikiArtikel, wikiFetch } from './wiki';

export type Richtung = 'hoch' | 'runter' | 'gleich' | 'unbekannt';

export interface Signal {
  richtung: Richtung;
  text: string; // kurz fürs Overlay
  detail: string; // Quelle/Begründung zum Antippen
}

export function richtung(verhaeltnis: number | null, hoch = 1.3, runter = 0.77): Richtung {
  if (verhaeltnis == null || !Number.isFinite(verhaeltnis)) return 'unbekannt';
  if (verhaeltnis >= hoch) return 'hoch';
  if (verhaeltnis <= runter) return 'runter';
  return 'gleich';
}

export const PFEIL: Record<Richtung, string> = { hoch: '↗', runter: '↘', gleich: '→', unbekannt: '·' };

// ---------- 1. Angebot (aus eigenen Snapshots) ----------

export interface Snapshot {
  zeit: string;
  anzahl: number;
  min: number | null;
}

export function angebotsSignal(snaps: Snapshot[]): Signal {
  const s = [...snaps].sort((a, b) => a.zeit.localeCompare(b.zeit));
  if (s.length < 2) return { richtung: 'unbekannt', text: 'Angebot: neu', detail: 'Erste Abfrage dieses Titels – der Verlauf baut sich mit jeder Abfrage auf.' };
  const alt = s[0];
  const neu = s[s.length - 1];
  const tage = Math.round((Date.parse(neu.zeit) - Date.parse(alt.zeit)) / 86_400_000);
  if (tage < 7) return { richtung: 'unbekannt', text: 'Angebot: zu kurz', detail: `Verlauf erst ${tage} Tage alt.` };
  // Weniger Angebote = knapper = Preis eher hoch → wir zeigen die Preisrichtung
  const preisV = alt.min && neu.min ? neu.min / alt.min : null;
  const r = richtung(preisV, 1.15, 0.87);
  return {
    richtung: r,
    text: `Preis ${PFEIL[r]}`,
    detail:
      `Vor ${tage} Tagen: ${alt.anzahl} Angebote ab ${alt.min?.toFixed(2) ?? '–'} €, ` +
      `jetzt: ${neu.anzahl} Angebote ab ${neu.min?.toFixed(2) ?? '–'} € (eigene Abfragen, ${s.length} Messpunkte).`,
  };
}

// ---------- 2. Interesse (Wikipedia) ----------


const tag = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');

/** Verhältnis: Ø Aufrufe der letzten 30 Tage zu Ø der 335 Tage davor. */
export function interesseVerhaeltnis(taeglich: number[]): number | null {
  if (taeglich.length < 60) return null;
  const letzte = taeglich.slice(-30);
  const davor = taeglich.slice(0, -30);
  const a = letzte.reduce((x, y) => x + y, 0) / letzte.length;
  const b = davor.reduce((x, y) => x + y, 0) / davor.length;
  return b > 0 ? a / b : null;
}

/** autor in DNB-Form „Nachname, Vorname“ */
export async function interesseSignal(werk: string, autor?: string): Promise<Signal> {
  let artikel: WikiArtikel | null;
  try {
    artikel = await findeWikiArtikel(werk, autor);
  } catch (e) {
    return { richtung: 'unbekannt', text: 'Interesse ·', detail: `Wikipedia nicht erreichbar (${String((e as Error)?.message ?? e)}).` };
  }
  if (!artikel) return { richtung: 'unbekannt', text: 'Interesse ·', detail: 'Kein passender Wikipedia-Artikel gefunden.' };
  const kandidat = artikel.titel;
  const bis = new Date(Date.now() - 86_400_000);
  const von = new Date(bis.getTime() - 364 * 86_400_000);
  const url =
    'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/de.wikipedia/all-access/user/' +
    `${encodeURIComponent(kandidat.replace(/ /g, '_'))}/daily/${tag(von)}/${tag(bis)}`;
  const res = await wikiFetch(url);
  if (!res.ok) return { richtung: 'unbekannt', text: 'Interesse ·', detail: `Wikipedia-Statistik nicht abrufbar (${res.status}).` };
  const j = await res.json();
  const werte: number[] = (j?.items ?? []).map((i: { views: number }) => i.views);
  const v = interesseVerhaeltnis(werte);
  const r = richtung(v);
  const letzte30 = werte.slice(-30).reduce((x, y) => x + y, 0);
  return {
    richtung: r,
    text: `Interesse ${PFEIL[r]}`,
    detail:
      `Wikipedia „${kandidat}“ (${artikel.art === 'werk' ? 'Werk' : 'Person'}): ${letzte30.toLocaleString('de-DE')} Aufrufe in 30 Tagen` +
      (v ? `, ${Math.round(v * 100)} % des Jahresmittels.` : '.') +
      ' Prüfe, ob der Artikel wirklich zum Buch passt.',
  };
}

// ---------- 3. Neuauflage (DNB) ----------

export function neuauflageAus(jahreAndererAusgaben: string[], diesesJahr: string | undefined, jetzt = new Date()): Signal {
  const jahre = jahreAndererAusgaben.map(Number).filter((n) => n > 1400 && n <= jetzt.getFullYear() + 1);
  if (jahre.length === 0) return { richtung: 'unbekannt', text: '', detail: 'Keine weiteren Ausgaben bei der DNB gefunden.' };
  const neueste = Math.max(...jahre);
  const eigen = diesesJahr ? Number(diesesJahr) : null;
  if (neueste >= jetzt.getFullYear() - 2 && (eigen == null || neueste > eigen)) {
    return {
      richtung: 'runter',
      text: `Neuauflage ${neueste}`,
      detail: `Die DNB kennt eine Ausgabe von ${neueste}. Neuauflagen drücken meist die Gebrauchtpreise älterer Ausgaben.`,
    };
  }
  return { richtung: 'gleich', text: '', detail: `Neueste bekannte Ausgabe: ${neueste}.` };
}

export async function neuauflageSignal(titel: string, autor: string | undefined, jahr: string | undefined): Promise<Signal> {
  const cql = baueCql({ titel, autor });
  if (!cql) return neuauflageAus([], jahr);
  const { titel: treffer } = await dnbSuche(cql, 50);
  return neuauflageAus(treffer.map((t) => t.jahr ?? '').filter(Boolean), jahr);
}
