// Konfidenz-Ampel: Wie sehr kann man dem Preisvorschlag trauen?
// Kein Bauchgefühl, sondern Punkte für nachvollziehbare Gründe – jeder Abzug steht als Satz in der Erklärung.
//
//   grün  = Vergleich ist belastbar, Preis kann so raus
//   gelb  = brauchbar, aber kurz draufschauen
//   rot   = unsicher – selbst prüfen; keine Gold-/Schwarz-Enthüllung

import type { MarktErgebnis, QuellenId } from './markt';
import type { PreisErgebnis } from './preis';
import { quantil, relativeStreuung } from './pruefung';

export type Ampel = 'gruen' | 'gelb' | 'rot';
export const AMPEL_LABEL: Record<Ampel, string> = { gruen: 'Sicher', gelb: 'Prüfen', rot: 'Unsicher' };

export interface Konfidenz {
  ampel: Ampel;
  /** 0 = nichts auszusetzen; jeder Abzug negativ */
  punkte: number;
  /** Abzüge als Sätze, z. B. „Nur 2 Angebote“ */
  gruende: string[];
  /** Was für den Preis spricht */
  plus: string[];
}

export interface KonfidenzEingabe {
  markt: MarktErgebnis | null;
  preis: PreisErgebnis | null;
  /** Vergleichsangebot wurde von Hand gewählt – dann hat ein Mensch entschieden */
  vonHandGewaehlt?: boolean;
}

export function bewerteKonfidenz({ markt, preis, vonHandGewaehlt }: KonfidenzEingabe): Konfidenz {
  const gruende: string[] = [];
  const plus: string[] = [];
  let punkte = 0;
  const ab = (n: number, text: string) => {
    punkte -= n;
    gruende.push(text);
  };

  if (!preis) return { ampel: 'rot', punkte: -9, gruende: ['Kein Preis berechnet'], plus };
  if (preis.quelle === 'schaetzung') return { ampel: 'rot', punkte: -9, gruende: ['Kein Online-Vergleich – eigene Schätzung'], plus };
  if (vonHandGewaehlt) plus.push('Vergleich von Hand gewählt');

  const angebote = markt?.angebote ?? [];
  const n = angebote.length;

  // 1. Wie viele Vergleiche?
  if (n === 1) ab(2, 'Nur 1 Angebot – kein zweiter Vergleich');
  else if (n <= 3) ab(1, `Nur ${n} Angebote`);
  else plus.push(`${n} Angebote`);

  // 2. Wie einig ist sich der Markt? (Interquartilsabstand relativ zum Median)
  const streuung = relativeStreuung(angebote.map((a) => a.gesamt));
  if (streuung != null) {
    if (streuung > 1) ab(2, 'Preise streuen sehr stark');
    else if (streuung > 0.5) ab(1, 'Preise streuen deutlich');
    else plus.push('Preise liegen nah beieinander');
  }

  // 3. Quellen: ausgefallen? stimmen sie überein?
  const status = markt?.status ?? [];
  const aus = status.filter((s) => !s.ok);
  if (status.length > 0 && aus.length > 0) {
    ab(1, `Nur ${status.length - aus.length} von ${status.length} Preisquellen erreicht`);
  }
  const jeQuelle = new Map<QuellenId, number[]>();
  for (const a of angebote) jeQuelle.set(a.quelle, [...(jeQuelle.get(a.quelle) ?? []), a.gesamt]);
  const mediane = [...jeQuelle.values()].filter((w) => w.length >= 2).map((w) => quantil([...w].sort((x, y) => x - y), 0.5));
  if (mediane.length >= 2) {
    const verh = Math.max(...mediane) / Math.min(...mediane);
    if (verh > 2.5) ab(1, 'Die Preisquellen widersprechen sich stark');
    else plus.push(`${mediane.length} Quellen stimmen überein`);
  }

  // 4. Dasselbe Buch?
  if (markt && markt.ueberIsbn === false) ab(1, 'Per Titel gesucht – evtl. andere Ausgaben dabei');
  if (preis.gelockert) ab(1, 'Zu wenige Angebote derselben Ausgabe/desselben Zustands');

  // 5. Vergleich weit weg vom Rest?
  const v = preis.vergleichspreis;
  if (v != null && n >= 4) {
    const med = quantil(angebote.map((a) => a.gesamt).sort((x, y) => x - y), 0.5);
    if (med > 0 && v > med * 1.8) ab(1, 'Vergleich liegt weit über dem Median');
  }

  if (vonHandGewaehlt) punkte = Math.max(punkte, -3); // ein Mensch hat hingeschaut → nie rot
  // Ein kleiner Makel (z. B. nur 3 Angebote) ist noch grün; ab zwei Makeln gelb, ab vier rot
  const ampel: Ampel = punkte >= -1 ? 'gruen' : punkte >= -3 ? 'gelb' : 'rot';
  return { ampel, punkte, gruende, plus };
}
