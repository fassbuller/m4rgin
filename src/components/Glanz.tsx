// Glitzer für seltene Bücher: Holo-Glanz übers Cover, Funkeln, schimmernder Titel, pulsierender Rahmen,
// kurzer „Plopp“ beim Erscheinen und das Stufen-Abzeichen. Alles mit Animated, ohne native Zusatzmodule.
// Respektiert „Animationen entfernen“ des Geräts und den Schalter in den Einstellungen.
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleProp, StyleSheet, TextStyle, View, ViewStyle } from 'react-native';
import { Text } from './Schrift';

// Animierbarer Text mit Hausschrift (für Schimmer und Funkeln)
const AnimatedText = Animated.createAnimatedComponent(Text);
import { Seltenheit, Stufe } from '../lib/seltenheit';
import { aufFarbe, F } from '../theme';

export const STUFE_FARBE: Record<Stufe, string> = {
  gewoehnlich: F.grau,
  gefragt: '#8E99A6', // Silber
  selten: '#eecb33', // Gold = Fountain-Gelb
  raritaet: '#B04FD6', // Holo-Violett, im Rahmen als Regenbogen
};
const REGENBOGEN = ['#E4572E', '#F3C623', '#2E9E6B', '#1E9AA8', '#2D6CDF', '#B04FD6', '#E4572E'];

/** Animationen nur, wenn eingeschaltet und das Gerät sie nicht unterdrückt. */
export function useBewegung(erlaubt: boolean): boolean {
  const [reduziert, setReduziert] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduziert).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduziert);
    return () => sub.remove();
  }, []);
  return erlaubt && !reduziert;
}

function useSchleife(aktiv: boolean, dauer: number, pause = 0, nativ = true): Animated.Value {
  const wert = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!aktiv) {
      wert.setValue(0);
      return;
    }
    const lauf = Animated.loop(
      Animated.sequence([
        Animated.timing(wert, { toValue: 1, duration: dauer, easing: Easing.inOut(Easing.quad), useNativeDriver: nativ }),
        ...(pause ? [Animated.delay(pause)] : []),
        Animated.timing(wert, { toValue: 0, duration: 0, useNativeDriver: nativ }),
      ]),
    );
    lauf.start();
    return () => lauf.stop();
  }, [aktiv]);
  return wert;
}

/** Abzeichen „✦ SELTEN“ – bei unbestätigten Stufen mit Fragezeichen und gestrichelt. */
export function StufenBadge({ s, klein, aufDunkel }: { s: Seltenheit | null; klein?: boolean; aufDunkel?: boolean }) {
  if (!s || s.stufe === 'gewoehnlich') return null;
  const farbe = STUFE_FARBE[s.stufe];
  const sterne = s.stufe === 'raritaet' ? '✦✦ ' : s.stufe === 'selten' ? '✦ ' : '';
  const text = s.moeglich ? 'MÖGLICHE RARITÄT' : `${sterne}${s.stufe === 'raritaet' ? 'RARITÄT' : s.stufe.toUpperCase()}`;
  return (
    <View
      style={[
        st.badge,
        klein && st.badgeKlein,
        s.bestaetigt ? { backgroundColor: farbe } : { borderColor: farbe, borderWidth: 2, borderStyle: 'dashed', backgroundColor: aufDunkel ? 'rgba(0,0,0,0.3)' : F.karte },
      ]}
    >
      <Text style={[st.badgeText, klein && st.badgeTextKlein, { color: s.bestaetigt ? aufFarbe(farbe) : farbe === STUFE_FARBE.selten ? F.tinte : farbe }]}>
        {text}
        {s.bestaetigt ? '' : ' · prüfen'}
      </Text>
    </View>
  );
}

/** Diagonaler Lichtstreifen, der über das Kind (Cover) wandert. */
export function HoloGlanz({ aktiv, breite, children }: { aktiv: boolean; breite: number; children: React.ReactNode }) {
  const t = useSchleife(aktiv, 1100, 1900);
  return (
    <View style={{ overflow: 'hidden' }}>
      {children}
      {aktiv && (
        <>
          {/* leichter Regenbogen-Hauch übers ganze Cover */}
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(176,79,214,0.10)' }]} />
          <Animated.View
            pointerEvents="none"
            style={[
              st.streifen,
              {
                width: breite * 0.45,
                transform: [
                  { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [-breite, breite * 1.6] }) },
                  { rotate: '20deg' },
                ],
              },
            ]}
          />
        </>
      )}
    </View>
  );
}

const STERN_ORTE = [
  { left: -8, top: -6, gross: 14 },
  { right: -8, top: 10, gross: 11 },
  { left: -6, bottom: 6, gross: 10 },
  { right: -4, bottom: -6, gross: 13 },
  { left: '45%' as const, top: -10, gross: 9 },
];

/** Kleine ✦, die versetzt aufblitzen. Liegt über dem Kind, fängt keine Berührungen ab. */
export function Funkeln({ aktiv, farbe, anzahl = 5, children }: { aktiv: boolean; farbe: string; anzahl?: number; children: React.ReactNode }) {
  return (
    <View>
      {children}
      {aktiv && STERN_ORTE.slice(0, anzahl).map(({ gross, ...ort }, i) => <Stern key={i} farbe={farbe} verzoegerung={i * 380} gross={gross} ort={ort} />)}
    </View>
  );
}

function Stern({ farbe, verzoegerung, gross, ort }: { farbe: string; verzoegerung: number; gross: number; ort: ViewStyle }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const lauf = Animated.loop(
      Animated.sequence([
        Animated.delay(verzoegerung),
        Animated.timing(t, { toValue: 1, duration: 450, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 650, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.delay(1400 - verzoegerung / 2),
      ]),
    );
    lauf.start();
    return () => lauf.stop();
  }, []);
  return (
    <AnimatedText
      pointerEvents="none"
      style={[
        { position: 'absolute', fontSize: gross, color: farbe, textShadowColor: '#fff', textShadowRadius: 4 },
        ort,
        { opacity: t, transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.2] }) }, { rotate: '15deg' }] },
      ]}
    >
      ✦
    </AnimatedText>
  );
}

/** Text, der sanft zwischen Grundfarbe und Gold wechselt. */
export function SchimmerText({
  aktiv, grund, gold = STUFE_FARBE.selten, style, children, numberOfLines,
}: {
  aktiv: boolean;
  grund: string;
  gold?: string;
  style?: StyleProp<TextStyle>;
  children: React.ReactNode;
  numberOfLines?: number;
}) {
  const t = useSchleife(aktiv, 2400, 0, false);
  const farbe = aktiv ? t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [grund, gold, grund] }) : grund;
  return (
    <AnimatedText style={[style, { color: farbe }]} numberOfLines={numberOfLines}>
      {children}
    </AnimatedText>
  );
}

/**
 * Rahmen in Stufenfarbe. Bei „voll“ pulsiert er (Rarität: Regenbogen), bei „gedämpft“ steht er still.
 * Dazu der einmalige „Plopp“ beim Erscheinen einer Rarität.
 */
export function GlanzRahmen({
  s, bewegung, plopp, style, children,
}: {
  s: Seltenheit | null;
  bewegung: boolean;
  plopp?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const stufe = s?.stufe ?? 'gewoehnlich';
  const aktiv = !!s && stufe !== 'gewoehnlich';
  const voll = aktiv && s!.effekt === 'voll' && bewegung;
  const t = useSchleife(voll, stufe === 'raritaet' ? 3600 : 1600, 0, false);
  const skala = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!(plopp && voll && stufe === 'raritaet')) return;
    skala.setValue(0.92);
    Animated.spring(skala, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }).start();
  }, [plopp, voll, stufe]);

  if (!aktiv) return <View style={style}>{children}</View>;
  const farbe = STUFE_FARBE[stufe];
  const randFarbe = voll
    ? stufe === 'raritaet'
      ? t.interpolate({ inputRange: REGENBOGEN.map((_, i) => i / (REGENBOGEN.length - 1)), outputRange: REGENBOGEN })
      : t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [farbe, '#FFFFFF', farbe] })
    : farbe;
  return (
    <Animated.View style={{ transform: [{ scale: skala }] }}>
      <Animated.View style={[style, { borderWidth: 2.5, borderColor: randFarbe }]}>{children}</Animated.View>
    </Animated.View>
  );
}

/** Begründung und Vorbehalte als kleine Zeilen – damit klar ist, warum es glitzert (oder nicht). */
export function SeltenheitsInfo({ s, aufDunkel }: { s: Seltenheit | null; aufDunkel?: boolean }) {
  if (!s || s.stufe === 'gewoehnlich') return null;
  const grau = aufDunkel ? '#D9D2C8' : F.grau;
  return (
    <View style={{ marginTop: 4, gap: 2 }}>
      {s.gruende.length > 0 && <Text style={[st.info, { color: grau }]}>Weil: {s.gruende.join(' · ')}</Text>}
      {s.vorbehalte.map((v, i) => (
        <Text key={i} style={[st.info, { color: aufDunkel ? F.gelb : F.orange, fontWeight: '700' }]}>
          ⚠ {v}
        </Text>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  badge: { alignSelf: 'flex-start', borderWidth: 2, borderColor: F.tinte, paddingHorizontal: 8, paddingVertical: 3 },
  badgeKlein: { paddingHorizontal: 5, paddingVertical: 1 },
  badgeText: { fontSize: 13, fontWeight: '900', letterSpacing: 0.8 },
  badgeTextKlein: { fontSize: 10, letterSpacing: 0.5 },
  streifen: { position: 'absolute', top: -20, bottom: -20, backgroundColor: 'rgba(255,255,255,0.55)' },
  info: { fontSize: 12 },
});
