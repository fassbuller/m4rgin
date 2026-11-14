// Sacherschließung der DNB für den Ladenplan: Sachgruppe, Schlagwörter, Geografika, Form, Sprache, Reihe und
// Erscheinungsdatum eines Titels. Die Titelsuche (dnb.ts) liest Dublin Core – dort fehlen diese Angaben. Hier kommt
// derselbe Datensatz als MARC21-xml. Übernommen aus firestream2 Pegel/src/erschliessung.ts (v0.99.128), dort am
// 14.11.2026 an echten Sätzen geprüft (firestream2/ladenplan/spec.md, „Das Buch, wie die Regeln es sehen“):
//
//   Sachgruppe   082/083/084 mit $2 „…sdnb“, alle $a   (082 $2 „23/ger“ ist die volle DDC-Notation, NICHT die Sachgruppe)
//   Sprache      041 $a, sonst 008 Stelle 35–37
//   Schlagwörter 600, 610, 611, 630, 650 $a und 689 mit $D p, b, f, u, s   (653 = freie Verlags-Stichwörter: bleiben draußen)
//   Geografika   651 $a und 689 mit $D g
//   Form         655 $a und 689 mit $A f
//   Reihe        490 $a und 830 $a
//   Erschienen   263 $a (JJJJMM, selten); sonst 015 $a „26,A30“ = Nationalbibliografie Reihe A, Jahr + Wochenheft des
//                Eingangs bei der DNB (Reihe N ist nur die Ankündigung); sonst nur das Jahr aus 264 $c bzw. 008 Stelle 7–10.

import { dekodiere } from './dnb';
import { normalisiereIsbn } from './isbn';
import type { LadenBuch } from './ladenplan';

export interface Erschliessung extends LadenBuch {
  gefunden: boolean;
  idn?: string;
  dnb: string[];
  sprache: string[];
  schlagwoerter: string[];
  geografika: string[];
  form: string[];
  reihen: string[];
  erschienen?: string;
}

interface Feld {
  tag: string;
  teile: [string, string][];
}
interface Satz {
  kontroll: Record<string, string>;
  felder: Feld[];
}

export const LEER: Erschliessung = { gefunden: false, dnb: [], sprache: [], schlagwoerter: [], geografika: [], form: [], reihen: [] };

const einmalig = (werte: string[]) => [...new Set(werte.map((w) => w.trim()).filter(Boolean))];

/** Die Datensätze einer SRU-Antwort im Format MARC21-xml */
export function marcSaetze(xml: string): Satz[] {
  const saetze: Satz[] = [];
  for (const s of xml.matchAll(/<record\b[^>]*type="Bibliographic"[^>]*>([\s\S]*?)<\/record>/g)) {
    const kontroll: Record<string, string> = {};
    for (const k of s[1].matchAll(/<controlfield tag="(\d{3})">([^<]*)<\/controlfield>/g)) kontroll[k[1]] = k[2];
    const felder: Feld[] = [];
    for (const d of s[1].matchAll(/<datafield tag="(\d{3})"[^>]*>([\s\S]*?)<\/datafield>/g)) {
      const teile: [string, string][] = [];
      for (const t of d[2].matchAll(/<subfield code="(.)">([^<]*)<\/subfield>/g)) teile.push([t[1], dekodiere(t[2])]);
      felder.push({ tag: d[1], teile });
    }
    saetze.push({ kontroll, felder });
  }
  return saetze;
}

const alle = (f: Feld, code: string) => f.teile.filter(([c]) => c === code).map(([, w]) => w);
const eins = (f: Feld, code: string) => alle(f, code)[0] ?? '';

export function ausMarc(satz: Satz): Erschliessung {
  const dnb: string[] = [], sprache: string[] = [], schlagwoerter: string[] = [], geografika: string[] = [];
  const form: string[] = [], reihen: string[] = [];
  let monat263 = '', heftA = '', jahr264 = '';
  for (const f of satz.felder) {
    switch (f.tag) {
      case '082': case '083': case '084':
        if (/sdnb$/.test(eins(f, '2'))) dnb.push(...alle(f, 'a'));
        break;
      case '041': sprache.push(...alle(f, 'a')); break;
      case '600': case '610': case '611': case '630': case '650': schlagwoerter.push(...alle(f, 'a')); break;
      case '651': geografika.push(...alle(f, 'a')); break;
      case '655': form.push(...alle(f, 'a')); break;
      case '689': {
        const art = eins(f, 'D'), a = eins(f, 'a');
        if (!a) break; // die Zeile „$5 DE-101“ schließt nur die Kette
        if (eins(f, 'A') === 'f') form.push(a);
        else if (art === 'g') geografika.push(a);
        else if (art && 'pbfus'.includes(art)) schlagwoerter.push(a);
        break; // $A z (Zeit, „Geschichte 1933–1945“) bleibt draußen
      }
      case '490': case '830': reihen.push(...alle(f, 'a')); break;
      case '263': if (/^\d{6}$/.test(eins(f, 'a'))) monat263 = eins(f, 'a'); break;
      case '015': for (const a of alle(f, 'a')) if (/^\d{2},A\d{2}$/.test(a) && !heftA) heftA = a; break;
      case '264': if (!jahr264) jahr264 = /\d{4}/.exec(eins(f, 'c'))?.[0] ?? ''; break;
    }
  }
  if (!sprache.length) {
    const s = (satz.kontroll['008'] ?? '').slice(35, 38).trim();
    if (/^[a-z]{3}$/.test(s) && s !== 'und' && s !== 'zxx') sprache.push(s);
  }
  const jahr008 = (satz.kontroll['008'] ?? '').slice(7, 11);
  const jahr = jahr264 || (/^\d{4}$/.test(jahr008) ? jahr008 : '');
  let erschienen: string | undefined;
  if (monat263 && Number(monat263.slice(4)) >= 1 && Number(monat263.slice(4)) <= 12) erschienen = `${monat263.slice(0, 4)}-${monat263.slice(4)}`;
  else if (heftA) {
    // „26,A30“: Heft 30 von 52 im Jahr 2026 ≈ Juli. Liegt das Heft im Folgejahr, gilt der Dezember des Erscheinungsjahrs.
    const heftJahr = `20${heftA.slice(0, 2)}`;
    const m = Math.min(12, Math.max(1, Math.ceil((Number(heftA.slice(4)) * 12) / 52)));
    erschienen = jahr && heftJahr > jahr ? `${jahr}-12` : `${heftJahr}-${String(m).padStart(2, '0')}`;
  } else if (jahr) erschienen = jahr;
  return {
    gefunden: true, idn: satz.kontroll['001'], erschienen,
    dnb: einmalig(dnb), sprache: einmalig(sprache), schlagwoerter: einmalig(schlagwoerter),
    geografika: einmalig(geografika), form: einmalig(form), reihen: einmalig(reihen),
  };
}

/** Den richtigen Satz wählen: der, der die ISBN in 020 trägt (mehrbändige Werke liefern mehrere), sonst der reichste. */
export function besterSatz(xml: string, isbn?: string): Erschliessung {
  const saetze = marcSaetze(xml);
  const nr = isbn ? normalisiereIsbn(isbn) : null;
  const mitIsbn = nr
    ? saetze.filter((s) => s.felder.some((f) => f.tag === '020' && alle(f, 'a').concat(alle(f, '9')).some((x) => normalisiereIsbn(x) === nr)))
    : [];
  const gelesen = (mitIsbn.length ? mitIsbn : saetze).map(ausMarc);
  const gewicht = (e: Erschliessung) => e.dnb.length * 3 + e.schlagwoerter.length + e.geografika.length + e.form.length;
  return gelesen.sort((x, y) => gewicht(y) - gewicht(x))[0] ?? LEER;
}

export function erschliessungUrl(cql: string): string {
  const p = new URLSearchParams({ version: '1.1', operation: 'searchRetrieve', query: cql, recordSchema: 'MARC21-xml', maximumRecords: '10' });
  return `https://services.dnb.de/sru/dnb?${p.toString()}`;
}

const merker = new Map<string, Erschliessung>();

/** Sacherschließung per ISBN (oder DNB-Nummer). Kein Treffer → LEER (gefunden: false). */
export async function erschliessung(a: { isbn?: string; idn?: string }): Promise<Erschliessung> {
  const isbn = a.isbn ? normalisiereIsbn(a.isbn) : null;
  const cql = a.idn && /^[0-9X]{8,10}$/i.test(a.idn) ? `idn=${a.idn.toUpperCase()}` : isbn ? `isbn=${isbn}` : null;
  if (!cql) return LEER;
  const gemerkt = merker.get(cql);
  if (gemerkt) return gemerkt;
  const res = await fetch(erschliessungUrl(cql));
  if (!res.ok) throw new Error(`DNB antwortet mit ${res.status}`);
  const e = besterSatz(await res.text(), isbn ?? undefined);
  if (merker.size > 300) merker.clear();
  merker.set(cql, e);
  return e;
}
