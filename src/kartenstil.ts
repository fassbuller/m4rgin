// Kartenstil: wie die Seltenheits-Karten aussehen. Zwei Farbwelten zur Wahl (Einstellungen → Seltenheit & Glitzer):
//   „FIFA Ultimate“: Metalle Bronze · Silber · Gold · Schwarz (mit Holo-Regenbogen)
//   „Magic“:         Seltenheits-Farben wie bei Sammelkarten: Common (schwarz) · Uncommon (silber) ·
//                    Rare (gold) · Mythic (orange-rot, mit Holo)
// Der Stil gilt app-weit. App.tsx setzt ihn aus den Einstellungen; Komponenten lesen ihn per Hook
// (oder über STUFE_FARBE, das immer die Farben des aktuellen Stils liefert).
import { useSyncExternalStore } from 'react';
import type { Stufe } from './lib/seltenheit';

export type Kartenstil = 'ultimate' | 'magic';
export const KARTENSTILE: Kartenstil[] = ['ultimate', 'magic'];
export const KARTENSTIL_LABEL: Record<Kartenstil, string> = {
  ultimate: 'FIFA Ultimate',
  magic: 'Magic',
};

/** Name jeder Stufe auf der Karte und bei „Karten ausprobieren“ */
export const STUFE_NAME: Record<Kartenstil, Record<Stufe, { karte: string; kurz: string }>> = {
  ultimate: {
    gewoehnlich: { karte: 'BRONZE', kurz: 'Bronze' },
    gefragt: { karte: 'GEFRAGT', kurz: 'Silber' },
    selten: { karte: '✦ SELTEN', kurz: 'Gold' },
    raritaet: { karte: '✦✦ RARITÄT', kurz: 'Schwarz' },
  },
  magic: {
    gewoehnlich: { karte: 'COMMON', kurz: 'Common' },
    gefragt: { karte: 'UNCOMMON', kurz: 'Uncommon' },
    selten: { karte: '✦ RARE', kurz: 'Rare' },
    raritaet: { karte: '✦✦ MYTHIC', kurz: 'Mythic' },
  },
};

let aktuell: Kartenstil = 'ultimate';
const hoerer = new Set<() => void>();

export function kartenstil(): Kartenstil {
  return aktuell;
}

export function setzeKartenstil(s: Kartenstil | undefined) {
  const neu: Kartenstil = s === 'magic' ? 'magic' : 'ultimate';
  if (neu === aktuell) return;
  aktuell = neu;
  hoerer.forEach((h) => h());
}

/** Aktueller Stil; die Komponente zeichnet sich bei einem Wechsel neu. */
export function useKartenstil(): Kartenstil {
  return useSyncExternalStore(
    (h) => {
      hoerer.add(h);
      return () => hoerer.delete(h);
    },
    () => aktuell,
  );
}
