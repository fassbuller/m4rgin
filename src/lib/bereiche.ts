// Ladenbereiche nach dem Grundriss. Die Farben sind aus dem Plan entnommen:
// Pink #DC274C, Blau #256DB5 / #14549C, Orange #E76535, Gelb #EDCB33, Grün #378A4F.
// Die Grabbelkiste (1–2 €) steht nicht im Plan und bekommt deshalb eine eigene Farbe.
import { Kategorie } from './preis';

export type BereichId =
  | 'belletristik'
  | 'krimi'
  | 'geschichte'
  | 'sachbuch'
  | 'geist'
  | 'vorderraum'
  | 'grabbel';

export interface Bereich {
  name: string;
  farbe: string;
  /** Wo im Laden */
  ort: string;
}

export const BEREICHE: Record<BereichId, Bereich> = {
  belletristik: { name: 'Belletristik', farbe: '#DC274C', ort: 'Werkstatt · Belletristik A–Z' },
  krimi: { name: 'Krimi & Fantastik', farbe: '#256DB5', ort: 'Werkstatt · Krimi, Fantasy, SciFi' },
  geschichte: { name: 'Geschichte', farbe: '#14549C', ort: 'Werkstatt · Geschichte, DDR, NS-Zeit' },
  sachbuch: { name: 'Sachbuch', farbe: '#E76535', ort: 'Mittelraum' },
  geist: { name: 'Geist & Gesellschaft', farbe: '#EDCB33', ort: 'Mittelraum · gelbe Wand' },
  vorderraum: { name: 'Vorderraum', farbe: '#378A4F', ort: 'Vorderraum · Kunst, Kinder, Lyrik' },
  grabbel: { name: 'Grabbelkiste', farbe: '#7B4FD6', ort: '1–2 €-Kiste' },
};

/**
 * Ordnet eine DNB-Sachgruppe einem Ladenbereich zu.
 * Grundlage sind die Sachgruppen-Codes der DNB ("100 Philosophie", "830 Deutsche Literatur",
 * "K Kinder- und Jugendliteratur"); fehlt der Code, greifen Stichworte.
 */
export function bereichAusSachgruppe(sachgruppe: string): BereichId | null {
  const text = sachgruppe.trim().toLowerCase();
  if (!text) return null;

  const code = text.match(/^(\d{3})/)?.[1];
  if (code) {
    const n = Number(code);
    if (n === 100) return 'geist'; // Philosophie
    if (n >= 110 && n <= 199) return 'sachbuch'; // Psychologie, Parapsychologie, Okkultismus
    if (n >= 200 && n <= 299) return 'sachbuch'; // Religion
    if (n >= 300 && n <= 369) return 'geist'; // Sozialwissenschaften, Politik, Wirtschaft, Recht, Soziologie
    if (n >= 370 && n <= 399) return 'sachbuch'; // Pädagogik, Kommunikation, Handel
    if (n >= 400 && n <= 499) return 'geist'; // Sprache
    if (n >= 500 && n <= 699) return 'sachbuch'; // Naturwissenschaft, Technik, Medizin
    if (n >= 700 && n <= 769) return 'vorderraum'; // Kunst, Architektur, Malerei
    if (n >= 770 && n <= 799) return 'sachbuch'; // Fotografie, Musik, Sport
    if (n === 800) return 'geist'; // Literaturwissenschaft
    if (n >= 801 && n <= 899) return 'belletristik'; // deutsche/englische/… Literatur
    if (n >= 900 && n <= 999) return 'geschichte'; // Geschichte, Geografie
  }

  const buchstabe = text.match(/^([a-z])\b/)?.[1];
  if (buchstabe === 'b') return 'belletristik'; // B Belletristik
  if (buchstabe === 'k') return 'vorderraum'; // K Kinder- und Jugendliteratur

  const regeln: [RegExp, BereichId][] = [
    [/kinder|jugend/, 'vorderraum'],
    [/kunst|architektur|lyrik|judaica/, 'vorderraum'],
    [
      /comic|humor|philosophie|soziologie|politik|wirtschaft|recht|marxismus|literaturwissenschaft|sprachwissenschaft|geisteswissenschaft/,
      'geist',
    ],
    [/geschichte|zeitgeschichte|kulturgeschichte|nationalsozialismus|ddr/, 'geschichte'],
    [/krimi|fantasy|science ?fiction|scifi/, 'krimi'],
    [/belletristik|roman|erzähl|literatur/, 'belletristik'],
    [/psychologie|religion|medizin|natur|technik|sport|musik|film|foto|koch|reise|pädagogik/, 'sachbuch'],
  ];
  for (const [muster, bereich] of regeln) if (muster.test(text)) return bereich;
  return null;
}

/** Entfernt den Sachgruppen-Code: "100 Philosophie" → "Philosophie", "B Belletristik" → "Belletristik". */
export function sachgruppeOhneCode(sachgruppe: string): string {
  const sauber = sachgruppe.replace(/^[\dA-Z]{1,3}(\.\d+)?\s+/, '').trim();
  return sauber || sachgruppe.trim();
}

/** Konkretes Fach eines Buchs: die erste DNB-Sachgruppe ohne Code. */
export function erstesFach(sachgruppen?: string | null): string | null {
  const erste = (sachgruppen ?? '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)[0];
  return erste ? sachgruppeOhneCode(erste) : null;
}

/** Bereich eines Buches: Grabbelkiste schlägt alles, sonst entscheidet die erste Sachgruppe. */
export function bereichFuerBuch(opts: {
  kategorie?: Kategorie | null;
  sachgruppen?: string | null;
}): BereichId | null {
  if (opts.kategorie === 'grabbel') return 'grabbel';
  const erste = (opts.sachgruppen ?? '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)[0];
  return erste ? bereichAusSachgruppe(erste) : null;
}
