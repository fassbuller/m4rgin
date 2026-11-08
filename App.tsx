// Bleistift – Auspreis-Helfer für Hennwack (Prototyp). Vier Reiter, keine Navigationsbibliothek.
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './src/components/Schrift';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Einstellungen } from './src/einstellungen';
import { einstellungenLaden, LogEintrag, Stapel, stapelUebersicht } from './src/db';
import { ScanScreen } from './src/screens/ScanScreen';
import { StapelScreen } from './src/screens/StapelScreen';
import { LogScreen } from './src/screens/LogScreen';
import { EinstellungenScreen } from './src/screens/EinstellungenScreen';
import { Icon, IconName } from './src/components/Teile';
import { BEREICH, F } from './src/theme';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts, BricolageGrotesque_400Regular, BricolageGrotesque_600SemiBold, BricolageGrotesque_800ExtraBold,
} from '@expo-google-fonts/bricolage-grotesque';
import { Caveat_700Bold } from '@expo-google-fonts/caveat';

// Splash stehen lassen, bis die Hausschriften geladen sind – sonst blitzt kurz die Systemschrift auf
SplashScreen.preventAutoHideAsync().catch(() => undefined);
import { coverEinstellen } from './src/lib/cover';
import { stapelWert } from './src/lib/stapelwert';

type Reiter = 'scan' | 'stapel' | 'log' | 'einst';
const REITER: { id: Reiter; label: string; icon: IconName }[] = [
  { id: 'scan', label: 'Scannen', icon: 'barcode-scan' },
  { id: 'stapel', label: 'Stapel', icon: 'bookshelf' },
  { id: 'log', label: 'Verlauf', icon: 'chart-timeline-variant' },
  { id: 'einst', label: 'Einstellungen', icon: 'cog' },
];

export default function App() {
  return (
    <SafeAreaProvider>
      <Hauptfenster />
    </SafeAreaProvider>
  );
}

function Hauptfenster() {
  const unten = useSafeAreaInsets().bottom;
  const [reiter, setReiter] = useState<Reiter>('scan');
  const [einst, setEinst] = useState<Einstellungen | null>(null);
  const [stapel, setStapel] = useState<LogEintrag[]>([]);
  const [stapelKopf, setStapelKopf] = useState<Stapel | null>(null);
  const [schriftenDa, schriftFehler] = useFonts({
    BricolageGrotesque_400Regular,
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_800ExtraBold,
    Caveat_700Bold,
  });

  const stapelNeu = useCallback(() => {
    stapelUebersicht()
      .then((u) => {
        setStapelKopf(u.aktiv);
        setStapel(u.eintraege);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    einstellungenLaden().then(setEinst);
    stapelNeu();
  }, []);

  useEffect(() => {
    if (einst) coverEinstellen(einst.googleBooksKey);
  }, [einst?.googleBooksKey]);

  // Fehlt eine Schrift (z. B. offline beim ersten Start), lieber mit Systemschrift weiter als hängen bleiben
  const bereit = !!einst && (schriftenDa || !!schriftFehler);
  useEffect(() => {
    if (bereit) SplashScreen.hideAsync().catch(() => undefined);
  }, [bereit]);

  if (!einst || !bereit) {
    return (
      <View style={[st.wurzel, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={BEREICH.scan} size="large" />
      </View>
    );
  }

  // Gesamtwert inkl. Lager (dort vorläufig) – dieselbe Rechnung wie im Stapel-Kopf
  const summe = stapelWert(stapel).gesamt;

  return (
    <View style={st.wurzel}>
      {/* Kamera dunkel → helle Statusleiste; alle anderen Reiter haben Papier → dunkle */}
      <StatusBar style={reiter === 'scan' ? 'light' : 'dark'} />
      <View style={{ flex: 1 }}>
        {/* Scanner bleibt montiert, damit ein laufender Vorgang beim Reiterwechsel nicht verloren geht */}
        <View style={[StyleSheet.absoluteFill, reiter !== 'scan' && st.versteckt]} pointerEvents={reiter === 'scan' ? 'auto' : 'none'}>
          <ScanScreen
            aktiv={reiter === 'scan'}
            einst={einst}
            stapel={{ anzahl: stapel.length, summe, name: stapelKopf?.name }}
            onStapelGeaendert={stapelNeu}
            onZumStapel={() => setReiter('stapel')}
          />
        </View>
        {reiter === 'stapel' && <StapelScreen regeln={einst.regeln} einst={einst} onGeaendert={stapelNeu} />}
        {reiter === 'log' && <LogScreen sichtbar einst={einst} />}
        {reiter === 'einst' && <EinstellungenScreen einst={einst} onGespeichert={setEinst} />}
      </View>
      <View style={[st.leiste, { paddingBottom: Math.max(unten, 8) + 4 }]}>
        {REITER.map((r) => {
          const aktiv = reiter === r.id;
          return (
            <Pressable key={r.id} onPress={() => setReiter(r.id)} style={st.tab} accessibilityRole="tab" accessibilityState={{ selected: aktiv }}>
              <View style={[st.pille, aktiv && { borderTopColor: F.gelb }]}>
                <Icon name={r.icon} size={24} farbe={aktiv ? '#fff' : '#bdb5a6'} />
                {r.id === 'stapel' && stapel.length > 0 && (
                  <View style={st.zahl}>
                    <Text style={st.zahlText}>{stapel.length > 99 ? '99+' : stapel.length}</Text>
                  </View>
                )}
              </View>
              <Text style={[st.tabText, aktiv && st.tabTextAktiv]} numberOfLines={1}>
                {r.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// Tab-Leiste wie Fountains schwarze Seitenleiste: aktiver Reiter mit gelber Markierung, Zähler als gelbes Kästchen
const st = StyleSheet.create({
  wurzel: { flex: 1, backgroundColor: F.papier },
  versteckt: { opacity: 0, zIndex: -1 },
  leiste: { flexDirection: 'row', backgroundColor: F.tinte },
  tab: { flex: 1, alignItems: 'center', gap: 2 },
  pille: { paddingHorizontal: 18, paddingTop: 7, paddingBottom: 2, borderTopWidth: 4, borderTopColor: 'transparent' },
  tabText: { fontSize: 12, color: '#bdb5a6', fontWeight: '600' },
  tabTextAktiv: { color: '#fff', fontWeight: '800' },
  zahl: { position: 'absolute', top: 2, right: 4, minWidth: 20, height: 18, backgroundColor: F.gelb, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  zahlText: { color: F.tinte, fontSize: 11, fontWeight: '800' },
});
