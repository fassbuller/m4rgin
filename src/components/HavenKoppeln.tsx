// „Mit Haven koppeln“: Kamera auf den QR-Code richten, den Haven unter Handy-Symbol → „Handy koppeln“ zeigt.
// m4rgin tauscht den Code gegen einen eigenen Geräte-Schlüssel (src/lib/kopplung.ts) und gibt Adresse +
// Schlüssel zurück – speichern macht der Aufrufer (Einstellungen).
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Schrift';
import { Knopf } from './Teile';
import { ABSTAND, F } from '../theme';
import { Gekoppelt, koppeln, kopplungAusQr } from '../lib/kopplung';

/** Gerätename für Haven: Android-Modell bzw. „iPhone (iOS 18.1)“ – nur eine Beschriftung, höchstens 60 Zeichen. */
function geraeteName(): string {
  const c = (Platform.constants ?? {}) as { Model?: string; Manufacturer?: string; interfaceIdiom?: string };
  if (Platform.OS === 'android') return [c.Manufacturer, c.Model].filter(Boolean).join(' ').slice(0, 60) || 'Android';
  const art = c.interfaceIdiom === 'pad' ? 'iPad' : 'iPhone';
  return `${art} (iOS ${String(Platform.Version)})`.slice(0, 60);
}

export function HavenKoppeln({ sichtbar, onFertig, onAbbrechen }: { sichtbar: boolean; onFertig: (g: Gekoppelt) => void; onAbbrechen: () => void }) {
  const rand = useSafeAreaInsets();
  const [erlaubnis, anfragen] = useCameraPermissions();
  const [status, setStatus] = useState<{ art: 'suche' | 'laeuft' | 'fehler'; text: string }>({ art: 'suche', text: 'QR-Code aus Haven in den Rahmen halten.' });
  const beschaeftigt = useRef(false);

  const erkannt = async ({ data }: { data: string }) => {
    if (beschaeftigt.current) return;
    const k = kopplungAusQr(data);
    if (!k) {
      setStatus({ art: 'fehler', text: 'Das ist kein Kopplungs-Code aus Haven. In Haven: Handy-Symbol → „Handy koppeln“.' });
      return;
    }
    beschaeftigt.current = true;
    setStatus({ art: 'laeuft', text: `Kopple mit ${k.adresse} …` });
    try {
      const g = await koppeln(k, geraeteName());
      onFertig(g);
    } catch (e) {
      setStatus({ art: 'fehler', text: String((e as Error)?.message ?? e) });
    } finally {
      // Kurz warten, damit derselbe (ggf. schon benutzte) Code nicht sofort noch einmal gelesen wird
      setTimeout(() => (beschaeftigt.current = false), 2500);
    }
  };

  return (
    <Modal visible={sichtbar} animationType="slide" onRequestClose={onAbbrechen}>
      <View style={[st.wurzel, { paddingTop: rand.top + ABSTAND, paddingBottom: rand.bottom + ABSTAND }]}>
        <Text style={st.titel}>Mit Haven koppeln</Text>
        <Text style={st.text}>In Haven oben auf das Handy-Symbol → „Handy koppeln“. Der QR-Code gilt 10 Minuten und nur einmal.</Text>
        {erlaubnis?.granted ? (
          <View style={st.kameraRahmen}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={status.art === 'laeuft' ? undefined : erkannt}
            />
            <View pointerEvents="none" style={st.zielRahmen} />
          </View>
        ) : (
          <View style={[st.kameraRahmen, st.ohneKamera]}>
            <Text style={st.text}>m4rgin braucht die Kamera, um den QR-Code zu lesen.</Text>
            <Knopf label="Kamera erlauben" icon="camera" farbe={F.tinte} onPress={() => anfragen()} stil={{ marginTop: 12 }} />
          </View>
        )}
        <View style={st.status}>
          {status.art === 'laeuft' && <ActivityIndicator color={F.tinte} />}
          <Text style={[st.text, { color: status.art === 'fehler' ? F.rot : F.tinte, flex: 1 }]}>{status.text}</Text>
        </View>
        <Knopf label="Abbrechen" icon="close" leise farbe={F.tinte} onPress={onAbbrechen} />
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  wurzel: { flex: 1, backgroundColor: F.papier, paddingHorizontal: ABSTAND, gap: 12 },
  titel: { fontSize: 24, fontWeight: '800', color: F.tinte },
  text: { fontSize: 15, color: F.tinte, lineHeight: 21 },
  kameraRahmen: { flex: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  ohneKamera: { backgroundColor: F.karte, padding: ABSTAND },
  zielRahmen: { width: 220, height: 220, borderWidth: 3, borderColor: '#fff', borderRadius: 18 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
});
