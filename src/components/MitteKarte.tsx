// Die Karte mittig im Scanner, sobald ein Buch erkannt und bepreist ist.
//   Antippen → Auspreisen · in jede Richtung wegwischen → verworfen, weiter scannen · nächster Scan ersetzt sie.
// Bronze/Silber klappen kurz auf. Gold/Schwarz kommen mit Enthüllung: Dunkel, Strahlen, die Karte (Rückseite)
// wackelt, Blitz, Umdrehen, Konfetti – dazu Vibration im Takt. Jede Karte neigt sich leicht mit dem Handy.
// Die Kamera läuft dahinter weiter; außerhalb der Karte gehen Berührungen durch.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { Text } from './Schrift';
import { BuchKarte, KartenInhalt, useKurzbeschreibung } from './BuchKarte';
import { Neigend } from './Neigung';
import { Icon } from './Teile';
import { rueckmeldung } from '../lib/haptik';
import { F, KASTEN, SCHRIFT } from '../theme';

const BUNT = ['#367d47', '#eecb33', '#e86435', '#2f6db5', '#7a226f', '#dd2a4b'];

export function MitteKarte(p: {
  inhalt: KartenInhalt;
  /** Gründe für die Stufe (unter der Karte) */
  gruende?: string[];
  /** Enthüllung bei Gold/Schwarz zeigen (Einstellung) */
  enthuellung: boolean;
  bewegung: boolean;
  neigung: boolean;
  vibration: boolean;
  onOeffnen: () => void;
  onWeg: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const kurz = useKurzbeschreibung(p.inhalt.titel);
  const gold = p.inhalt.stufe === 'selten';
  const schwarz = p.inhalt.stufe === 'raritaet';
  const besonders = (gold || schwarz) && !p.inhalt.pruefen;
  const show = besonders && p.enthuellung && p.bewegung;
  const breite = Math.min(width * 0.74, 300);

  const auftritt = useRef(new Animated.Value(0)).current;
  const dunkel = useRef(new Animated.Value(0)).current;
  const strahlen = useRef(new Animated.Value(0)).current;
  const wackeln = useRef(new Animated.Value(0)).current;
  const blitz = useRef(new Animated.Value(0)).current;
  const drehung = useRef(new Animated.Value(show ? 0 : 1)).current;
  const konfetti = useRef(new Animated.Value(0)).current;
  const hinweis = useRef(new Animated.Value(0)).current;
  const wisch = useRef(new Animated.ValueXY()).current;
  const [teilt, setTeilt] = useState(false);
  const karte = useRef<React.ComponentRef<typeof View>>(null);

  useEffect(() => {
    const t = (v: Animated.Value, dauer: number, e = Easing.out(Easing.cubic), ziel = 1) =>
      Animated.timing(v, { toValue: ziel, duration: dauer, easing: e, useNativeDriver: true });
    const timer: ReturnType<typeof setTimeout>[] = [];
    const brumm = (art: Parameters<typeof rueckmeldung>[0], ms: number) => {
      if (p.vibration) timer.push(setTimeout(() => rueckmeldung(art), ms));
    };
    let dreh: Animated.CompositeAnimation | null = null;

    if (show) {
      dreh = Animated.loop(Animated.timing(strahlen, { toValue: 1, duration: schwarz ? 9000 : 14000, easing: Easing.linear, useNativeDriver: true }));
      dreh.start();
      const wackelRunden = schwarz ? 4 : 2;
      Animated.sequence([
        Animated.parallel([t(dunkel, 300), t(auftritt, 500, Easing.out(Easing.back(1.4)))]),
        Animated.loop(
          Animated.sequence([
            Animated.timing(wackeln, { toValue: 1, duration: 70, useNativeDriver: true }),
            Animated.timing(wackeln, { toValue: -1, duration: 140, useNativeDriver: true }),
            Animated.timing(wackeln, { toValue: 0, duration: 70, useNativeDriver: true }),
            Animated.delay(schwarz ? 110 : 200),
          ]),
          { iterations: wackelRunden },
        ),
        Animated.parallel([
          Animated.sequence([t(blitz, 110), t(blitz, 380, Easing.out(Easing.quad), 0)]),
          t(drehung, 600, Easing.inOut(Easing.cubic)),
          t(konfetti, 2600, Easing.in(Easing.quad)),
        ]),
        t(hinweis, 300),
      ]).start();
      // Vibration im Takt: kurze Ticks beim Wackeln, kräftig beim Umdrehen
      const proRunde = schwarz ? 390 : 480;
      for (let i = 0; i < wackelRunden; i++) brumm('scan', 520 + i * proRunde);
      brumm(schwarz ? 'raritaet' : 'selten', 520 + wackelRunden * proRunde + 120);
    } else {
      // Bronze/Silber (und ohne Enthüllung): kurz aufklappen
      Animated.parallel([t(auftritt, p.bewegung ? 380 : 0, Easing.out(Easing.back(1.5))), t(hinweis, p.bewegung ? 500 : 0)]).start();
      if (besonders) brumm(schwarz ? 'raritaet' : 'selten', 150);
    }
    return () => {
      dreh?.stop();
      timer.forEach(clearTimeout);
    };
  }, []);

  // Wegwischen in jede Richtung; ein kurzer Tipp ohne Bewegung öffnet das Auspreisen
  const raus = (dx: number, dy: number) => {
    const laenge = Math.hypot(dx, dy) || 1;
    const weit = Math.max(width, height) * 1.2;
    Animated.timing(wisch, { toValue: { x: (dx / laenge) * weit, y: (dy / laenge) * weit }, duration: 220, useNativeDriver: false }).start(() => aktuell.current.onWeg());
  };
  const geste = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: Animated.event([null, { dx: wisch.x, dy: wisch.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_, g) => {
        const strecke = Math.hypot(g.dx, g.dy);
        if (strecke < 8) {
          Animated.spring(wisch, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
          aktuell.current.onOeffnen();
        } else if (strecke > 110 || Math.hypot(g.vx, g.vy) > 0.9) {
          raus(g.dx, g.dy);
        } else {
          Animated.spring(wisch, { toValue: { x: 0, y: 0 }, friction: 6, useNativeDriver: false }).start();
        }
      },
      onPanResponderTerminate: () => Animated.spring(wisch, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start(),
    }),
  ).current;
  // Callbacks aktuell halten, der PanResponder wird nur einmal angelegt
  const aktuell = useRef(p);
  aktuell.current = p;

  const teilen = async () => {
    if (!karte.current) return;
    setTeilt(true);
    try {
      const uri = await captureRef(karte, { format: 'png', quality: 1, result: 'tmpfile' });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Fund teilen', UTI: 'public.png' });
    } catch {
      // abgebrochen o. ä. – nichts zu tun
    } finally {
      setTeilt(false);
    }
  };

  const stuecke = useMemo(
    () =>
      Array.from({ length: schwarz ? 34 : 20 }, (_, i) => ({
        x: ((i * 97) % 100) / 100,
        verz: (i % 7) / 7,
        dreh: (i % 2 ? 1 : -1) * (180 + ((i * 53) % 360)),
        farbe: BUNT[i % BUNT.length],
        gross: 7 + (i % 4) * 2,
      })),
    [schwarz],
  );
  const diagonale = Math.hypot(width, height);
  const wischDrehung = wisch.x.interpolate({ inputRange: [-300, 0, 300], outputRange: ['-14deg', '0deg', '14deg'] });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {show && (
        <>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(15,13,12,0.82)', opacity: dunkel }]} />
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: diagonale,
              height: diagonale,
              left: (width - diagonale) / 2,
              top: (height - diagonale) / 2,
              opacity: dunkel,
              transform: [{ rotate: strahlen.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }],
            }}
          >
            {Array.from({ length: 12 }, (_, i) => (
              <View
                key={i}
                style={{ position: 'absolute', top: 0, width: 44, height: diagonale, left: diagonale / 2 - 22, opacity: 0.15, backgroundColor: schwarz ? BUNT[i % 6] : F.gelb, transform: [{ rotate: `${i * 30}deg` }] }}
              />
            ))}
          </Animated.View>
          {stuecke.map((k, i) => (
            <Animated.View
              key={i}
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: k.x * width,
                top: -30,
                width: k.gross,
                height: k.gross * 1.4,
                backgroundColor: k.farbe,
                borderWidth: 1,
                borderColor: F.tinte,
                opacity: konfetti.interpolate({ inputRange: [0, 0.05, 0.85, 1], outputRange: [0, 1, 1, 0] }),
                transform: [
                  { translateY: konfetti.interpolate({ inputRange: [0, 1], outputRange: [-k.verz * 200, height + 60] }) },
                  { rotate: konfetti.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${k.dreh}deg`] }) },
                ],
              }}
            />
          ))}
        </>
      )}

      <View style={st.mitte} pointerEvents="box-none">
        <Animated.View
          {...geste.panHandlers}
          accessibilityRole="button"
          accessibilityLabel={`${p.inhalt.titel.titel}. Antippen zum Auspreisen, wegwischen zum Verwerfen.`}
          style={{ transform: [{ translateX: wisch.x }, { translateY: wisch.y }, { rotate: wischDrehung }] }}
        >
        <Animated.View
          style={{
            opacity: auftritt,
            transform: [
              { translateY: auftritt.interpolate({ inputRange: [0, 1], outputRange: [60, 0] }) },
              { scale: auftritt.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
              { perspective: 900 },
              // Bronze/Silber „klappen auf“ (von oben), Gold/Schwarz wackeln vor dem Umdrehen
              { rotateX: show ? '0deg' : auftritt.interpolate({ inputRange: [0, 1], outputRange: ['-70deg', '0deg'] }) },
              { rotate: wackeln.interpolate({ inputRange: [-1, 1], outputRange: ['-4deg', '4deg'] }) },
            ],
          }}
        >
          <Neigend aktiv={p.neigung && p.bewegung}>
            {/* Vorderseite */}
            <Animated.View style={{ transform: [{ perspective: 900 }, { rotateY: drehung.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['-90deg', '-90deg', '0deg'] }) }] }}>
              <View ref={karte} collapsable={false} style={{ boxShadow: `7px 7px 0px ${schwarz ? F.gelb : F.tinte}` }}>
                <BuchKarte inhalt={{ ...p.inhalt, kurz }} breite={breite} bewegung={p.bewegung} />
              </View>
            </Animated.View>
            {/* Rückseite (nur bei der Enthüllung zu sehen) */}
            {show && (
              <Animated.View
                pointerEvents="none"
                style={[
                  StyleSheet.absoluteFill,
                  st.rueckseite,
                  { borderColor: F.gelb, transform: [{ perspective: 900 }, { rotateY: drehung.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', '90deg', '90deg'] }) }] },
                ]}
              >
                <Text style={st.rueckZeichen}>{schwarz ? '✦✦' : '✦'}</Text>
                <Text style={st.rueckHand}>was ist das?</Text>
              </Animated.View>
            )}
          </Neigend>
        </Animated.View>
        </Animated.View>

        <Animated.View style={[st.unten, { opacity: hinweis }]} pointerEvents="box-none">
          {!!p.gruende?.length && besonders && <Text style={st.gruende}>{p.gruende.join(' · ')}</Text>}
          <View style={st.knoepfe} pointerEvents="box-none">
            <Pressable onPress={teilen} style={st.teilen} hitSlop={8} accessibilityRole="button">
              <Icon name="share-variant" size={16} />
              <Text style={st.teilenText}>{teilt ? 'Bild …' : 'Teilen'}</Text>
            </Pressable>
          </View>
          <View style={st.tipp}>
            <Icon name="gesture-tap" size={14} farbe="#fff" />
            <Text style={st.tippText}>Antippen = auspreisen · wegwischen = weiter</Text>
          </View>
        </Animated.View>
      </View>

      {show && <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#fff', opacity: blitz }]} />}
    </View>
  );
}

const st = StyleSheet.create({
  mitte: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingBottom: 70 },
  rueckseite: { backgroundColor: F.tinte, borderWidth: 6, alignItems: 'center', justifyContent: 'center', backfaceVisibility: 'hidden' },
  rueckZeichen: { fontSize: 72, color: F.gelb, fontWeight: '800' },
  rueckHand: { fontFamily: SCHRIFT.hand, fontSize: 30, color: F.papier, marginTop: 6 },
  unten: { alignItems: 'center', marginTop: 16, gap: 8 },
  gruende: { color: '#fff', fontSize: 12, fontWeight: '700', textAlign: 'center', paddingHorizontal: 30, textShadowColor: '#000', textShadowRadius: 4 },
  knoepfe: { flexDirection: 'row', gap: 10 },
  teilen: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: F.papier, ...KASTEN, paddingHorizontal: 14, paddingVertical: 7 },
  teilenText: { fontSize: 14, fontWeight: '800', color: F.tinte },
  tipp: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(29,29,27,0.78)', paddingHorizontal: 10, paddingVertical: 5 },
  tippText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
