// Kurzes Aufklappen der Buch-Karte beim Scannen: klappt von oben auf, steht ~1,2 s, verschwindet.
// Blockiert nichts (keine Berührungen), damit es an der Theke nicht bremst. Abschaltbar in den Einstellungen.
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions } from 'react-native';
import { BuchKarte, KartenInhalt } from './BuchKarte';
import { F } from '../theme';

export function KurzKarte({ inhalt, bewegung, onFertig }: { inhalt: KartenInhalt; bewegung: boolean; onFertig: () => void }) {
  const { width } = useWindowDimensions();
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const lauf = Animated.sequence([
      Animated.timing(t, { toValue: 1, duration: bewegung ? 380 : 0, easing: Easing.out(Easing.back(1.6)), useNativeDriver: true }),
      Animated.delay(1200),
      Animated.timing(t, { toValue: 0, duration: bewegung ? 260 : 0, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]);
    lauf.start(({ finished }) => finished && onFertig());
    return () => lauf.stop();
  }, []);

  const breite = Math.min(width * 0.62, 260);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        st.halter,
        {
          opacity: t,
          // „Aufklappen“: von der Oberkante her aufziehen, leicht nach unten fallen
          transform: [
            { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }) },
            { perspective: 800 },
            { rotateX: t.interpolate({ inputRange: [0, 1], outputRange: ['-80deg', '0deg'] }) },
          ],
        },
      ]}
    >
      <Animated.View style={{ boxShadow: `6px 6px 0px ${F.tinte}` }}>
        <BuchKarte inhalt={inhalt} breite={breite} bewegung={bewegung} />
      </Animated.View>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  halter: { position: 'absolute', top: 120, left: 0, right: 0, alignItems: 'center', zIndex: 20 },
});
