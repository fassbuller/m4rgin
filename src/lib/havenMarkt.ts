// Marktpreise über Haven/Pegel statt direkt bei booklooker/eurobuch/eBay – damit Testpersonen ohne eigene
// Zugänge echte Preise bekommen (Lennys Wahl „Variante 2“, 15.11.2026). Haven nutzt die Zugänge des Ladens.
//
// Vertrag (mit Firestream abgestimmt, Haven-Seite: Sitzung „Haven: Bücher vom Handy“):
//   GET {haven-adresse}/api/m4rgin/markt?isbn=…&titel=…&autor=…
//   Authorization: Bearer {Geräte-Schlüssel}   (derselbe wie für /api/m4rgin/eingang)
//   200 {data: MarktAntwort}  = Pegel /v1/markt unverändert (Pegel/src/markt.ts)
//   401 Schlüssel unbekannt · 404 Empfang aus · 429 zu viele Anfragen · 503 keine Quelle in Pegel · 502 Pegel-Fehler
//
// Pegel rechnet mit demselben m4rgin-Code (marktAbfragen: parallel, Entdoppeln, Prüfung, keine ISBN-10-Runde für
// eurobuch; clientip setzt Haven). Hier wird die Antwort auf MarktErgebnis abgebildet; m4rgin prüft die Angebote
// danach noch einmal mit seinem eigenen Kontext (Einband, ignorierte Händler), die Preisrechnung bleibt gleich.

import { Angebot, MarktErgebnis, marktlage, QuellenId, QuellenStatus } from './markt';
import { pruefeAngebote, PruefKontext } from './pruefung';
import { havenBereit, HavenZugang } from './haven';

/** So, wie Pegel /v1/markt antwortet (Pegel/src/markt.ts, MarktAntwort) – nur was m4rgin braucht */
export interface PegelMarkt {
  angebote: (Omit<Angebot, 'gebunden'> & { einband?: 'tb' | 'hc'; verkaeufer?: 'gewerblich' | 'privat' | 'buchhandel' })[];
  aussortiert?: number;
  hinweise?: string[];
  ueberIsbn?: boolean;
  quellen?: { id: QuellenId; name?: string; eingerichtet: boolean; ok?: boolean; anzahl?: number; fehler?: string }[];
  zeit?: string;
}

export function havenMarktUrl(z: HavenZugang, a: { isbn?: string; titel?: string; autor?: string }): string {
  const p = new URLSearchParams();
  if (a.isbn) p.set('isbn', a.isbn);
  if (a.titel) p.set('titel', a.titel);
  if (a.autor) p.set('autor', a.autor);
  return `${z.adresse.trim().replace(/\/+$/, '')}/api/m4rgin/markt?${p.toString()}`;
}

/** Pegels Antwort → MarktErgebnis (wie aus marktAbfragen), mit m4rgins eigener Prüfung obendrauf. */
export function ausPegel(d: PegelMarkt, pruef: Omit<PruefKontext, 'ueberIsbn'>, ms = 0): MarktErgebnis {
  const ueberIsbn = !!d.ueberIsbn;
  const roh: Angebot[] = (d.angebote ?? [])
    .filter((a) => a && typeof a.gesamt === 'number' && a.gesamt > 0)
    .map(({ einband, verkaeufer, ...a }) => ({
      ...a,
      gebunden: einband === 'hc' ? true : einband === 'tb' ? false : undefined,
      verkaeuferTyp: a.verkaeuferTyp ?? (verkaeufer === 'privat' ? 'privat' : verkaeufer ? 'gewerblich' : undefined),
    }));
  const p = pruefeAngebote(roh, { ...pruef, ueberIsbn });
  const angebote = p.gueltig.sort((a, b) => a.gesamt - b.gesamt);
  const status: QuellenStatus[] = (d.quellen ?? [])
    .filter((q) => q.eingerichtet)
    .map((q) => ({ quelle: q.id, ok: q.ok !== false, anzahl: q.anzahl ?? 0, fehler: q.fehler, ms }));
  const hinweise = [...(d.hinweise ?? []), ...p.hinweise];
  if ((d.aussortiert ?? 0) > 0) hinweise.push(`${d.aussortiert} Angebote hat Haven schon aussortiert.`);
  return {
    angebote,
    aussortiert: p.aussortiert.sort((a, b) => a.gesamt - b.gesamt),
    hinweise,
    ueberIsbn,
    status,
    lage: marktlage(angebote),
    zeit: d.zeit ?? new Date().toISOString(),
    ueberHaven: true,
  };
}

/** Marktabfrage über Haven. Wirft verständliche Fehler (Haven nicht erreichbar, Schlüssel, zu viele Anfragen). */
export async function marktUeberHaven(
  z: HavenZugang,
  a: { isbn?: string; titel?: string; autor?: string },
  pruef: Omit<PruefKontext, 'ueberIsbn'>,
  timeoutMs = 35000, // Haven wartet höchstens 32 s auf Pegel
): Promise<MarktErgebnis> {
  if (!havenBereit(z)) throw new Error('Haven ist nicht eingerichtet (Einstellungen → Haven).');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const start = Date.now();
  try {
    const res = await fetch(havenMarktUrl(z, a), {
      headers: { Authorization: `Bearer ${z.schluessel.trim()}`, Accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (res.status === 401 || res.status === 403) throw new Error('Haven kennt diesen Geräte-Schlüssel nicht oder er wurde widerrufen (Einstellungen → Haven).');
    if (res.status === 404) throw new Error('Haven bietet für m4rgin keine Preise an (Empfang aus oder Haven zu alt).');
    if (res.status === 429) throw new Error('Zu viele Preisabfragen über Haven – in einer Minute nochmal.');
    if (res.status === 503) throw new Error('In Haven ist keine Preisquelle eingerichtet.');
    if (!res.ok) {
      const grund = await res
        .json()
        .then((j: { error?: { message?: string } }) => j?.error?.message)
        .catch(() => undefined);
      throw new Error(`Haven antwortet mit ${res.status}${grund ? `: ${grund}` : ''}.`);
    }
    // Kennt Haven die Route noch nicht, liefert es seine Webseite (HTML, Status 200) statt 404
    if (!/json/i.test(res.headers.get('content-type') ?? '')) {
      throw new Error('Haven bietet für m4rgin noch keine Preise an (Haven-Version zu alt).');
    }
    const j = (await res.json()) as { data?: PegelMarkt };
    if (!j?.data) throw new Error('Haven hat keine Marktdaten geliefert.');
    return ausPegel(j.data, pruef, Date.now() - start);
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw new Error('Haven antwortet nicht (Tailscale/WLAN prüfen).');
    if (/network request failed|fetch failed/i.test(String(e))) throw new Error('Haven nicht erreichbar (Tailscale verbunden? Adresse prüfen).');
    throw e;
  } finally {
    clearTimeout(t);
  }
}
