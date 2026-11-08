// Hennwack-Look wie Fountain (Website/Kasse-Mockups): Papier, Tinte, eckige Kästen mit schwarzem Rahmen,
// harte Versatzschatten, Bricolage Grotesque + Caveat für Handschrift-Akzente.
// Jede Farbe hat genau eine Bedeutung – Bereich, Kategorie oder Zustand –, damit man die App „liest“, ohne zu lesen.
import { Kategorie, Zustand } from './lib/preis';

export const F = {
  papier: '#fbf6ee',
  karte: '#ffffff',
  tinte: '#1d1d1b',
  grau: '#4a463f',
  linie: 'rgba(29,29,27,0.18)',
  rot: '#dd2a4b',
  orange: '#e86435',
  gelb: '#eecb33',
  gruen: '#367d47',
  // Fountain hat kein Türkis – das dunkle Blau übernimmt die Rolle
  tuerkis: '#17539b',
  blau: '#2f6db5',
  lila: '#7a226f',
  sand: '#f3dfc7',
  kork: '#c9a77c',
  hand: '#c24a1c',
  schwarzGlas: 'rgba(29,29,27,0.78)',
};

/** Helle Tönung einer Farbe für Flächen (Kacheln, Chips, Kopfzeilen-Untergrund). */
export function hell(farbe: string, anteil = 0.14): string {
  if (!farbe.startsWith('#') || farbe.length !== 7) return farbe;
  const n = parseInt(farbe.slice(1), 16);
  const mix = (c: number) => Math.round(c * anteil + 255 * (1 - anteil));
  return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

/** Schriftfarbe auf einer farbigen Fläche: Tinte auf hellen (Gelb, Sand, Kork), sonst Weiß. */
export function aufFarbe(farbe: string): string {
  if (!farbe.startsWith('#') || farbe.length !== 7) return '#fff';
  const n = parseInt(farbe.slice(1), 16);
  const helligkeit = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return helligkeit > 0.62 ? F.tinte : '#fff';
}

/** Leitfarbe je Reiter – Unterstrich der Kopfzeile, aktiver Tab und Hauptknopf tragen sie. */
export const BEREICH = {
  scan: F.orange,
  stapel: F.gruen,
  log: F.blau,
  einst: F.lila,
} as const;

export const KATEGORIE_FARBE: Record<Kategorie, string> = {
  // Grabbelkiste ist die einzige Kategorie ohne Platz im Plan → eigene Farbe (Lila).
  grabbel: F.lila,
  regal: F.gruen,
  // „Ins Lager“ ist kein Regal-Bereich → neutral.
  lager: F.grau,
};

/** Ampel von „wie neu“ bis „Mängel“. */
export const ZUSTAND_FARBE: Record<Zustand, string> = {
  wie_neu: F.gruen,
  sehr_gut: F.blau,
  gut: F.gelb,
  akzeptabel: F.orange,
  maengel: F.rot,
};

export const ABSTAND = 16;
/** Fountain ist eckig. */
export const RADIUS = 0;
/** Rahmen um Kästen, Knöpfe, Felder */
export const RAHMEN = 2;

/** Schwarz umrandeter Kasten wie Fountains .kasten */
export const KASTEN = { borderWidth: RAHMEN, borderColor: F.tinte } as const;

/** Harter Versatzschatten wie Fountains Zettel (Farbe = Bereich/Kategorie, sonst Tinte). */
export function schatten(farbe: string = F.tinte, versatz = 5) {
  return { boxShadow: `${versatz}px ${versatz}px 0px ${farbe}` } as const;
}

/** Schriften – geladen in App.tsx; der Text-Baustein wählt die Stärke anhand von fontWeight. */
export const SCHRIFT = {
  normal: 'BricolageGrotesque_400Regular',
  halb: 'BricolageGrotesque_600SemiBold',
  fett: 'BricolageGrotesque_800ExtraBold',
  hand: 'Caveat_700Bold',
} as const;
