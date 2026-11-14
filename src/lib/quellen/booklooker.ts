// booklooker Artikelsuche über die REST API v2.0
// Doku: https://www.booklooker.de/pages/rest_api.php?interface=search (laut booklooker-Support vom 13.11.2026
// die aktuelle; die alte Partner-Schnittstelle mit pid ist überholt) · OpenAPI: /download/openapi.yaml
// - Anmeldung: POST https://api.booklooker.de/2.0/authenticate?apiKey=… → {status:"OK", returnValue:"<Token>"}
//   Den persönlichen API-Key gibt es im booklooker-Konto unter /app/priv/api_key.php.
// - Das Token verfällt nach 10 Minuten ohne Aufruf → dann neu anmelden (auch bei TOKEN_EXPIRED/UNKNOWN).
// - Suche: GET https://api.booklooker.de/2.0/search?token=…&isbn=…  → {status:"OK", returnValue:[…Artikel…]}
//   Fehler: {status:"NOK", returnValue:"QUOTA_EXCEEDED" | "TEMPORARILY_BLOCKED" | "SERVER_DOWN" | …}
// - Kostenlos bis 50 Aufrufe pro 10 Minuten.
// Feldnamen live geprüft (14.11.2026, aus Pegel): returnValue ist ein JSON-TEXT ("[]" bzw. "{\"Book\":[…]}"),
// Artikel mit SellerType (Zahl), Author, Title, Price, ShippingPrice, New, Condition, Edition (= Einband),
// Format (= Maße!), EditionNo, Country, Year, DetailLinkUrl, Offerer. Der Parser liest jedes
//   Artikel-Objekt generisch und sucht Preisfelder über mehrere mögliche Namen. Beim ersten Live-Test
//   über „Quellen testen“ die Rohantwort prüfen. Kommt doch XML, greift der alte XML-Parser.

import { Angebot, PreisQuelle, runde2 } from '../markt';
import { dekodiere } from '../dnb';
import { bindungAus } from '../ausgaben';

export interface BooklookerZugang {
  aktiv: boolean;
  /** Persönlicher API-Key aus dem booklooker-Konto */
  apiKey: string;
  /** Alte Partner-ID – von der REST API nicht mehr gebraucht, nur noch für ältere gespeicherte Einstellungen */
  pid?: string;
}

const BASIS = 'https://api.booklooker.de/2.0';

export function booklookerSuchUrl(token: string, a: { isbn?: string; titel?: string; autor?: string }): string {
  const p = new URLSearchParams({
    token,
    medium: 'book',
    limit: '50',
    showShippingPrice: 'de',
    sortOrder: 'pricePlusShipping',
    sortDir: 'asc',
    extraFields: 'Condition|SellerType|EditionNo|Format|PublisherPlace|SellerCountry',
    discardUnavailable: '1',
  });
  if (a.isbn) p.set('isbn', a.isbn);
  else {
    if (a.titel) p.set('title', a.titel);
    if (a.autor) p.set('author', a.autor);
  }
  return `${BASIS}/search?${p.toString()}`;
}

// ---------- Anmeldung ----------

let token: { wert: string; fuer: string; zuletzt: number } | null = null;
/** booklooker: Token verfällt nach 10 Minuten ohne Aufruf – wir erneuern nach 9. */
const TOKEN_LEBT_MS = 9 * 60_000;

/** NOK-Codes, bei denen ein neues Token hilft */
const TOKEN_FEHLER = /^TOKEN_(EXPIRED|MISSING|UNKNOWN)$/;

/** Ein NOK-Code als Fehlertext, den markt.ts richtig einordnet (endgültig ja/nein, kurz „gesperrt“ …). */
export function booklookerFehler(code: string): Error {
  if (/QUOTA_EXCEEDED|TEMPORARILY_BLOCKED/.test(code)) return new Error(`booklooker verweigert die Abfrage („${code}“)`);
  if (/AUTHENTICATION_FAILED|API_KEY_MISSING/.test(code)) return new Error(`booklooker-Anmeldung fehlgeschlagen („${code}“) – API-Key prüfen`);
  if (/SERVER_DOWN/.test(code)) return new Error(`booklooker antwortet mit 503 (Wartung, „${code}“)`);
  return new Error(`booklooker meldet „${code}“`);
}

async function json(res: Response): Promise<{ status?: string; returnValue?: unknown }> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    // Kein JSON (z. B. XML oder HTML-Fehlerseite) – als Rohtext weiterreichen
    return { status: res.ok ? 'OK' : 'NOK', returnValue: text };
  }
}

export async function booklookerToken(z: BooklookerZugang, neu = false): Promise<string> {
  const jetzt = Date.now();
  if (!neu && token && token.fuer === z.apiKey && jetzt - token.zuletzt < TOKEN_LEBT_MS) return token.wert;
  const res = await fetch(`${BASIS}/authenticate?apiKey=${encodeURIComponent(z.apiKey)}`, { method: 'POST' });
  if (!res.ok && res.status !== 200) throw new Error(`booklooker-Anmeldung fehlgeschlagen (${res.status})`);
  const j = await json(res);
  if (j.status !== 'OK' || typeof j.returnValue !== 'string' || !j.returnValue) {
    throw booklookerFehler(String(j.returnValue ?? 'AUTHENTICATION_FAILED'));
  }
  token = { wert: j.returnValue, fuer: z.apiKey, zuletzt: jetzt };
  return token.wert;
}

/** Suche mit Token; bei abgelaufenem Token einmal neu anmelden. Gibt die rohe returnValue zurück. */
export async function booklookerRoh(z: BooklookerZugang, a: { isbn?: string; titel?: string; autor?: string }): Promise<unknown> {
  for (let versuch = 0; versuch < 2; versuch++) {
    const t = await booklookerToken(z, versuch > 0);
    const res = await fetch(booklookerSuchUrl(t, a));
    if (!res.ok) throw new Error(`booklooker antwortet mit ${res.status}`);
    const j = await json(res);
    if (token) token.zuletzt = Date.now();
    if (j.status === 'OK') return j.returnValue;
    const code = String(j.returnValue ?? '');
    if (TOKEN_FEHLER.test(code) && versuch === 0) continue;
    throw booklookerFehler(code);
  }
  throw new Error('booklooker-Anmeldung fehlgeschlagen (Token)');
}

// ---------- Antwort lesen ----------

const zahl = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[^\d.,]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** Objekt mit klein geschriebenen Schlüsseln (eine Ebene tief, verschachtelte Objekte werden mit eingeflacht). */
function flach(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
        const n = k2.toLowerCase();
        if (!(n in out)) out[n] = v2;
      }
    }
    out[k.toLowerCase()] = v;
  }
  return out;
}

const erstes = (o: Record<string, unknown>, namen: string[]): string | undefined => {
  for (const n of namen) {
    const v = o[n];
    if (v != null && v !== '' && typeof v !== 'object') return dekodiere(String(v));
  }
  return undefined;
};

/** „Taschenbuch“, „Hardcover“, „Gebunden“ … → true/false, sonst unbekannt */
function gebundenAus(format?: string): boolean | undefined {
  const b = bindungAus(format);
  return b === 'hc' ? true : b === 'tb' ? false : undefined;
}

/** Ein Artikel (schon flach, Schlüssel klein) → Angebot */
function angebotAus(o: Record<string, unknown>, versandPauschale: number): Angebot | null {
  const preis = zahl(erstes(o, ['price', 'preis', 'itemprice', 'articleprice']));
  if (preis == null || preis <= 0) return null;
  const versandEcht = zahl(erstes(o, ['shippingprice', 'shipping', 'porto', 'shippingcosts', 'shippingcost']));
  const versand = versandEcht ?? versandPauschale;
  // SellerType laut Doku: 0 = privat, 1 = gewerblich (kommt live als Zahl; erstes() macht daraus Text)
  const sellerType = erstes(o, ['sellertype']);
  const autor = erstes(o, ['author', 'autor']);
  // „Offerer“ ist bei preisgebundener Neuware oft „verschiedene Anbieter“ – kein echter Händlername
  const anbieter = erstes(o, ['offerer', 'seller', 'sellername', 'anbieter', 'username', 'nickname']);
  const zustand = erstes(o, ['condition', 'zustand']);
  // Live-Feldnamen (14.11.2026): „Edition“ ist der Einband („Taschenbuch“), „Format“ sind die Maße
  // („206 mm × 126 mm × 36 mm“) – Maße gehören weder in den Zustand noch in die Einband-Erkennung.
  const einband = erstes(o, ['edition', 'binding', 'einband']);
  const neu = erstes(o, ['new']) === '1' || /neuware/i.test(zustand ?? '');
  return {
    quelle: 'booklooker',
    plattform: 'booklooker',
    haendler: (anbieter && !/^verschiedene anbieter$/i.test(anbieter) ? anbieter : undefined) ?? (sellerType === '0' ? 'privat' : undefined),
    preis,
    versand,
    versandGeschaetzt: versandEcht == null,
    gesamt: runde2(preis + versand),
    zustandText: [zustand, einband, erstes(o, ['editionno'])].filter(Boolean).join(' · ') || undefined,
    jahr: erstes(o, ['year', 'jahr', 'publicationyear'])?.match(/\d{4}/)?.[0],
    land: erstes(o, ['country', 'sellercountry'])?.toUpperCase(),
    url: erstes(o, ['detaillinkurl', 'deeplink', 'url', 'link']),
    titel: [autor, erstes(o, ['title', 'titel'])].filter(Boolean).join(': ') || undefined,
    autor,
    gebunden: gebundenAus(einband ?? (/\bmm\b/.test(erstes(o, ['format']) ?? '') ? undefined : erstes(o, ['format']))),
    neu: neu || undefined,
    verkaeuferTyp: sellerType === '0' ? 'privat' : sellerType === '1' ? 'gewerblich' : undefined,
  };
}

/** Die Artikel-Liste in der returnValue finden: direkt ein Array, oder das erste Array von Objekten darin. */
function artikelListe(v: unknown): Record<string, unknown>[] {
  if (Array.isArray(v)) return v.filter((x) => x && typeof x === 'object') as Record<string, unknown>[];
  if (v && typeof v === 'object') {
    for (const w of Object.values(v as Record<string, unknown>)) {
      const l = artikelListe(w);
      if (l.length) return l;
    }
  }
  return [];
}

/** returnValue der REST-Suche → Angebote. JSON-Liste, sonst (falls doch XML geliefert wird) XML. */
export function parseBooklookerAntwort(returnValue: unknown, versandPauschale: number): Angebot[] {
  // Live (14.11.2026): returnValue ist selbst ein JSON-Text – "[]" ohne Treffer, sonst "{\"Book\":[{…}]}"
  if (typeof returnValue === 'string') {
    const text = returnValue;
    try {
      returnValue = JSON.parse(text);
    } catch {
      return text.includes('<') ? parseBooklooker(text, versandPauschale) : [];
    }
  }
  return artikelListe(returnValue)
    .map((o) => angebotAus(flach(o), versandPauschale))
    .filter((a): a is Angebot => a != null);
}

// ---------- XML (alte Schnittstelle, als Rückfall) ----------

/** Kinder-Elemente eines XML-Blocks als Map (Name klein geschrieben → Text). */
function kinder(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /<([A-Za-z_][\w]*)(?:\s[^>]*)?>([^<]*)<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    const k = m[1].toLowerCase();
    if (!(k in out)) out[k] = m[2];
  }
  const re2 = /<([A-Za-z_][\w]*)(?:\s[^>]*)?><!\[CDATA\[([\s\S]*?)\]\]><\/\1>/g;
  while ((m = re2.exec(block))) {
    const k = m[1].toLowerCase();
    if (!(k in out)) out[k] = m[2].trim();
  }
  return out;
}

/** Findet die sich wiederholenden Angebots-Blöcke: das Eltern-Element jedes <DetailLinkUrl>. */
export function angebotsBloecke(xml: string): string[] {
  const kandidaten = ['Item', 'Article', 'Artikel', 'Offer', 'Book', 'Result', 'Treffer'];
  for (const tag of kandidaten) {
    const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g');
    const bloecke = [...xml.matchAll(re)].map((m) => m[1]).filter((b) => /<DetailLinkUrl>/i.test(b));
    if (bloecke.length) return bloecke;
  }
  return xml.split(/(?=<DetailLinkUrl>)/i).slice(1);
}

export function parseBooklooker(xml: string, versandPauschale: number): Angebot[] {
  return angebotsBloecke(xml)
    .map((b) => angebotAus(kinder(b), versandPauschale))
    .filter((a): a is Angebot => a != null);
}

// ---------- Quelle ----------

export function booklookerQuelle(z: BooklookerZugang, versandPauschale: number): PreisQuelle {
  return {
    id: 'booklooker',
    aktiv: z.aktiv && !!z.apiKey,
    // 50 Aufrufe pro 10 Minuten – keine Extra-Abfrage mit der ISBN-10
    isbn10Nachfrage: false,
    async suche(anfrage) {
      return parseBooklookerAntwort(await booklookerRoh(z, anfrage), versandPauschale);
    },
  };
}
