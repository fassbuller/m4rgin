// Open Library: zweite Quelle für ISBN-Treffer (v. a. englische Bücher) und Cover.

import { Titel } from './titel';

export const coverUrl = (isbn: string) =>
  `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`;

interface OlEintrag {
  title?: string;
  subtitle?: string;
  authors?: { name: string }[];
  publishers?: { name: string }[];
  publish_places?: { name: string }[];
  publish_date?: string;
  number_of_pages?: number;
  cover?: { medium?: string };
}

export function parseOpenLibrary(json: Record<string, OlEintrag>, isbn: string): Titel | null {
  const e = json[`ISBN:${isbn}`];
  if (!e?.title) return null;
  return {
    quelle: 'openlibrary',
    titel: e.subtitle ? `${e.title}: ${e.subtitle}` : e.title,
    autoren: (e.authors ?? []).map((a) => a.name),
    verlag: e.publishers?.[0]?.name,
    ort: e.publish_places?.[0]?.name,
    jahr: e.publish_date?.match(/\d{4}/)?.[0],
    isbn,
    umfang: e.number_of_pages ? `${e.number_of_pages} S.` : undefined,
    coverUrl: e.cover?.medium,
  };
}

export async function openLibraryIsbn(isbn: string): Promise<Titel | null> {
  const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&jscmd=data&format=json`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return parseOpenLibrary(await res.json(), isbn);
}
