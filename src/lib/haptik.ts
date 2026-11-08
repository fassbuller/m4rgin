// Spürbare Rückmeldung beim Scannen. Android spielt Vibrationsmuster ab; iOS ignoriert Muster
// (nur ein fester Brummer) – dort gibt es stattdessen Taptic-Engine-Klopfer in passender Zahl.

import { Platform, Vibration } from 'react-native';
import * as Haptics from 'expo-haptics';

export type Rueckmeldung = 'scan' | 'selten' | 'raritaet';

const MUSTER: Record<Rueckmeldung, number | number[]> = {
  scan: 40,
  selten: [0, 300, 120, 300],
  raritaet: [0, 400, 150, 400, 150, 400],
};

const KLOPFER: Record<Rueckmeldung, number> = { scan: 1, selten: 2, raritaet: 3 };

export function rueckmeldung(art: Rueckmeldung): void {
  if (Platform.OS !== 'ios') {
    Vibration.vibrate(MUSTER[art]);
    return;
  }
  if (art === 'scan') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    return;
  }
  // Selten: zwei kräftige Klopfer, Rarität: Erfolgs-Signal und drei Klopfer
  if (art === 'raritaet') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  for (let i = 0; i < KLOPFER[art]; i++) {
    setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined), 250 + i * 220);
  }
}
