// Schnellfilter für „Welche Ausgabe?“: Bindung, Verlag, Jahr – nur Werte, die in den Treffern vorkommen.

import { Titel } from './titel';

export type Bindung = 'tb' | 'hc';
export const BINDUNG_LABEL: Record<Bindung, string> = { tb: 'Taschenbuch', hc: 'Gebunden' };

/** DNB-Kürzel im ISBN-Feld: „kart.“, „Broschur“, „Pb.“ → Taschenbuch; „Pp.“, „Gb.“, „Lw.“ → gebunden. */
export function bindungAus(einband?: string): Bindung | undefined {
  if (!einband) return undefined;
  const e = einband.toLowerCase();
  if (/kart|brosch|pb\b|paperback|taschenbuch|\btb\b|softcover|geheftet/.test(e)) return 'tb';
  if (/pp\b|pappband|gb\b|geb\b|gebunden|hardcover|lw\b|ln\b|leinen|ldr\b|leder|hlw|hldr/.test(e)) return 'hc';
  return undefined;
}

/** „Suhrkamp Verlag GmbH“ und „Suhrkamp“ sollen ein Chip sein. */
export function verlagSchluessel(verlag?: string): string | undefined {
  const k = verlag
    ?.toLowerCase()
    .replace(/\b(verlag|verlagsgesellschaft|gmbh|kg|ag|& co\.?|und co\.?|edition|bei)\b/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  return k || undefined;
}

export interface Filter {
  bindung?: Bindung;
  verlag?: string; // verlagSchluessel
  jahr?: string; // Jahr oder Jahrzehnt „1970er“
}
type Gruppe = keyof Filter;

export interface Facette {
  wert: string;
  label: string;
  anzahl: number;
}

/** Ab so vielen verschiedenen Jahren wird nach Jahrzehnten gruppiert, sonst wird die Zeile endlos. */
const MAX_JAHRE = 6;

function jahrWert(t: Titel, jahrzehnte: boolean): string | undefined {
  const j = t.jahr?.match(/\d{4}/)?.[0];
  if (!j) return undefined;
  return jahrzehnte ? `${j.slice(0, 3)}0er` : j;
}

export function nachJahrzehnten(treffer: Titel[]): boolean {
  return new Set(treffer.map((t) => jahrWert(t, false)).filter(Boolean)).size > MAX_JAHRE;
}

function wertVon(t: Titel, g: Gruppe, jahrzehnte: boolean): string | undefined {
  if (g === 'bindung') return bindungAus(t.einband);
  if (g === 'verlag') return verlagSchluessel(t.verlag);
  return jahrWert(t, jahrzehnte);
}

function passt(t: Titel, f: Filter, jahrzehnte: boolean, ausser?: Gruppe): boolean {
  return (Object.keys(f) as Gruppe[]).every((g) => g === ausser || !f[g] || wertVon(t, g, jahrzehnte) === f[g]);
}

export function filtere(treffer: Titel[], f: Filter): Titel[] {
  const jz = nachJahrzehnten(treffer);
  return treffer.filter((t) => passt(t, f, jz));
}

/**
 * Chips je Gruppe. Gezählt wird unter den übrigen aktiven Filtern, damit die Zahlen stimmen,
 * die man nach dem Tippen sieht. Eine Gruppe mit nur einem Wert hilft nicht beim Unterscheiden → leer.
 * Der gewählte Wert bleibt immer sichtbar, damit man ihn wieder abwählen kann.
 */
export function facetten(treffer: Titel[], f: Filter): Record<Gruppe, Facette[]> {
  const jz = nachJahrzehnten(treffer);
  const gruppe = (g: Gruppe): Facette[] => {
    const zaehler = new Map<string, { anzahl: number; labels: Map<string, number> }>();
    const alleWerte = new Set<string>();
    for (const t of treffer) {
      const w = wertVon(t, g, jz);
      if (!w) continue;
      alleWerte.add(w);
      if (!passt(t, f, jz, g)) continue;
      const z = zaehler.get(w) ?? { anzahl: 0, labels: new Map() };
      z.anzahl++;
      const label = g === 'verlag' ? t.verlag!.trim() : g === 'bindung' ? BINDUNG_LABEL[w as Bindung] : w;
      z.labels.set(label, (z.labels.get(label) ?? 0) + 1);
      zaehler.set(w, z);
    }
    if (alleWerte.size < 2 && !f[g]) return [];
    const liste = [...zaehler].map(([wert, z]) => ({
      wert,
      // Häufigste Schreibweise gewinnt
      label: [...z.labels].sort((a, b) => b[1] - a[1])[0][0],
      anzahl: z.anzahl,
    }));
    if (f[g] && !zaehler.has(f[g]!)) {
      const label =
        g === 'bindung'
          ? BINDUNG_LABEL[f[g] as Bindung]
          : g === 'verlag'
            ? treffer.find((t) => verlagSchluessel(t.verlag) === f.verlag)?.verlag?.trim() ?? f[g]!
            : f[g]!;
      liste.push({ wert: f[g]!, label, anzahl: 0 });
    }
    return g === 'jahr'
      ? liste.sort((a, b) => b.wert.localeCompare(a.wert))
      : liste.sort((a, b) => b.anzahl - a.anzahl || a.label.localeCompare(b.label));
  };
  return { bindung: gruppe('bindung'), verlag: gruppe('verlag'), jahr: gruppe('jahr') };
}
