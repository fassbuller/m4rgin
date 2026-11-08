// Aus freiem Text bzw. OCR-Zeilen eine DNB-Suchanfrage bauen.

const STOPPWOERTER = new Set(
  (
    'der die das des dem den ein eine einer eines einem einen und oder in im zu zum zur von vom mit ' +
    'auf aus bei nach über für fuer an am als wie so ist sind war the of and a an to for on with by ' +
    'band bd teil verlag auflage aufl roman erzählung gedichte herausgegeben hrsg übersetzt'
  ).split(' '),
);

/** Suchwörter aus einem Text: ohne Stoppwörter, ohne Sonderzeichen, max. n Wörter. */
export function suchwoerter(text: string, max = 6): string[] {
  const woerter = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPPWOERTER.has(w) && !/^\d+$/.test(w));
  return [...new Set(woerter)].slice(0, max);
}

/** CQL-Wert maskieren: Anführungszeichen entfernen, Wörter mit Bindestrich quoten. */
const cqlWort = (w: string) => (/[\s-]/.test(w) ? `"${w.replace(/"/g, '')}"` : w);

export interface SuchFelder {
  titel?: string;
  autor?: string;
  verlag?: string;
  jahr?: string;
  frei?: string;
}

/** Baut eine CQL-Anfrage für die DNB. Gibt null zurück, wenn nichts Suchbares übrig bleibt. */
export function baueCql(f: SuchFelder): string | null {
  const teile: string[] = [];
  for (const w of suchwoerter(f.titel ?? '', 5)) teile.push(`tit=${cqlWort(w)}`);
  // Bei Personen reicht der Nachname: "Mann, Thomas" → Teil vor dem Komma, "Thomas Mann" → letztes Wort.
  const autor = (f.autor ?? '').trim();
  const nachnameTeil = autor.includes(',') ? autor.split(',')[0] : autor.split(/\s+/).pop() ?? '';
  const autorWort = suchwoerter(nachnameTeil, 2).pop();
  if (autorWort) teile.push(`per=${cqlWort(autorWort)}`);
  for (const w of suchwoerter(f.frei ?? '', 6)) teile.push(`woe=${cqlWort(w)}`);
  if (f.verlag && teile.length < 2) {
    for (const w of suchwoerter(f.verlag, 1)) teile.push(`woe=${cqlWort(w)}`);
  }
  if (teile.length === 0) return null;
  if (f.jahr && /^\d{4}$/.test(f.jahr)) teile.push(`jhr=${f.jahr}`);
  return teile.join(' and ');
}

// ---- OCR-Zeilen einer Titelseite einordnen ----

export interface OcrZeile {
  text: string;
  hoehe: number; // Zeilenhöhe in Pixeln (≈ Schriftgröße)
  oben: number;
}

export type Rolle = 'titel' | 'autor' | 'verlag' | 'jahr' | 'ignorieren';

/**
 * Erste Schätzung, welche Zeile was ist – die Nutzer:in kann jede Zeile antippen und umstellen
 * (wie ManaBox' „strikter Modus“: im Zweifel bestätigt ein Mensch).
 * Heuristik: größte Schrift = Titel; Zeile mit 4-stelliger Jahreszahl = Jahr;
 * kurze Zeile oberhalb des Titels = Autor:in; unterste Zeilen = Verlag/Ort.
 */
export function schaetzeRollen(zeilen: OcrZeile[]): Rolle[] {
  const rollen: Rolle[] = zeilen.map(() => 'ignorieren');
  if (zeilen.length === 0) return rollen;

  const brauchbar = zeilen
    .map((z, i) => ({ ...z, i }))
    .filter((z) => z.text.replace(/[^\p{L}]/gu, '').length >= 2);
  if (brauchbar.length === 0) return rollen;

  const titelZ = [...brauchbar].sort((a, b) => b.hoehe - a.hoehe)[0];
  rollen[titelZ.i] = 'titel';
  // Folgezeilen mit fast gleicher Schrifthöhe gehören zum Titel
  for (const z of brauchbar) {
    if (z.i !== titelZ.i && z.hoehe >= titelZ.hoehe * 0.8 && Math.abs(z.oben - titelZ.oben) < titelZ.hoehe * 3) {
      rollen[z.i] = 'titel';
    }
  }

  zeilen.forEach((z, i) => {
    if (rollen[i] === 'ignorieren' && /\b(1[5-9]\d{2}|20[0-2]\d)\b/.test(z.text)) rollen[i] = 'jahr';
  });

  const ueberTitel = brauchbar.filter((z) => z.oben < titelZ.oben && rollen[z.i] === 'ignorieren');
  const autorZ = ueberTitel.sort((a, b) => b.hoehe - a.hoehe)[0];
  if (autorZ && autorZ.text.split(/\s+/).length <= 5) rollen[autorZ.i] = 'autor';

  const unten = [...brauchbar].sort((a, b) => b.oben - a.oben)[0];
  if (unten && rollen[unten.i] === 'ignorieren') rollen[unten.i] = 'verlag';

  return rollen;
}

export function felderAusRollen(zeilen: OcrZeile[], rollen: Rolle[]): SuchFelder {
  const sammle = (r: Rolle) =>
    zeilen
      .filter((_, i) => rollen[i] === r)
      .map((z) => z.text)
      .join(' ')
      .trim() || undefined;
  return {
    titel: sammle('titel'),
    autor: sammle('autor'),
    verlag: sammle('verlag'),
    jahr: sammle('jahr')?.match(/\b(1[5-9]\d{2}|20[0-2]\d)\b/)?.[1],
  };
}
