// Wikipedia-Artikel zu einem Buch finden – erst das Werk, sonst die Person.
// Stolpersteine aus der DNB: Untertitel („…: Erster und Zweiter Teil“), Umschrift statt
// eingedeutschtem Namen („Dostoevskij, Fëdor Michajlovič“ ↔ „Dostojewski“), teils zerlegte Umlaute.

// Wikimedia drosselt Anfragen mit allgemeinem User-Agent (okhttp, node) schnell auf 429 –
// ein eigener, sprechender User-Agent ist laut deren Regeln Pflicht und hebt das auf.
const NAME = 'Bleistift/0.1 (Auspreis-App, Hennwack Buchgenossenschaft eG)';
export const UA = { 'User-Agent': NAME, 'Api-User-Agent': NAME };
const API = 'https://de.wikipedia.org/w/api.php';

/** Einmal kurz nachfassen, wenn Wikipedia trotzdem bremst. */
export async function wikiFetch(url: string): Promise<Response> {
  const res = await fetch(url, { headers: UA });
  if (res.status !== 429) return res;
  const warte = Math.min(Number(res.headers.get('retry-after')) || 1, 3);
  await new Promise((r) => setTimeout(r, warte * 1000));
  return fetch(url, { headers: UA });
}

/** Vergleichsform: ohne Akzente, Satzzeichen und Groß/klein. */
export function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** „Aufzeichnungen aus dem Kellerloch: Neu übersetzte Ausgabe“ → „Aufzeichnungen aus dem Kellerloch“ */
export function kernTitel(titel: string): string {
  return titel.normalize('NFC').split(/\s*[:;/]\s*|\s+[-–—]\s+|\s*\.\s+(?=[A-ZÄÖÜ])/)[0].trim();
}

/** „Dostoevskij, Fëdor Michajlovič“ → „Fedor Michajlovic Dostoevskij“ (Suchform) und Namensanfang zum Wiedererkennen. */
export function autorTeile(autor?: string): { suche: string; stamm: string } | null {
  if (!autor?.trim()) return null;
  const [nach, vor] = autor.split(',').map((x) => x.trim());
  const n = norm(nach);
  // Die ersten vier Buchstaben überstehen die meisten Umschriften (dostoevskij/dostojewski, tolstoj/tolstoi)
  return { suche: norm([vor, nach].filter(Boolean).join(' ')), stamm: n.replace(/\s/g, '').slice(0, 4) };
}

/** „Faust (Goethe)“ → „faust“ */
const ohneKlammer = (t: string) => norm(t.replace(/\s*\([^)]*\)\s*$/, ''));

export interface WikiArtikel {
  titel: string;
  art: 'werk' | 'person';
  beschreibung?: string; // Kurzbeschreibung von Wikidata, z. B. „Buch von Fjodor Michailowitsch Dostojewski“
  auszug?: string; // Einleitung des Artikels
  url: string;
}

async function suche(text: string, anzahl: number): Promise<string[]> {
  const p = new URLSearchParams({ action: 'query', list: 'search', srsearch: text, srlimit: String(anzahl), format: 'json', origin: '*' });
  const res = await wikiFetch(`${API}?${p}`);
  if (!res.ok) throw new Error(`Wikipedia antwortet mit ${res.status}`);
  const j = await res.json();
  return (j?.query?.search ?? []).map((x: { title: string }) => x.title);
}

export async function wikiZusammenfassung(titel: string): Promise<{ beschreibung?: string; auszug?: string; url: string } | null> {
  const res = await wikiFetch(`https://de.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(titel.replace(/ /g, '_'))}`);
  if (!res.ok) return null;
  const j = await res.json();
  if (j?.type === 'disambiguation') return null;
  return {
    beschreibung: j?.description,
    auszug: j?.extract,
    url: j?.content_urls?.desktop?.page ?? `https://de.wikipedia.org/wiki/${encodeURIComponent(titel.replace(/ /g, '_'))}`,
  };
}

/**
 * Aus Suchtreffern die Werk-Kandidaten, beste zuerst: voller Titel („Faust. Eine Tragödie“),
 * Kerntitel mit passendem Klammerzusatz („Homo faber (Roman)“), Kerntitel pur, sonst Titel, die mit dem Kern beginnen.
 */
export function werkKandidaten(treffer: string[], werk: string, stamm?: string): string[] {
  const k = norm(kernTitel(werk));
  const voll = norm(werk);
  const punkte = (t: string) => {
    if (norm(t) === voll) return 5;
    const kl = norm(t.match(/\(([^)]*)\)\s*$/)?.[1] ?? '');
    if (ohneKlammer(t) === k) {
      if (stamm && kl.replace(/\s/g, '').startsWith(stamm)) return 4;
      if (/roman|novelle|erzahlung|buch|drama|gedicht|literatur|werk/.test(kl)) return 3;
      return kl ? 1 : 2; // Filme, Opern … nach hinten
    }
    return norm(t).startsWith(`${k} `) ? 0.5 : 0;
  };
  return treffer
    .map((t) => [t, punkte(t)] as const)
    .filter(([, p]) => p > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t);
}

const passtZuAutor = (text: string | undefined, stamm?: string) =>
  !stamm || norm(text ?? '').split(' ').some((w) => w.startsWith(stamm));

/**
 * Nennt der Artikel die Person als Urheber:in? Die Wikidata-Kurzbeschreibung („Oper von Charles Gounod“)
 * ist dafür genauer als der Text – der erwähnt bei einer Faust-Oper natürlich auch Goethe.
 */
const werkVonAutor = (z: { beschreibung?: string; auszug?: string }, stamm?: string) =>
  passtZuAutor(z.beschreibung ?? z.auszug?.slice(0, 200), stamm);

/**
 * Werk-Artikel, sonst Personen-Artikel, sonst null.
 * Wirft nur, wenn Wikipedia nicht erreichbar ist – damit „nicht gefunden“ und „offline“ unterscheidbar bleiben.
 */
export async function findeWikiArtikel(werk: string, autor?: string): Promise<WikiArtikel | null> {
  const kern = kernTitel(werk);
  const a = autorTeile(autor);
  if (kern.length >= 3) {
    for (const t of werkKandidaten(await suche(`intitle:${kern}`, 10), werk, a?.stamm).slice(0, 3)) {
      const z = await wikiZusammenfassung(t);
      // Gleicher Titel, aber anderes Buch? Der Artikel muss die Person nennen.
      if (z && werkVonAutor(z, a?.stamm)) return { titel: t, art: 'werk', ...z };
    }
  }
  if (a) {
    for (const t of (await suche(a.suche, 3)).slice(0, 2)) {
      // Der Nachname steht bei Personenartikeln am Ende („Fjodor Michailowitsch Dostojewski“), nicht vorn („Pfad der Erinnerung“)
      if (!ohneKlammer(t).split(' ').pop()?.startsWith(a.stamm)) continue;
      const z = await wikiZusammenfassung(t);
      if (z) return { titel: t, art: 'person', ...z };
    }
  }
  return null;
}
