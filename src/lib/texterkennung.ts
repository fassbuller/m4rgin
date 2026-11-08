// Texterkennung (ML Kit) für Titelseiten-Fotos. In Expo Go (z. B. zum Ausprobieren auf dem iPhone)
// fehlt das native Modul – dann gibt es keine Erkennung, die App läuft aber weiter (Suche, Barcode, KI).

import { isRunningInExpoGo } from 'expo';

export interface TextErgebnis {
  text: string;
  blocks: { lines: { text: string; frame?: { height: number; top: number } }[] }[];
}

export const texterkennungVerfuegbar = !isRunningInExpoGo();

export async function texterkennen(uri: string): Promise<TextErgebnis | null> {
  if (!texterkennungVerfuegbar) return null;
  // Erst hier laden: Schon das Importieren würde in Expo Go am fehlenden nativen Modul scheitern.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const TextRecognition = require('@react-native-ml-kit/text-recognition').default;
  return TextRecognition.recognize(uri);
}
