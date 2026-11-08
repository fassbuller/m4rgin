// Die Karte neigt sich leicht mit dem Handy – ein dezenter 3D-Effekt wie bei echten Sammelkarten.
// Grundlage ist der Bewegungssensor (Lage des Geräts). Die „Ruhelage“ wandert langsam mit, damit die
// Karte bei jeder Haltung gerade liegt und nur auf Bewegungen reagiert. Aus bei „Bewegung reduzieren“.
import React, { useEffect, useRef } from 'react';
import { Animated, ViewStyle } from 'react-native';
import { DeviceMotion } from 'expo-sensors';

const MAX_GRAD_Y = 10; // links/rechts kippen
const MAX_GRAD_X = 7; // vor/zurück kippen
const BEREICH = 0.45; // Radiant Ausschlag bis zum Maximum (~26°)

export function useNeigung(aktiv: boolean) {
  const kippX = useRef(new Animated.Value(0)).current; // −1 … 1 (links … rechts)
  const kippY = useRef(new Animated.Value(0)).current; // −1 … 1 (weg … her)

  useEffect(() => {
    if (!aktiv) return;
    let ruhe: { beta: number; gamma: number } | null = null;
    let sub: { remove: () => void } | null = null;
    let lebt = true;
    DeviceMotion.isAvailableAsync()
      .then((da) => {
        if (!da || !lebt) return;
        DeviceMotion.setUpdateInterval(40);
        sub = DeviceMotion.addListener(({ rotation }) => {
          if (!rotation) return;
          const { beta, gamma } = rotation;
          if (!ruhe) ruhe = { beta, gamma };
          // Ruhelage folgt langsam nach → nach ~2 s Stillhalten liegt die Karte wieder gerade
          ruhe = { beta: ruhe.beta * 0.97 + beta * 0.03, gamma: ruhe.gamma * 0.97 + gamma * 0.03 };
          const klemm = (v: number) => Math.max(-1, Math.min(1, v / BEREICH));
          kippX.setValue(klemm(gamma - ruhe.gamma));
          kippY.setValue(klemm(beta - ruhe.beta));
        });
      })
      .catch(() => undefined);
    return () => {
      lebt = false;
      sub?.remove();
      Animated.spring(kippX, { toValue: 0, useNativeDriver: true }).start();
      Animated.spring(kippY, { toValue: 0, useNativeDriver: true }).start();
    };
  }, [aktiv]);

  return { kippX, kippY };
}

/** Hülle, die ihren Inhalt mit dem Handy neigt; `glanz` bekommt den Ausschlag für einen mitwandernden Lichtreflex. */
export function Neigend({ aktiv, children, style }: { aktiv: boolean; children: React.ReactNode; style?: ViewStyle }) {
  const { kippX, kippY } = useNeigung(aktiv);
  return (
    <Animated.View
      style={[
        style,
        {
          transform: [
            { perspective: 1000 },
            { rotateY: kippX.interpolate({ inputRange: [-1, 1], outputRange: [`-${MAX_GRAD_Y}deg`, `${MAX_GRAD_Y}deg`] }) },
            { rotateX: kippY.interpolate({ inputRange: [-1, 1], outputRange: [`${MAX_GRAD_X}deg`, `-${MAX_GRAD_X}deg`] }) },
          ],
        },
      ]}
    >
      {children}
      {/* Lichtreflex wandert gegen die Kipprichtung – verstärkt den Eindruck von Tiefe */}
      {aktiv && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            width: '40%',
            backgroundColor: '#ffffff',
            opacity: kippX.interpolate({ inputRange: [-1, 0, 1], outputRange: [0.16, 0, 0.16] }),
            transform: [{ translateX: kippX.interpolate({ inputRange: [-1, 1], outputRange: [260, -60] }) }, { skewX: '-12deg' }],
          }}
        />
      )}
    </Animated.View>
  );
}
