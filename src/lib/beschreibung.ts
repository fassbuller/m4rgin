// KI-Kurzbeschreibung für die Einzelbuch-Ansicht: Worum geht's, wie ordnet sich das Werk ein?
// Damit das Modell wenig erfindet, bekommt es die DNB-Daten und – falls vorhanden – die Wikipedia-Einleitung
// zu Werk und Person mit. Spricht dasselbe OpenAI-kompatible Format wie ki.ts (z. B. Ollama unter …/v1).

import { KiEinstellungen } from './ki';
import { Titel } from './titel';
import { findeWikiArtikel, WikiArtikel, wikiZusammenfassung } from './wiki';

export interface Beschreibung {
  text: string;
  quellen: { name: string; url?: string }[];
}

const kuerze = (s: string | undefined, max: number) =>
  !s ? undefined : s.length <= max ? s : `${s.slice(0, s.lastIndexOf(' ', max))} …`;

export function beschreibungsPrompt(t: Titel, werk?: WikiArtikel | null, person?: WikiArtikel | null): string {
  const daten = [
    `Titel: ${t.titel}`,
    t.autoren.length ? `Autor:in: ${t.autoren.join('; ')}` : null,
    t.verlag ? `Verlag: ${[t.verlag, t.ort].filter(Boolean).join(', ')}` : null,
    t.jahr ? `Erscheinungsjahr dieser Ausgabe: ${t.jahr}` : null,
    t.einband ? `Einband: ${t.einband}` : null,
    t.sachgruppen?.length ? `Sachgruppen (DNB): ${t.sachgruppen.join('; ')}` : null,
  ].filter(Boolean);
  const wissen = [
    werk?.auszug ? `Wikipedia zum Werk „${werk.titel}“: ${kuerze(werk.auszug, 1200)}` : null,
    person?.auszug ? `Wikipedia zur Person „${person.titel}“: ${kuerze(person.auszug, 800)}` : null,
  ].filter(Boolean);
  return `Du hilfst Mitarbeitenden eines Antiquariats, ein Buch schnell einzuordnen.
Schreibe auf Deutsch 3 bis 5 kurze Sätze, sachlich, ohne Werbesprache und ohne Überschrift:
1. Worum es in dem Buch geht (Gattung, Thema, Inhalt in einem Satz).
2. Wie es sich einordnet: Epoche/Strömung, Stellung im Werk der Person, verwandte bekannte Werke.
3. Nur wenn die Angaben es klar zeigen: Was diese Ausgabe besonders macht – z. B. Erscheinungsjahr nahe an der Erstveröffentlichung,
   alte Ausgabe (vor etwa 1950) oder Sekundärliteratur über ein anderes Werk. Eine heutige Leseausgabe ist nichts Besonderes – dann Punkt 3 weglassen.
Lass Punkte weg, zu denen es nichts Sinnvolles zu sagen gibt – keine Füllsätze.
Stütze dich auf die Angaben unten. Was du nicht sicher weißt, lässt du weg – erfinde keine Fakten, Jahreszahlen oder Preise.
Wenn du das Buch nicht kennst und die Angaben nicht reichen, schreibe nur, was sich aus Titel und Sachgruppe ableiten lässt, und sage das.

${daten.join('\n')}
${wissen.length ? `\n${wissen.join('\n\n')}` : ''}`;
}

/** Thinking-Modelle (qwen3, deepseek-r1) schreiben ihre Überlegungen in <think>…</think> – die gehören nicht in die Anzeige. */
export function bereinigeAntwort(s: string): string {
  return s.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^\s+|\s+$/g, '');
}

export async function kiBeschreibung(t: Titel, k: KiEinstellungen): Promise<Beschreibung> {
  const modell = k.textModell || k.modell;
  if (!k.basisUrl || !modell) throw new Error('KI ist nicht eingerichtet (Einstellungen → KI: Basis-URL und Modell)');

  // Wikipedia ist Beiwerk: Fehlt es oder ist es offline, schreibt die KI trotzdem – nur vorsichtiger.
  let werk: WikiArtikel | null = null;
  let person: WikiArtikel | null = null;
  try {
    const gefunden = await findeWikiArtikel(t.titel, t.autoren[0]);
    if (gefunden?.art === 'werk') {
      werk = gefunden;
      const name = gefunden.beschreibung?.match(/\bvon (.+?)(?:\s*\(|$)/)?.[1];
      const z = name ? await wikiZusammenfassung(name) : null;
      if (z) person = { titel: name!, art: 'person', ...z };
    } else person = gefunden;
  } catch {
    // ohne Wikipedia weiter
  }

  const res = await fetch(`${k.basisUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(k.apiKey ? { Authorization: `Bearer ${k.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: modell,
      temperature: 0.3,
      max_tokens: 400,
      messages: [{ role: 'user', content: beschreibungsPrompt(t, werk, person) }],
    }),
  });
  if (!res.ok) throw new Error(`KI antwortet mit ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = bereinigeAntwort(data?.choices?.[0]?.message?.content ?? '');
  if (!text) throw new Error('KI hat keinen Text geliefert');
  return {
    text,
    quellen: [
      { name: `KI (${modell})` },
      ...(werk ? [{ name: `Wikipedia: ${werk.titel}`, url: werk.url }] : []),
      ...(person ? [{ name: `Wikipedia: ${person.titel}`, url: person.url }] : []),
    ],
  };
}
