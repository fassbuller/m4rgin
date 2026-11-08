// booklooker Artikelsuche (Partner-Schnittstelle, v1.2)
// Doku: https://www.booklooker.de/pages/api_search.php (von Lenny am 07.11.2026 übermittelt)
// - Partner-ID (pid) separat bei booklooker beantragen
// - kostenlos bis 50 Aufrufe pro 10 Minuten, mehr gegen Gebühr
// - Versandkosten nach DE (showShippingPrice=de), Sortierung nach Preis + Porto
// - Antwort: „selbsterklärendes XML“, Deep-Link im Element <DetailLinkUrl>
// ⚠ Die übrigen Element-Namen sind in der Doku nicht genannt. Der Parser liest darum jedes Element
//   mit <DetailLinkUrl> generisch aus und sucht Preisfelder über mehrere mögliche Namen.
//   Beim ersten Live-Test über „Quellen testen“ in den Einstellungen die Rohantwort prüfen.

import { Angebot, PreisQuelle, runde2 } from '../markt';
import { dekodiere } from '../dnb';

export interface BooklookerZugang {
  aktiv: boolean;
  pid: string;
}

const BASIS = 'https://api.booklooker.de/interface/search.php';

export function booklookerUrl(z: BooklookerZugang, a: { isbn?: string; titel?: string; autor?: string }): string {
  const p = new URLSearchParams({
    pid: z.pid,
    medium: 'book',
    encoding: 'utf8',
    limit: '50',
    showShippingPrice: 'de',
    sortOrder: 'pricePlusShipping',
    sortDir: 'asc',
    extraFields: 'Condition|SellerType|EditionNo|Format|PublisherPlace',
    discardUnavailable: '1',
  });
  if (a.isbn) p.set('isbn', a.isbn);
  else {
    if (a.titel) p.set('title', a.titel);
    if (a.autor) p.set('author', a.autor);
  }
  return `${BASIS}?${p.toString()}`;
}

/** Kinder-Elemente eines XML-Blocks als Map (Name klein geschrieben → Text). */
function kinder(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /<([A-Za-z_][\w]*)(?:\s[^>]*)?>([^<]*)<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    const k = m[1].toLowerCase();
    if (!(k in out)) out[k] = dekodiere(m[2].replace(/^<!\[CDATA\[|\]\]>$/g, ''));
  }
  // CDATA-Inhalte
  const re2 = /<([A-Za-z_][\w]*)(?:\s[^>]*)?><!\[CDATA\[([\s\S]*?)\]\]><\/\1>/g;
  while ((m = re2.exec(block))) {
    const k = m[1].toLowerCase();
    if (!(k in out)) out[k] = m[2].trim();
  }
  return out;
}

const zahl = (s?: string): number | null => {
  if (s == null || s === '') return null;
  const n = Number(s.replace(/[^\d.,]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

const erstes = (o: Record<string, string>, namen: string[]) => namen.map((n) => o[n]).find((v) => v != null && v !== '');

/** Findet die sich wiederholenden Angebots-Blöcke: das Eltern-Element jedes <DetailLinkUrl>. */
export function angebotsBloecke(xml: string): string[] {
  const kandidaten = ['Item', 'Article', 'Artikel', 'Offer', 'Book', 'Result', 'Treffer'];
  for (const tag of kandidaten) {
    const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g');
    const bloecke = [...xml.matchAll(re)].map((m) => m[1]).filter((b) => /<DetailLinkUrl>/i.test(b));
    if (bloecke.length) return bloecke;
  }
  // Fallback: an jedem DetailLinkUrl aufteilen
  return xml.split(/(?=<DetailLinkUrl>)/i).slice(1);
}

export function parseBooklooker(xml: string, versandPauschale: number): Angebot[] {
  const out: Angebot[] = [];
  for (const b of angebotsBloecke(xml)) {
    const o = kinder(b);
    const preis = zahl(erstes(o, ['price', 'preis', 'itemprice', 'articleprice']));
    if (preis == null || preis <= 0) continue;
    const versandEcht = zahl(erstes(o, ['shippingprice', 'shipping', 'porto', 'shippingcosts', 'shippingcost']));
    const versand = versandEcht ?? versandPauschale;
    const sellerType = erstes(o, ['sellertype']);
    out.push({
      quelle: 'booklooker',
      plattform: 'booklooker',
      haendler: erstes(o, ['seller', 'sellername', 'offerer', 'anbieter', 'username']) ?? (sellerType === '0' ? 'privat' : undefined),
      preis,
      versand,
      versandGeschaetzt: versandEcht == null,
      gesamt: runde2(preis + versand),
      zustandText: [erstes(o, ['condition', 'zustand']), erstes(o, ['format']), erstes(o, ['editionno'])]
        .filter(Boolean)
        .join(' · ') || undefined,
      jahr: erstes(o, ['year', 'jahr', 'publicationyear'])?.match(/\d{4}/)?.[0],
      url: erstes(o, ['detaillinkurl']),
      titel: [erstes(o, ['author', 'autor']), erstes(o, ['title', 'titel'])].filter(Boolean).join(': ') || undefined,
    });
  }
  return out;
}

export function booklookerQuelle(z: BooklookerZugang, versandPauschale: number): PreisQuelle {
  return {
    id: 'booklooker',
    aktiv: z.aktiv && !!z.pid,
    async suche(anfrage) {
      const res = await fetch(booklookerUrl(z, anfrage));
      if (!res.ok) throw new Error(`booklooker antwortet mit ${res.status}`);
      return parseBooklooker(await res.text(), versandPauschale);
    },
  };
}
