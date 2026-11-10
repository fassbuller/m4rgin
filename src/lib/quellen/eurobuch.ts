// eurobuch Partner-Schnittstelle (Metasuche über ZVAB, AbeBooks u. a.)
// Doku: https://www.eurobuch.at/partner_interface_doc.php
// - Zugang über das Affiliate-Programm (Benutzername = "platform", Passwort). Testzugang: test / test
// - Antwort als XML mit <Book …/>-Elementen, Felder als Attribute
// - Versand: Die Doku nennt keinen, die echte Antwort hat aber fast immer versandkosten_eur
//   („0.00“ = versandkostenfrei). Nur wenn das Feld fehlt, rechnen wir die Pauschale drauf (als „geschätzt“ markiert).
// - Echte Antworten schreiben „firstedtion“ (sic) statt „firstedition“
// - Treffer sind ca. 3 Stunden gültig und sollen danach nicht weiter zwischengespeichert werden
// ⚠ Gegen die Doku gebaut, Live-Test steht aus (die Schnittstelle sperrt automatische Abrufe von hier).

import { Angebot, PreisQuelle, runde2 } from '../markt';
import { dekodiere } from '../dnb';

export interface EurobuchZugang {
  aktiv: boolean;
  benutzer: string;
  passwort: string;
}

const BASIS = 'https://www.eurobuch.at/extreq/meta/extquery.php';

export function eurobuchUrl(
  z: EurobuchZugang,
  a: { isbn?: string; titel?: string; autor?: string },
  clientIp = '-',
): string {
  const p = new URLSearchParams({
    platform: z.benutzer,
    password: z.passwort,
    mediatype: '0',
    clientip: clientIp,
    format: 'xml8',
    order: 'price',
  });
  if (a.isbn) p.set('isbn', a.isbn);
  else {
    if (a.titel) p.set('title', a.titel);
    if (a.autor) p.set('author', a.autor);
  }
  return `${BASIS}?${p.toString()}`;
}

/** Attribute eines Tags lesen, Namen klein geschrieben (Doku nennt beide Schreibweisen). */
function attribute(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([A-Za-z_]+)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag))) out[m[1].toLowerCase()] = zweifachDekodiert(m[2]);
  return out;
}

/** eurobuch kodiert manche Titel doppelt (`&amp;#8211;`) – dann ein zweiter Durchgang, sonst bleibt `&#8211;` stehen. */
export function zweifachDekodiert(s: string): string {
  const a = dekodiere(s);
  return /&(#\d+|#x[0-9a-f]+|amp|lt|gt|quot|apos);/i.test(a) ? dekodiere(a) : a;
}

const zahl = (s?: string): number | null => {
  if (!s) return null;
  const n = Number(s.replace(/[^\d.,]/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Wie zahl(), aber 0 ist gültig (versandkostenfrei). */
const versandZahl = (s?: string): number | null => {
  if (s == null || s.trim() === '') return null;
  const n = Number(s.replace(/[^\d.,]/g, '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function parseEurobuch(xml: string, versandPauschale: number): Angebot[] {
  const tags = xml.match(/<Book\b[^>]*\/?>/gi) ?? [];
  const angebote: Angebot[] = [];
  for (const t of tags) {
    const a = attribute(t);
    const preis = a.currency?.toUpperCase() === 'EUR' ? zahl(a.price) : zahl(a.priceeur);
    if (preis == null) continue;
    const versandEcht = versandZahl(a.versandkosten_eur);
    const versand = versandEcht ?? versandPauschale;
    angebote.push({
      quelle: 'eurobuch',
      plattform: a.platform || 'eurobuch',
      haendler: a.dealer || undefined,
      preis,
      versand,
      versandGeschaetzt: versandEcht == null,
      gesamt: runde2(preis + versand),
      zustandText: a.comment || undefined,
      jahr: a.year?.match(/\d{4}/)?.[0],
      erstausgabe: (a.firstedition ?? a.firstedtion) === '1',
      signiert: a.signed === '1',
      gebunden: a.hardcover === '1' ? true : a.paperback === '1' ? false : undefined,
      land: a.country || undefined,
      url: a.url || undefined,
      titel: [a.author, a.title].filter(Boolean).join(': ') || undefined,
      autor: a.author || undefined,
      neu: a.neubuch === '1' || undefined,
    });
  }
  return angebote;
}

/**
 * eurobuch antwortet bei Sperre/Kontingent mit HTTP 200 und Klartext statt XML, z. B. „no service 3-8“
 * (nicht dokumentiert; tritt auf, wenn zu viele Abfragen vom selben Zugang/derselben IP kamen).
 * Das ist ein Ausfall, kein „0 Angebote“ – sonst hielte die App das Buch für knapp.
 */
export function eurobuchAbgelehnt(text: string): string | null {
  // Jede <Error>-Meldung ist eine Sperre/Störung, egal mit welchem Text
  const fehler = text.match(/<Error>([\s\S]*?)<\/Error>/i)?.[1]?.trim();
  if (fehler) return dekodiere(fehler).slice(0, 80);
  if (/<ResultList\b|<Book\b/i.test(text)) return null;
  const t = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (/no service|not allowed|access denied|kein zugriff|error/i.test(t)) return t.slice(0, 80);
  return null;
}

export function eurobuchQuelle(z: EurobuchZugang, versandPauschale: number): PreisQuelle {
  return {
    id: 'eurobuch',
    aktiv: z.aktiv && !!z.benutzer && !!z.passwort,
    async suche(anfrage) {
      const res = await fetch(eurobuchUrl(z, anfrage));
      if (!res.ok) throw new Error(`eurobuch antwortet mit ${res.status}`);
      const text = await res.text();
      const abgelehnt = eurobuchAbgelehnt(text);
      if (abgelehnt) throw new Error(`eurobuch verweigert die Abfrage („${abgelehnt}“)`);
      return parseEurobuch(text, versandPauschale);
    },
  };
}
