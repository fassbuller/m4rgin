// m4rgin – Auspreis-Helfer für Hennwack (Prototyp). Vier Reiter, keine Navigationsbibliothek.
// Auf Tablets (≥ 760 pt breit) „Thekenmodus“: Scanner und Stapel nebeneinander, Querformat erlaubt.
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Text } from './src/components/Schrift';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Einstellungen, mitStandards } from './src/einstellungen';
import { Fangnetz } from './src/components/Fangnetz';
import { fehlerText } from './src/lib/fehler';
import { setzeKartenstil, useKartenstil } from './src/kartenstil';
import { einstellungenLaden, LogEintrag, merkerLaden, merkerSpeichern, Stapel, stapelUebersicht } from './src/db';
import { Einfuehrung } from './src/components/Einfuehrung';
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

/** Tablet = kürzere Bildschirmseite ≥ 600 pt. Handys bleiben im Hochformat, Tablets drehen frei. */
const IST_TABLET = Math.min(Dimensions.get('screen').width, Dimensions.get('screen').height) >= 600;
const THEKE_AB = 760;
const REITER: { id: Reiter; label: string; icon: IconName }[] = [
  { id: 'scan', label: 'Scannen', icon: 'barcode-scan' },
  { id: 'stapel', label: 'Stapel', icon: 'bookshelf' },
  { id: 'log', label: 'Verlauf', icon: 'chart-timeline-variant' },
  { id: 'einst', label: 'Einstellungen', icon: 'cog' },
];

export default function App() {
  return (
    <SafeAreaProvider>
      <Fangnetz>
        <Hauptfenster />
      </Fangnetz>
    </SafeAreaProvider>
  );
}

function Hauptfenster() {
  const unten = useSafeAreaInsets().bottom;
  const [reiter, setReiter] = useState<Reiter>('scan');
  const [einst, setEinst] = useState<Einstellungen | null>(null);
  const [stapel, setStapel] = useState<LogEintrag[]>([]);
  const [stapelKopf, setStapelKopf] = useState<Stapel | null>(null);
  const [startHinweis, setStartHinweis] = useState<string | null>(null);
  const [einfuehrung, setEinfuehrung] = useState(false);
  const [stapelVersion, setStapelVersion] = useState(0);
  const { width } = useWindowDimensions();
  const theke = width >= THEKE_AB;
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
        setStapelVersion((v) => v + 1);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    // Handys im Hochformat halten; auf Tablets darf gedreht werden (Thekenmodus im Querformat)
    if (!IST_TABLET) ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
    // Erste Schritte nur beim allerersten Start
    merkerLaden('einfuehrung')
      .then((v) => !v && setEinfuehrung(true))
      .catch(() => undefined);
  }, []);

  // Im Thekenmodus steckt der Stapel im Scanner-Reiter
  useEffect(() => {
    if (theke && reiter === 'stapel') setReiter('scan');
  }, [theke, reiter]);

  const einfuehrungFertig = () => {
    setEinfuehrung(false);
    merkerSpeichern('einfuehrung', '1').catch(() => undefined);
  };

  useEffect(() => {
    // Kein Endlos-Spinner: Lassen sich die Einstellungen nicht laden, mit Standardwerten starten und es sagen
    einstellungenLaden()
      .then(setEinst)
      .catch((e) => {
        setEinst(mitStandards(null));
        setStartHinweis(`${fehlerText(e, 'Das Laden der Einstellungen')} Es gelten vorerst die Standardwerte.`);
      });
    stapelNeu();
  }, []);

  // Kartenstil (FIFA Ultimate / Magic) app-weit setzen; useKartenstil() zeichnet die Karten dann neu
  useEffect(() => {
    if (einst) setzeKartenstil(einst.seltenheit.kartenstil);
  }, [einst?.seltenheit.kartenstil]);
  useKartenstil();

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

  const reiterListe = theke ? REITER.filter((r) => r.id !== 'stapel') : REITER;

  return (
    <View style={st.wurzel}>
      {/* Kamera dunkel → helle Statusleiste; alle anderen Reiter haben Papier → dunkle */}
      <StatusBar style={reiter === 'scan' && !theke ? 'light' : 'dark'} />
      {startHinweis && (
        <Pressable onPress={() => setStartHinweis(null)} style={st.hinweis} accessibilityRole="button" accessibilityHint="Hinweis schließen">
          <Icon name="alert" size={16} farbe={F.gelb} />
          <Text style={st.hinweisText}>{startHinweis}</Text>
          <Icon name="close" size={16} farbe="#fff" />
        </Pressable>
      )}
      <View style={[{ flex: 1 }, theke && reiter === 'scan' && st.theke]}>
        {/* Scanner bleibt montiert, damit ein laufender Vorgang beim Reiterwechsel nicht verloren geht */}
        <View style={theke && reiter === 'scan' ? st.thekeLinks : StyleSheet.absoluteFill}>
          <View style={[StyleSheet.absoluteFill, reiter !== 'scan' && st.versteckt]} pointerEvents={reiter === 'scan' ? 'auto' : 'none'}>
            <ScanScreen
              aktiv={reiter === 'scan'}
              einst={einst}
              stapel={{ anzahl: stapel.length, summe, name: stapelKopf?.name }}
              onStapelGeaendert={stapelNeu}
              onZumStapel={() => (theke ? undefined : setReiter('stapel'))}
              ohneStapelLeiste={theke}
            />
          </View>
        </View>
        {theke && reiter === 'scan' && (
          <View style={st.thekeRechts}>
            <StapelScreen regeln={einst.regeln} einst={einst} onGeaendert={stapelNeu} version={stapelVersion} />
          </View>
        )}
        {reiter === 'stapel' && <StapelScreen regeln={einst.regeln} einst={einst} onGeaendert={stapelNeu} />}
        {reiter === 'log' && <LogScreen sichtbar einst={einst} />}
        {reiter === 'einst' && <EinstellungenScreen einst={einst} onGespeichert={setEinst} onEinfuehrung={() => setEinfuehrung(true)} />}
      </View>
      <View style={[st.leiste, { paddingBottom: Math.max(unten, 8) + 4 }]}>
        {reiterListe.map((r) => {
          const aktiv = reiter === r.id;
          const label = theke && r.id === 'scan' ? 'Theke' : r.label;
          const zaehler = (r.id === 'stapel' || (theke && r.id === 'scan')) && stapel.length > 0;
          return (
            <Pressable key={r.id} onPress={() => setReiter(r.id)} style={st.tab} accessibilityRole="tab" accessibilityState={{ selected: aktiv }}>
              <View style={[st.pille, aktiv && { borderTopColor: F.gelb }]}>
                <Icon name={r.icon} size={24} farbe={aktiv ? '#fff' : '#bdb5a6'} />
                {zaehler && (
                  <View style={st.zahl}>
                    <Text style={st.zahlText}>{stapel.length > 99 ? '99+' : stapel.length}</Text>
                  </View>
                )}
              </View>
              <Text style={[st.tabText, aktiv && st.tabTextAktiv]} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Einfuehrung sichtbar={einfuehrung} onFertig={einfuehrungFertig} />
    </View>
  );
}

// Tab-Leiste wie Fountains schwarze Seitenleiste: aktiver Reiter mit gelber Markierung, Zähler als gelbes Kästchen
const st = StyleSheet.create({
  wurzel: { flex: 1, backgroundColor: F.papier },
  versteckt: { opacity: 0, zIndex: -1 },
  // Thekenmodus: links Scanner (etwas breiter), rechts der Stapel, getrennt durch einen Tintenstrich
  theke: { flexDirection: 'row' },
  thekeLinks: { flex: 11, position: 'relative', overflow: 'hidden' },
  thekeRechts: { flex: 10, borderLeftWidth: 3, borderLeftColor: F.tinte },
  hinweis: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: F.tinte, paddingHorizontal: 14, paddingVertical: 10, paddingTop: 40 },
  hinweisText: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '600' },
  leiste: { flexDirection: 'row', backgroundColor: F.tinte },
  tab: { flex: 1, alignItems: 'center', gap: 2 },
  pille: { paddingHorizontal: 18, paddingTop: 7, paddingBottom: 2, borderTopWidth: 4, borderTopColor: 'transparent' },
  tabText: { fontSize: 12, color: '#bdb5a6', fontWeight: '600' },
  tabTextAktiv: { color: '#fff', fontWeight: '800' },
  zahl: { position: 'absolute', top: 2, right: 4, minWidth: 20, height: 18, backgroundColor: F.gelb, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  zahlText: { color: F.tinte, fontSize: 11, fontWeight: '800' },
});
