// Welcher Stand läuft gerade? scripts/expo-update.ps1 setzt beim Veröffentlichen EXPO_PUBLIC_STAND
// (Commit + Uhrzeit); Metro schreibt den Wert fest ins Bundle. Ohne Wert läuft die App live vom PC.

declare const process: { env: Record<string, string | undefined> };

export const APP_VERSION = '0.1.0';
export const STAND: string = process.env.EXPO_PUBLIC_STAND ?? 'Entwicklung (live vom PC)';
export const VERSION_TEXT = `m4rgin ${APP_VERSION} · Stand ${STAND}`;
