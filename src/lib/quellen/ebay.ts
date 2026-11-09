// eBay Browse API (Angebotspreise inkl. Versand). Kostenloser Entwicklerzugang:
// https://developer.ebay.com → App anlegen → Client-ID + Client-Secret (Production).
// Ablauf: App-Token per Client-Credentials holen, dann item_summary/search mit gtin=ISBN.
// ⚠ Feldnamen nach eBay-Doku/Erfahrung, Live-Test steht aus.
// ⚠ Sicherheit: Das Secret liegt im Prototyp auf dem Handy. Später in einen Dienst im Laden verlagern.

import { Angebot, PreisQuelle, runde2 } from '../markt';

export interface EbayZugang {
  aktiv: boolean;
  clientId: string;
  clientSecret: string;
}

let token: { wert: string; bis: number; fuer: string } | null = null;

/** eBay liefert bei Fehlern JSON mit error_description bzw. errors[].message – das zeigen wir mit an. */
async function fehlerText(res: Response): Promise<string> {
  try {
    const t = await res.text();
    try {
      const j = JSON.parse(t);
      const m = j.error_description ?? j.errors?.[0]?.longMessage ?? j.errors?.[0]?.message ?? j.error;
      if (m) return String(m);
    } catch {}
    return t.slice(0, 200);
  } catch {
    return '';
  }
}

export async function appToken(z: EbayZugang): Promise<string> {
  const fuer = `${z.clientId}:${z.clientSecret}`;
  if (token && token.fuer === fuer && token.bis > Date.now() + 60_000) return token.wert;
  const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${z.clientId}:${z.clientSecret}`)}`,
    },
    body: 'grant_type=client_credentials&scope=' + encodeURIComponent('https://api.ebay.com/oauth/api_scope'),
  });
  if (!res.ok) {
    const grund = await fehlerText(res);
    const tipp =
      res.status === 401
        ? ' – Client-ID/Secret prüfen: Production-Keyset (nicht Sandbox), App ID + Cert ID, Keyset freigeschaltet (Löschbenachrichtigung erledigt)?'
        : '';
    throw new Error(`eBay-Anmeldung fehlgeschlagen (${res.status}${grund ? `: ${grund}` : ''})${tipp}`);
  }
  const j = await res.json();
  token = { wert: j.access_token, bis: Date.now() + (j.expires_in ?? 7200) * 1000, fuer };
  return token.wert;
}

interface EbayItem {
  title?: string;
  price?: { value?: string; currency?: string };
  shippingOptions?: { shippingCost?: { value?: string; currency?: string } }[];
  itemWebUrl?: string;
  condition?: string;
  seller?: { username?: string };
  itemLocation?: { country?: string };
}

export function parseEbay(json: { itemSummaries?: EbayItem[] }, versandPauschale: number): Angebot[] {
  const out: Angebot[] = [];
  for (const i of json.itemSummaries ?? []) {
    if (i.price?.currency !== 'EUR') continue;
    const preis = Number(i.price.value);
    if (!(preis > 0)) continue;
    const v = i.shippingOptions?.[0]?.shippingCost;
    const versandEcht = v?.currency === 'EUR' && v.value != null ? Number(v.value) : null;
    const versand = versandEcht ?? versandPauschale;
    out.push({
      quelle: 'ebay',
      plattform: 'eBay',
      haendler: i.seller?.username,
      preis,
      versand,
      versandGeschaetzt: versandEcht == null,
      gesamt: runde2(preis + versand),
      zustandText: i.condition,
      land: i.itemLocation?.country,
      url: i.itemWebUrl,
      titel: i.title,
    });
  }
  return out;
}

export function ebayQuelle(z: EbayZugang, versandPauschale: number): PreisQuelle {
  return {
    id: 'ebay',
    aktiv: z.aktiv && !!z.clientId && !!z.clientSecret,
    async suche(a) {
      const p = new URLSearchParams({ limit: '50', sort: 'price' });
      if (a.isbn) p.set('gtin', a.isbn);
      else {
        p.set('q', [a.autor, a.titel].filter(Boolean).join(' '));
        p.set('category_ids', '267'); // Bücher – ⚠ Kategorie-ID für EBAY_DE prüfen
      }
      const res = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?${p}`, {
        headers: {
          Authorization: `Bearer ${await appToken(z)}`,
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_DE',
          'X-EBAY-C-ENDUSERCTX': 'contextualLocation=country%3DDE%2Czip%3D12163',
        },
      });
      if (!res.ok) {
        const grund = await fehlerText(res);
        throw new Error(`eBay antwortet mit ${res.status}${grund ? `: ${grund}` : ''}`);
      }
      return parseEbay(await res.json(), versandPauschale);
    },
  };
}
