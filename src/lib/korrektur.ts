// Korrektur-Protokoll auswerten: Wo weicht ihr vom Vorschlag ab – und in welche Richtung?
// Reine Rechnung ohne Datenbank, damit sie getestet werden kann.

export type KorrekturArt = 'preis' | 'vergleich' | 'aussortiert' | 'nachtraeglich';

export interface Korrektur {
  zeit: string;
  log_id: number | null;
  isbn: string | null;
  titel: string | null;
  vorschlag: number;
  endpreis: number;
  zweig: string | null;
  kategorie: string | null;
  zustand: string | null;
  anzahl: number | null;
  ampel: string | null;
  /** 1 = anderes Vergleichsangebot gewählt */
  vergleich_von_hand: number;
  /** Zahl der von Hand aussortierten Angebote */
  aussortiert_von_hand: number;
  /** Hauptgrund des Eintrags */
  art: KorrekturArt;
}

export interface Gruppe {
  name: string;
  n: number;
  /** mittlere relative Abweichung Endpreis/Vorschlag − 1 (0.12 = +12 %) */
  mittel: number;
}

export interface Auswertung {
  n: number;
  /** nur Einträge mit Preisänderung */
  mitPreis: number;
  mittel: number | null;
  vergleichVonHand: number;
  aussortiertVonHand: number;
  nachKategorie: Gruppe[];
  nachAmpel: Gruppe[];
  /** Kurzer Satz für die Einstellungen, z. B. „Regal-Preise erhöht ihr im Schnitt um 15 %“ */
  auffaellig: string[];
}

const rel = (k: Korrektur) => (k.vorschlag > 0 ? k.endpreis / k.vorschlag - 1 : 0);
const prozent = (x: number) => `${x >= 0 ? '+' : '−'}${Math.round(Math.abs(x) * 100)} %`;

function gruppiere(liste: Korrektur[], feld: (k: Korrektur) => string | null): Gruppe[] {
  const m = new Map<string, number[]>();
  for (const k of liste) {
    const g = feld(k);
    if (!g) continue;
    m.set(g, [...(m.get(g) ?? []), rel(k)]);
  }
  return [...m.entries()]
    .map(([name, w]) => ({ name, n: w.length, mittel: w.reduce((a, b) => a + b, 0) / w.length }))
    .sort((a, b) => b.n - a.n);
}

const NAME: Record<string, string> = { grabbel: 'Grabbelkiste', regal: 'Regal', lager: 'Lager', gruen: 'grüner Ampel', gelb: 'gelber Ampel', rot: 'roter Ampel' };

export function werteKorrekturenAus(liste: Korrektur[]): Auswertung {
  const mitPreis = liste.filter((k) => Math.abs(k.endpreis - k.vorschlag) >= 0.005);
  const mittel = mitPreis.length ? mitPreis.reduce((a, k) => a + rel(k), 0) / mitPreis.length : null;
  const nachKategorie = gruppiere(mitPreis, (k) => k.kategorie);
  const nachAmpel = gruppiere(mitPreis, (k) => k.ampel);
  // Auffällig: mindestens 5 Fälle und im Schnitt mehr als 10 % daneben
  const auffaellig = [...nachKategorie, ...nachAmpel]
    .filter((g) => g.n >= 5 && Math.abs(g.mittel) >= 0.1)
    .map((g) => `Bei ${NAME[g.name] ?? g.name} ändert ihr den Preis im Schnitt um ${prozent(g.mittel)} (${g.n}×)`);
  return {
    n: liste.length,
    mitPreis: mitPreis.length,
    mittel,
    vergleichVonHand: liste.filter((k) => k.vergleich_von_hand).length,
    aussortiertVonHand: liste.filter((k) => k.aussortiert_von_hand > 0).length,
    nachKategorie,
    nachAmpel,
    auffaellig,
  };
}
