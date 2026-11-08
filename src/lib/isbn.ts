// ISBN-Hilfen: Barcode (EAN-13) → ISBN, Prüfziffern, Umrechnung 10 ↔ 13.

export const nurZiffern = (s: string): string => s.replace(/[^0-9Xx]/g, '').toUpperCase();

export function istIsbn13(s: string): boolean {
  const d = nurZiffern(s);
  if (!/^97[89]\d{10}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10 === Number(d[12]);
}

export function istIsbn10(s: string): boolean {
  const d = nurZiffern(s);
  if (!/^\d{9}[\dX]$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += (d[i] === 'X' ? 10 : Number(d[i])) * (10 - i);
  return sum % 11 === 0;
}

export function isbn10zu13(isbn10: string): string {
  const kern = '978' + nurZiffern(isbn10).slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(kern[i]) * (i % 2 === 0 ? 1 : 3);
  return kern + ((10 - (sum % 10)) % 10);
}

/** Normalisiert eine Eingabe (Barcode oder getippt) zu ISBN-13, sonst null. */
export function normalisiereIsbn(eingabe: string): string | null {
  const d = nurZiffern(eingabe);
  if (istIsbn13(d)) return d;
  if (istIsbn10(d)) return isbn10zu13(d);
  return null;
}

/** Sucht in freiem Text (z. B. OCR einer Impressumsseite) nach einer gültigen ISBN. */
export function findeIsbnInText(text: string): string | null {
  const kandidaten = text.match(/(?:ISBN[\s:-]*)?(97[89][\d\s-]{10,16}|\d[\d\s-]{8,12}[\dXx])/g) ?? [];
  for (const k of kandidaten) {
    const n = normalisiereIsbn(k);
    if (n) return n;
  }
  return null;
}

/** ISBN-13 mit 978 → alte ISBN-10 (ältere Angebote sind oft nur so eingestellt); 979er haben keine. */
export function isbn13zu10(isbn13: string): string | null {
  const d = nurZiffern(isbn13);
  if (!istIsbn13(d) || !d.startsWith('978')) return null;
  const kern = d.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(kern[i]) * (10 - i);
  const p = (11 - (sum % 11)) % 11;
  return kern + (p === 10 ? 'X' : String(p));
}
