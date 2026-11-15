// Handy mit Haven koppeln per QR-Code (Haven-Vertrag „Koppeln per QR-Code“, 15.11.2026; „alle dürfen koppeln“).
// In Haven: Handy-Symbol → „Handy koppeln“ zeigt einen QR-Code (10 Minuten gültig, nur einmal). m4rgin scannt
// ihn, tauscht den Code gegen einen eigenen Geräte-Schlüssel und speichert Adresse + Schlüssel. Danach läuft alles
// wie bisher mit Bearer (An Haven, Preise über Haven).
//
//   QR-Inhalt:  {"typ":"haven-kopplung","v":1,"adresse":"http://100.73.19.78:5002","code":"<43 Zeichen>"}
//   POST {adresse}/api/m4rgin/koppeln   (ohne Authorization)   Body {"code","geraet"}
//   201 {data:{schluessel:"m4g_…", name, adresse}} · 401 Code unbekannt/benutzt/abgelaufen · 404 Zugang aus
//   413 zu groß · 429 zu viele Versuche

export interface KopplungsCode {
  adresse: string;
  code: string;
}

export interface Gekoppelt {
  adresse: string;
  schluessel: string;
  /** Name, unter dem Haven das Gerät führt, z. B. „Pixel 8 (gekoppelt von Anna)“ */
  name?: string;
}

/** QR-Text prüfen: nur {"typ":"haven-kopplung","v":1,…} mit http(s)-Adresse und Code. Sonst null. */
export function kopplungAusQr(text: string): KopplungsCode | null {
  let j: unknown;
  try {
    j = JSON.parse(text);
  } catch {
    return null;
  }
  const o = j as { typ?: unknown; v?: unknown; adresse?: unknown; code?: unknown };
  if (o?.typ !== 'haven-kopplung' || o.v !== 1) return null;
  if (typeof o.adresse !== 'string' || !/^https?:\/\/[^\s/]+/i.test(o.adresse.trim())) return null;
  if (typeof o.code !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(o.code)) return null;
  return { adresse: o.adresse.trim().replace(/\/+$/, ''), code: o.code };
}

/** Code bei Haven gegen einen Geräte-Schlüssel tauschen. Wirft verständliche Fehler. */
export async function koppeln(k: KopplungsCode, geraet: string, timeoutMs = 15000): Promise<Gekoppelt> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${k.adresse}/api/m4rgin/koppeln`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ code: k.code, geraet: geraet.slice(0, 60) }),
      signal: ctrl.signal,
    });
    if (res.status === 401) throw new Error('Der QR-Code ist abgelaufen oder schon benutzt – bitte in Haven einen neuen QR-Code zeigen.');
    if (res.status === 404) throw new Error('In diesem Haven ist der m4rgin-Zugang ausgeschaltet.');
    if (res.status === 429) throw new Error('Zu viele Kopplungsversuche – in einer Minute nochmal.');
    if (res.status === 413) throw new Error('Haven lehnt ab: Anfrage zu groß.');
    if (!res.ok) throw new Error(`Haven antwortet mit ${res.status}.`);
    if (!/json/i.test(res.headers.get('content-type') ?? '')) throw new Error('Haven kann noch nicht koppeln (Haven-Version zu alt).');
    const j = (await res.json()) as { data?: { schluessel?: string; name?: string; adresse?: string } };
    const schluessel = j?.data?.schluessel;
    if (!schluessel) throw new Error('Haven hat keinen Geräte-Schlüssel geschickt.');
    const adresse = (j.data?.adresse && /^https?:\/\//i.test(j.data.adresse) ? j.data.adresse : k.adresse).replace(/\/+$/, '');
    return { adresse, schluessel, name: j.data?.name };
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw new Error('Haven antwortet nicht (Tailscale/WLAN prüfen).');
    if (/network request failed|fetch failed/i.test(String(e))) throw new Error('Haven nicht erreichbar (Tailscale verbunden? Adresse im QR-Code prüfen).');
    throw e;
  } finally {
    clearTimeout(t);
  }
}
