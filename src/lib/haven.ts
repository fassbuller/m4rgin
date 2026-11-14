// Buch vom Handy an Haven schicken (Firestream-Betriebs-App). Haven zeigt eingegangene Bücher oben in der
// Leiste hinter einem kleinen Handy-Symbol an – wie die Download-Anzeige im Firefox.
//
// Vertrag (mit Firestream2 abgestimmt, Haven-Seite dort umgesetzt):
//   POST {adresse}/api/m4rgin/eingang
//   Authorization: Bearer {Geräte-Schlüssel}   ← gibt Haven je Handy aus (keine Haven-Anmeldung am Handy)
//   Content-Type: application/json
//   Body: HavenBuch (siehe unten), Antwort 2xx = angekommen
// Ohne Adresse/Schlüssel ist die Funktion aus; ISBN kopieren und Teilen gehen immer.

export interface HavenZugang {
  /** z. B. https://haven.hennwack.de oder http://192.168.1.20:5002 */
  adresse: string;
  /** Geräte-Schlüssel aus Haven (geheim, liegt im sicheren Speicher) */
  schluessel: string;
}

export interface BuchFuerHaven {
  isbn?: string;
  titel: string;
  autoren: string[];
  verlag?: string;
  jahr?: string;
  einband?: string;
  neupreis?: number;
  /** Preis-Vorschlag bzw. endgültiger Preis in m4rgin */
  preis?: number | null;
  /** grabbel | regal | lager */
  kategorie?: string;
  /** Buch-Zustand intern (wie_neu … maengel) */
  zustand?: string;
  /** Seltenheits-Stufe (gewoehnlich … raritaet) */
  stufe?: string;
  /** Günstigstes Vergleichsangebot (gesamt inkl. Versand) und Anzahl Angebote */
  vergleich?: number | null;
  angebote?: number | null;
}

export interface HavenBuch extends BuchFuerHaven {
  quelle: 'm4rgin';
  /** App-Stand, z. B. „m4rgin 0.1.0 · Stand 6a99704 …“ */
  version: string;
  gesendet: string;
}

export function havenPayload(b: BuchFuerHaven, version: string, jetzt = new Date()): HavenBuch {
  return { ...b, quelle: 'm4rgin', version, gesendet: jetzt.toISOString() };
}

export function havenBereit(z?: HavenZugang | null): z is HavenZugang {
  return !!z && /^https?:\/\/\S+$/i.test(z.adresse.trim()) && z.schluessel.trim().length > 0;
}

export function havenUrl(z: HavenZugang): string {
  return `${z.adresse.trim().replace(/\/+$/, '')}/api/m4rgin/eingang`;
}

const euro = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;

/** Text für „Teilen“ (Nachricht, Mail, Notizen …) */
export function teilenText(b: BuchFuerHaven): string {
  const zeile2 = [b.autoren[0], b.verlag, b.jahr].filter(Boolean).join(' · ');
  return [
    b.titel,
    zeile2 || null,
    b.isbn ? `ISBN ${b.isbn}` : null,
    b.preis != null ? `m4rgin-Preis: ${euro(b.preis)}` : null,
    b.isbn ? `https://www.booklooker.de/B%C3%BCcher/Angebote/isbn=${b.isbn}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

/** Schickt das Buch an Haven. Wirft einen verständlichen Fehler, wenn es nicht ankommt. */
export async function anHavenSenden(z: HavenZugang, buch: HavenBuch, timeoutMs = 10000): Promise<void> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(havenUrl(z), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${z.schluessel.trim()}` },
      body: JSON.stringify(buch),
      signal: ctrl.signal,
    });
    if (res.status === 401 || res.status === 403) throw new Error('Haven kennt diesen Geräte-Schlüssel nicht (Einstellungen prüfen).');
    if (res.status === 404) throw new Error('Haven hat noch keinen Empfang für m4rgin (/api/m4rgin/eingang).');
    if (!res.ok) throw new Error(`Haven antwortet mit ${res.status}.`);
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw new Error('Haven antwortet nicht (Adresse/WLAN prüfen).');
    if (/network request failed/i.test(String(e))) throw new Error('Haven nicht erreichbar (Adresse/WLAN prüfen).');
    throw e;
  } finally {
    clearTimeout(t);
  }
}
