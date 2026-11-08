// Angebote prüfen, bevor sie in den Preis eingehen. Ein einzelnes falsches Angebot ganz unten
// (Mängelexemplar, Hörbuch, anderes Buch bei der Titelsuche …) würde sonst den Preis bestimmen.
// Aussortiertes verschwindet nicht: Es bleibt mit Grund sichtbar und lässt sich von Hand zurückholen.

import type { Angebot } from './markt';
import { Bindung } from './ausgaben';
import { kernTitel, norm } from './wiki';

export interface AussortiertesAngebot extends Angebot {
  grund: string;
}

export interface PruefKontext {
  /** Gesuchter Titel und Autor – für den Abgleich bei der Titelsuche */
  titel?: string;
  autor?: string;
  /** Per ISBN gesucht: dann ist jedes Angebot dasselbe Buch, kein Titelabgleich nötig */
  ueberIsbn: boolean;
  /** Einband der gesuchten Ausgabe, falls bekannt */
  bindung?: Bindung;
  /** Händler, die immer ignoriert werden sollen (von Hand gepflegt) */
  ignorierteHaendler?: string[];
}

export interface PruefErgebnis {
  gueltig: Angebot[];
  aussortiert: AussortiertesAngebot[];
  /** Filter, die nicht angewendet wurden, weil sonst nichts übrig bliebe */
  hinweise: string[];
}

/** Eindeutiger Schlüssel eines Angebots – für „passt nicht“ und „zurückholen“. */
export const angebotSchluessel = (a: Angebot): string =>
  `${a.plattform.toLowerCase()}|${(a.haendler ?? '').toLowerCase()}|${a.gesamt.toFixed(2)}|${(a.url ?? '').slice(-40)}`;

/** Sammelangebote treiben Preise hoch, ohne dass das einzelne Buch so viel wert ist. */
export const SAMMEL =
  /konvolut|sammlung von|\bset\b|paket|\b\d+\s*(bänden?|bde\.?|büchern?)(?![a-zäöüß])|gesamtausgabe|komplett(e|er)? (reihe|serie)|\bbd\.\s*\d+\s*[-–]\s*\d+/i;

const MAENGEL = /mängelexemplar|maengelexemplar|mängelex\b|mängelstempel|remittende/i;
const MEDIUM = /hörbuch|hoerbuch|hörspiel|audio[- ]?cd|\bmp3\b|\b\d*\s*cds?\b|\bdvd\b|e-?book|kindle|epub/i;
const NUR_TEIL = /nur (der |den )?(schutz)?umschlag|ohne (das )?buch|nur (die )?hülle|leerer schuber|nur schuber/i;

/** Großhändler und Ankaufportale: Kampfpreise, die eher eine Untergrenze sind als ein Vergleich. */
export const GROSSHAENDLER = /momox|rebuy|re-buy|medimops|buchpark|zoxs|bookbot|ankauf|wirkaufens|buecherankauf/i;
export const istGrosshaendler = (a: Angebot) => GROSSHAENDLER.test(`${a.haendler ?? ''} ${a.plattform}`);

const DEUTSCHSPRACHIG = /^(de|at|ch|deu|aut|che|d|a|deutschland|österreich|oesterreich|schweiz|germany|austria|switzerland)$/i;
/** Versand ab diesem Betrag aus dem Ausland: kein fairer Vergleich für einen Laden in Deutschland */
const AUSLAND_VERSAND_AB = 9;

/** Wörter, die beim Titelabgleich nichts aussagen */
const FUELL = new Set(['der', 'die', 'das', 'und', 'ein', 'eine', 'von', 'mit', 'im', 'in', 'zu', 'zum', 'zur', 'des', 'den', 'dem', 'the', 'and', 'of', 'roman', 'erzaehlung', 'erzahlung', 'band']);

function woerter(s: string): string[] {
  return norm(s)
    .split(' ')
    .filter((w) => w.length >= 3 && !FUELL.has(w));
}

/**
 * Passt ein Angebot zum gesuchten Buch? Mindestens 60 % der Titelwörter müssen vorkommen,
 * und – falls ein Autor bekannt ist – sein Name (die ersten vier Buchstaben überstehen Umschriften).
 */
export function titelPasst(angebotTitel: string, titel: string, autor?: string, angebotsAutor?: string): boolean {
  const gesucht = woerter(kernTitel(titel));
  if (gesucht.length === 0) return true;
  const vorhanden = new Set(woerter(angebotTitel));
  // Präfix-Vergleich: „Kellerloch“ ↔ „Kellerlochs“, Umlaut-Varianten sind über norm() schon gleich
  const gefunden = gesucht.filter((w) => [...vorhanden].some((v) => v.startsWith(w.slice(0, 5)) || w.startsWith(v.slice(0, 5)))).length;
  if (gefunden / gesucht.length < 0.6) return false;
  // Autor: Viele Händler nennen ihn gar nicht – fehlen ist kein Gegenbeweis. Nennt das Angebot aber
  // ausdrücklich einen anderen Autor, ist es ein anderes Buch.
  const stamm = norm(autor?.split(',')[0] ?? '').replace(/\s/g, '').slice(0, 4);
  const angebotAutor = norm(angebotsAutor ?? '').replace(/\s/g, '');
  if (stamm.length >= 3 && angebotAutor.length >= 3 && !angebotAutor.includes(stamm)) return false;
  return true;
}

function grundFuer(a: Angebot, k: PruefKontext): string | null {
  const text = `${a.titel ?? ''} ${a.zustandText ?? ''}`;
  const h = (a.haendler ?? '').toLowerCase();
  if (h && k.ignorierteHaendler?.some((x) => x.toLowerCase() === h)) return 'Händler wird ignoriert';
  if (MAENGEL.test(text)) return 'Mängelexemplar/Remittende';
  if (MEDIUM.test(text)) return 'anderes Medium (Hörbuch, CD, E-Book …)';
  if (NUR_TEIL.test(text)) return 'nur Umschlag/Schuber';
  if (SAMMEL.test(text)) return 'Set/Konvolut';
  if (a.land && !DEUTSCHSPRACHIG.test(a.land.trim()) && a.versand >= AUSLAND_VERSAND_AB) {
    return `Auslandsversand ${a.versand.toLocaleString('de-DE', { minimumFractionDigits: 2 })} € (${a.land})`;
  }
  return null;
}

/** Weiche Filter: werden nur angewendet, wenn danach noch Angebote übrig bleiben. */
const WEICH: { name: string; grund: (a: Angebot, k: PruefKontext) => string | null }[] = [
  {
    name: 'Titelabgleich',
    grund: (a, k) => (!k.ueberIsbn && k.titel && a.titel && !titelPasst(a.titel, k.titel, k.autor, a.autor) ? 'anderes Buch (Titel passt nicht)' : null),
  },
  {
    name: 'Einband',
    grund: (a, k) =>
      k.bindung && a.gebunden != null && a.gebunden !== (k.bindung === 'hc')
        ? `anderer Einband (${a.gebunden ? 'gebunden' : 'Taschenbuch'})`
        : null,
  },
];

export function pruefeAngebote(angebote: Angebot[], k: PruefKontext): PruefErgebnis {
  const aussortiert: AussortiertesAngebot[] = [];
  const hinweise: string[] = [];
  let gueltig: Angebot[] = [];
  for (const a of angebote) {
    const g = grundFuer(a, k);
    if (g) aussortiert.push({ ...a, grund: g });
    else gueltig.push(a);
  }
  for (const f of WEICH) {
    const raus: AussortiertesAngebot[] = [];
    const bleibt: Angebot[] = [];
    for (const a of gueltig) {
      const g = f.grund(a, k);
      if (g) raus.push({ ...a, grund: g });
      else bleibt.push(a);
    }
    if (raus.length === 0) continue;
    if (bleibt.length === 0) {
      hinweise.push(`${f.name} hätte alle Angebote aussortiert → nicht angewendet`);
      continue;
    }
    gueltig = bleibt;
    aussortiert.push(...raus);
  }
  return { gueltig, aussortiert, hinweise };
}

// ---------- Robuste Statistik ----------

export function quantil(sortiert: number[], q: number): number {
  if (sortiert.length === 0) return NaN;
  const pos = (sortiert.length - 1) * q;
  const u = Math.floor(pos);
  const o = Math.ceil(pos);
  return sortiert[u] + (sortiert[o] - sortiert[u]) * (pos - u);
}

/**
 * Ausreißer nach unten: deutlich unter dem Rest des Marktes. Gerechnet auf der Log-Skala mit der
 * mittleren absoluten Abweichung (MAD) – robust gegen die Ausreißer selbst. Erst ab 4 Angeboten.
 * Zusätzlich muss das Angebot unter 60 % des Medians liegen, damit normale Streuung nicht zählt.
 */
export function ausreisserUnten(preise: number[]): Set<number> {
  const raus = new Set<number>();
  if (preise.length < 4) return raus;
  const logs = preise.map((p) => Math.log(Math.max(p, 0.01)));
  const s = [...logs].sort((a, b) => a - b);
  const med = quantil(s, 0.5);
  const mad = quantil(
    logs.map((l) => Math.abs(l - med)).sort((a, b) => a - b),
    0.5,
  );
  // Untergrenze für die Streuung: sonst wäre bei fast gleichen Preisen jedes leicht günstigere ein Ausreißer
  const streuung = Math.max(mad * 1.4826, 0.15);
  logs.forEach((l, i) => {
    if (med - l > 3 * streuung && preise[i] < Math.exp(med) * 0.6) raus.add(i);
  });
  return raus;
}

/** Relative Streuung (Interquartilsabstand / Median) – 0 = alle gleich, 1 = sehr uneinig. */
export function relativeStreuung(preise: number[]): number | null {
  if (preise.length < 4) return null;
  const s = [...preise].sort((a, b) => a - b);
  const med = quantil(s, 0.5);
  if (!(med > 0)) return null;
  return (quantil(s, 0.75) - quantil(s, 0.25)) / med;
}
