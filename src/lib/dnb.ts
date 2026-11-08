// Deutsche Nationalbibliothek, SRU-Schnittstelle (kostenlos, ohne Anmeldung).
// Doku: https://www.dnb.de/sru · Format „oai_dc“ (Dublin Core), max. 100 Treffer pro Anfrage.
// Indizes, die wir nutzen: isbn, tit (Titel), per (Person), woe (alle Wörter), jhr (Jahr).

import { Titel } from './titel';
import { normalisiereIsbn } from './isbn';

const BASIS = 'https://services.dnb.de/sru/dnb';

export function dnbUrl(cql: string, max = 20): string {
  const p = new URLSearchParams({
    version: '1.1',
    operation: 'searchRetrieve',
    query: cql,
    recordSchema: 'oai_dc',
    maximumRecords: String(max),
  });
  return `${BASIS}?${p.toString()}`;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function dekodiere(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => ENTITIES[e])
    .trim();
}

function alle(xml: string, tag: string): { attr: string; text: string }[] {
  const re = new RegExp(`<${tag}(\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g');
  const out: { attr: string; text: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push({ attr: m[1] ?? '', text: dekodiere(m[2]) });
  return out;
}

/** "Mann, Thomas [Verfasser]" → "Mann, Thomas"; Rollen wie Übersetzer:in werden verworfen. */
function autorAus(creator: string): string | null {
  const rolle = creator.match(/\[([^\]]+)\]/)?.[1]?.toLowerCase() ?? '';
  if (rolle && !/verfasser|autor|hrsg|herausgeber/.test(rolle)) return null;
  return creator.replace(/\s*\[[^\]]*\]\s*/g, '').trim() || null;
}

/** dc:title kommt oft als "Titel : Untertitel / Verantwortlichkeitsangabe" */
function bereinigeTitel(t: string): string {
  return t
    .split(' / ')[0]
    .replace(/^\[[^\]]*\]\s*;\s*/, '') // "[Originaltitel] ; Deutscher Titel"
    .replace(/\s+:\s+/, ': ')
    .trim();
}

/** "978-3-518-46880-7 Broschur : EUR 12.00 (DE), …" → Einband + deutscher Neupreis */
export function isbnZusatz(roh: string): { einband?: string; neupreis?: number } {
  const einband = roh.match(/^[\dXx-]+\s+([^:]+?)\s*(:|$)/)?.[1]?.trim();
  // Manche Datensätze nennen nur einen Preis ohne "(DE)" – dann den ersten EUR-Betrag nehmen.
  const preis =
    roh.match(/EUR\s*(\d+(?:[.,]\d{1,2})?)\s*\(DE\)/)?.[1] ??
    roh.match(/EUR\s*(\d+(?:[.,]\d{1,2})?)/)?.[1];
  return {
    einband: einband || undefined,
    neupreis: preis ? Number(preis.replace(',', '.')) : undefined,
  };
}

/** dc:publisher kommt oft als "Frankfurt am Main : Suhrkamp" */
function verlagUndOrt(p?: string): { verlag?: string; ort?: string } {
  if (!p) return {};
  const [ort, verlag] = p.includes(' : ') ? p.split(' : ', 2) : [undefined, p];
  return { verlag: verlag?.trim(), ort: ort?.trim() };
}

export function parseDnb(xml: string): { gesamt: number; titel: Titel[] } {
  const gesamt = Number(xml.match(/<numberOfRecords>(\d+)<\/numberOfRecords>/)?.[1] ?? 0);
  const records = xml.split(/<record>/).slice(1);
  const titel: Titel[] = [];
  for (const rec of records) {
    const t = alle(rec, 'dc:title')[0]?.text;
    if (!t) continue;
    const ids = alle(rec, 'dc:identifier');
    const isbnRoh = ids.find((i) => /tel:ISBN/.test(i.attr))?.text;
    const isbn = isbnRoh ? normalisiereIsbn(isbnRoh.split(' ')[0]) ?? undefined : undefined;
    const { einband, neupreis } = isbnRoh ? isbnZusatz(isbnRoh) : {};
    const { verlag, ort } = verlagUndOrt(alle(rec, 'dc:publisher')[0]?.text);
    titel.push({
      einband,
      neupreis,
      quelle: 'dnb',
      id: ids.find((i) => /dnb:IDN/.test(i.attr))?.text,
      titel: bereinigeTitel(t),
      autoren: alle(rec, 'dc:creator')
        .map((c) => autorAus(c.text))
        .filter((a): a is string => !!a),
      verlag,
      ort,
      jahr: alle(rec, 'dc:date')[0]?.text.match(/\d{4}/)?.[0],
      isbn,
      umfang: alle(rec, 'dc:format')[0]?.text,
      sprache: alle(rec, 'dc:language')[0]?.text,
      sachgruppen: alle(rec, 'dc:subject')
        .map((s) => s.text)
        .filter(Boolean),
    });
  }
  return { gesamt, titel };
}

export async function dnbSuche(cql: string, max = 20): Promise<{ gesamt: number; titel: Titel[] }> {
  const res = await fetch(dnbUrl(cql, max));
  if (!res.ok) throw new Error(`DNB antwortet mit ${res.status}`);
  return parseDnb(await res.text());
}

export const dnbIsbn = (isbn: string) => dnbSuche(`isbn=${isbn}`, 10);
