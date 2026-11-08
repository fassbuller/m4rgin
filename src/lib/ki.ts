// Optionaler KI-Adapter für Titelseiten-Fotos.
// Spricht das verbreitete „OpenAI-kompatible“ Chat-Format (/chat/completions mit Bild).
// Damit funktioniert heute ein beliebiger Anbieter mit diesem Format, und später ohne Umbau
// ein lokales Modell im Laden (z. B. Ollama oder vLLM mit einem Vision-Modell wie Qwen-VL):
// dann nur Basis-URL und Modellname in den Einstellungen ändern.

import { SuchFelder } from './suche';

export interface KiEinstellungen {
  aktiv: boolean;
  basisUrl: string; // z. B. http://192.168.1.50:11434/v1  (Ollama im Laden-WLAN)
  apiKey: string; // bei lokalem Modell meist leer
  modell: string; // z. B. qwen2.5vl:7b
  /** Für Texte (Kurzbeschreibung); leer = dasselbe Modell wie für Titelseiten */
  textModell: string; // z. B. gemma3:12b
}

export const STANDARD_KI: KiEinstellungen = {
  aktiv: false,
  basisUrl: '',
  apiKey: '',
  modell: '',
  // Schreibt im Test die besten deutschen Kurzbeschreibungen der lokalen Modelle; greift nur, wenn eine Basis-URL eingetragen ist
  textModell: 'gemma3:12b',
};

const PROMPT = `Du siehst das Foto einer Titelseite oder eines Covers eines Buches (oft antiquarisch, evtl. Frakturschrift).
Antworte NUR mit einem JSON-Objekt ohne weiteren Text:
{"autor": "...", "titel": "...", "verlag": "...", "ort": "...", "jahr": "....", "auflage": "...", "isbn": "..."}
Felder, die du nicht sicher erkennst, lässt du als leeren String. Erfinde nichts.`;

export interface KiAntwort extends SuchFelder {
  ort?: string;
  auflage?: string;
  isbn?: string;
}

export function parseKiAntwort(inhalt: string): KiAntwort {
  const json = inhalt.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error('KI hat kein JSON geliefert');
  const o = JSON.parse(json) as Record<string, unknown>;
  const s = (k: string) => (typeof o[k] === 'string' && (o[k] as string).trim()) || undefined;
  return {
    autor: s('autor'),
    titel: s('titel'),
    verlag: s('verlag'),
    ort: s('ort'),
    jahr: s('jahr')?.match(/\d{4}/)?.[0],
    auflage: s('auflage'),
    isbn: s('isbn'),
  };
}

export async function kiTitelseite(bildBase64: string, k: KiEinstellungen): Promise<KiAntwort> {
  if (!k.basisUrl || !k.modell) throw new Error('KI ist nicht eingerichtet (Einstellungen)');
  const res = await fetch(`${k.basisUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(k.apiKey ? { Authorization: `Bearer ${k.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: k.modell,
      temperature: 0,
      // Antwort ist nur ein kleines JSON – begrenzt die Wartezeit, gerade bei lokalen Modellen.
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${bildBase64}` } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`KI antwortet mit ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const inhalt: string = data?.choices?.[0]?.message?.content ?? '';
  return parseKiAntwort(inhalt);
}
