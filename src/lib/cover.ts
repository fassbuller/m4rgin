// Cover-Kette: DNB (Bilder aus dem VLB, stark bei deutschen Titeln) → Google Books → Open Library.
// DNB und Open Library antworten mit 404, wenn sie kein Bild haben – das Bild-Element merkt das selbst
// und nimmt die nächste Quelle. Google braucht vorher eine Abfrage, um die Bildadresse zu erfahren.

import { coverUrl as olCoverUrl } from './openlibrary';

export const dnbCoverUrl = (isbn: string) => `https://portal.dnb.de/opac/mvb/cover?isbn=${isbn}&size=m`;

/** Platzhalter in der Kette: wird erst beim Erreichen per Google-Abfrage aufgelöst. */
export const GOOGLE = 'google:' as const;

export function coverKette(isbn?: string, bekannt?: string): string[] {
  const kette: string[] = [];
  if (isbn) kette.push(dnbCoverUrl(isbn), GOOGLE + isbn);
  if (bekannt && !kette.includes(bekannt)) kette.push(bekannt);
  if (isbn && bekannt !== olCoverUrl(isbn)) kette.push(olCoverUrl(isbn));
  return kette;
}

interface GoogleAntwort {
  items?: { volumeInfo?: { imageLinks?: { thumbnail?: string; smallThumbnail?: string } } }[];
}

/** Erstes Vorschaubild, auf https und ohne den „Eselsohr“-Effekt. */
export function parseGoogleCover(json: GoogleAntwort): string | null {
  for (const it of json.items ?? []) {
    const l = it.volumeInfo?.imageLinks;
    const url = l?.thumbnail ?? l?.smallThumbnail;
    if (url) return url.replace(/^http:/, 'https:').replace('&edge=curl', '');
  }
  return null;
}

let googleSchluessel = '';
/** Ohne Schlüssel teilt man sich ein knappes Tageskontingent mit allen anderen – dann fällt Google oft aus. */
export function coverEinstellen(schluessel: string) {
  googleSchluessel = schluessel;
}

/** Map mit Obergrenze: das älteste Element fliegt raus – lange Sitzungen wachsen sonst unbegrenzt. */
// Bewusst als Hülle statt `extends Map`: eingebaute Klassen zu erweitern ist in JS-Engines heikel.
export class BegrenzteMap<K, V> {
  private m = new Map<K, V>();
  constructor(private grenze: number) {}
  get(k: K) {
    return this.m.get(k);
  }
  has(k: K) {
    return this.m.has(k);
  }
  delete(k: K) {
    return this.m.delete(k);
  }
  get size() {
    return this.m.size;
  }
  set(k: K, v: V): this {
    this.m.delete(k); // neu einreihen = zuletzt benutzt
    this.m.set(k, v);
    if (this.m.size > this.grenze) this.m.delete(this.m.keys().next().value as K);
    return this;
  }
}

const googleCache = new BegrenzteMap<string, Promise<string | null>>(300);

export function googleCover(isbn: string): Promise<string | null> {
  let p = googleCache.get(isbn);
  if (!p) {
    const key = googleSchluessel ? `&key=${encodeURIComponent(googleSchluessel)}` : '';
    p = fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&fields=items(volumeInfo/imageLinks)${key}`)
      .then((r) => (r.ok ? r.json() : {}))
      .then(parseGoogleCover)
      .catch(() => null);
    p.then((url) => url || googleCache.delete(isbn)); // Fehlschläge nicht merken – später nochmal versuchen
    googleCache.set(isbn, p);
  }
  return p;
}

/** Welche Stufe der Kette zuletzt funktioniert hat – Listen (Stapel, Verlauf) prüfen so nicht jedes Mal neu. */
export const coverTreffer = new BegrenzteMap<string, string | null>(500);
