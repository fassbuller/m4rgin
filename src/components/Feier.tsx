// Die Seltenheits-Feier: ein seltener Fund wird enthüllt wie ein Sammelkarten-Ziehen.
// Ablauf (~3,5 s, jederzeit durch Tippen überspringbar):
//   1. Dunkel, Lichtstrahlen in Stufenfarbe drehen sich, ein Zettel (Rückseite) taucht auf und wackelt.
//   2. Blitz, der Zettel dreht sich um (3D-Drehung um die Hochachse).
//   3. Nacheinander: Stufe, Cover mit Holo-Glanz, Titel, Preis zählt hoch, Konfetti-Zettel fallen.
//   4. „Teilen“ (die Karte als Bild – fürs Team oder Instagram) und „Weiter“.
// Alle Bewegungen laufen mit dem nativen Treiber; bei „Bewegung reduzieren“ steht sofort das Endbild da.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { Text } from './Schrift';
import { BuchKarte, useKurzbeschreibung } from './BuchKarte';
import { Neigend } from './Neigung';
import { STUFE_FARBE, useBewegung } from './Glanz';
import { Icon, Knopf } from './Teile';
import { Titel } from '../lib/titel';
import { Seltenheit } from '../lib/seltenheit';
import { euro } from '../lib/preis';
import { rueckmeldung } from '../lib/haptik';
import { fehlerText } from '../lib/fehler';
import { ABSTAND, aufFarbe, F, KASTEN, SCHRIFT } from '../theme';

export interface FeierDaten {
  titel: Titel;
  preis: number | null;
  seltenheit: Seltenheit;
  /** Kategorie bzw. Fach, z. B. „Regal · Belletristik“ */
  ort?: string | null;
}

const KONFETTI_FARBEN = [F.gruen, F.gelb, F.orange, F.blau, F.lila, F.rot];

export function Feier({ daten, effekte, onZu }: { daten: FeierDaten | null; effekte: boolean; onZu: () => void }) {
  return (
    <Modal visible={!!daten} transparent animationType="fade" onRequestClose={onZu} supportedOrientations={['portrait', 'landscape']}>
      <StatusBar style="light" />
      {daten && <Buehne daten={daten} effekte={effekte} onZu={onZu} />}
    </Modal>
  );
}

function Buehne({ daten, effekte, onZu }: { daten: FeierDaten; effekte: boolean; onZu: () => void }) {
  const { width, height } = useWindowDimensions();
  const rand = useSafeAreaInsets();
  const bewegung = useBewegung(effekte);
  const s = daten.seltenheit;
  const farbe = STUFE_FARBE[s.stufe];
  const rar = s.stufe === 'raritaet';
  // Große Show nur für Gold (selten) und Schwarz (Rarität); Bronze und Silber erscheinen ohne Spektakel
  const gross = rar || s.stufe === 'selten';
  const kartenBreite = Math.min(width - ABSTAND * 4, 340);
  const gruende = s.gruende.filter((g) => !g.startsWith('Preis '));
  // Worum geht's: Wikipedia-Kurzbeschreibung des Werks, sonst die DNB-Sachgruppe
  const kurz = useKurzbeschreibung(daten.titel);

  // Ein Wert pro Phase – alle nativ animiert
  const dunkel = useRef(new Animated.Value(0)).current;
  const strahlen = useRef(new Animated.Value(0)).current;
  const auftritt = useRef(new Animated.Value(0)).current;
  const wackeln = useRef(new Animated.Value(0)).current;
  const blitz = useRef(new Animated.Value(0)).current;
  const drehung = useRef(new Animated.Value(0)).current;
  const stufe = useRef(new Animated.Value(0)).current;
  const cover = useRef(new Animated.Value(0)).current;
  const titel = useRef(new Animated.Value(0)).current;
  const knoepfe = useRef(new Animated.Value(0)).current;
  const konfetti = useRef(new Animated.Value(0)).current;
  const [preisAnzeige, setPreisAnzeige] = useState(0);
  const [fertig, setFertig] = useState(false);
  const [teilt, setTeilt] = useState(false);
  const karte = useRef<React.ComponentRef<typeof View>>(null);
  const lauf = useRef<Animated.CompositeAnimation | null>(null);

  const zumEnde = () => {
    lauf.current?.stop();
    [dunkel, auftritt, drehung, stufe, cover, titel, knoepfe].forEach((v) => v.setValue(1));
    blitz.setValue(0);
    wackeln.setValue(0);
    setPreisAnzeige(daten.preis ?? 0);
    setFertig(true);
  };

  useEffect(() => {
    // Strahlen drehen endlos
    const dreh = Animated.loop(Animated.timing(strahlen, { toValue: 1, duration: rar ? 9000 : 14000, easing: Easing.linear, useNativeDriver: true }));
    if (bewegung && gross) dreh.start();
    if (!bewegung || !gross) {
      zumEnde();
      if (gross) rueckmeldung(rar ? 'raritaet' : 'selten');
      return () => dreh.stop();
    }

    const t = (v: Animated.Value, dauer: number, e = Easing.out(Easing.cubic)) =>
      Animated.timing(v, { toValue: 1, duration: dauer, easing: e, useNativeDriver: true });
    lauf.current = Animated.sequence([
      Animated.parallel([t(dunkel, 350), t(auftritt, 600, Easing.out(Easing.back(1.4)))]),
      // Spannung: der Zettel wackelt, bei Rarität länger
      Animated.loop(
        Animated.sequence([
          Animated.timing(wackeln, { toValue: 1, duration: 70, useNativeDriver: true }),
          Animated.timing(wackeln, { toValue: -1, duration: 140, useNativeDriver: true }),
          Animated.timing(wackeln, { toValue: 0, duration: 70, useNativeDriver: true }),
          Animated.delay(rar ? 120 : 220),
        ]),
        { iterations: rar ? 4 : 2 },
      ),
      // Blitz + Umdrehen
      Animated.parallel([
        Animated.sequence([t(blitz, 120), Animated.timing(blitz, { toValue: 0, duration: 380, useNativeDriver: true })]),
        t(drehung, 650, Easing.inOut(Easing.cubic)),
      ]),
      // Enthüllung Schritt für Schritt
      t(stufe, 380, Easing.out(Easing.back(2))),
      Animated.parallel([t(cover, 420), t(konfetti, 2600, Easing.in(Easing.quad))]),
      t(titel, 360),
      Animated.delay(700),
      t(knoepfe, 300),
    ]);
    lauf.current.start(({ finished }) => finished && setFertig(true));

    // Haptik zum Takt: Tick beim Wackeln, kräftig beim Umdrehen
    const zeiten = [650, 950, rar ? 1250 : 0, rar ? 1550 : 0].filter(Boolean);
    const timer = zeiten.map((z) => setTimeout(() => rueckmeldung('scan'), z));
    const umdrehen = (rar ? 1700 : 1100) + 200;
    timer.push(setTimeout(() => rueckmeldung(rar ? 'raritaet' : 'selten'), umdrehen));
    // Preis zählt hoch, sobald der Titel steht
    const zaehlStart = umdrehen + 1300;
    const ziel = daten.preis ?? 0;
    timer.push(
      setTimeout(() => {
        const schritte = 24;
        let i = 0;
        const iv = setInterval(() => {
          i++;
          setPreisAnzeige(Math.round(((ziel * i) / schritte) * 2) / 2);
          if (i >= schritte) {
            setPreisAnzeige(ziel);
            clearInterval(iv);
          }
        }, 28);
        timer.push(iv as unknown as ReturnType<typeof setTimeout>);
      }, zaehlStart),
    );
    return () => {
      dreh.stop();
      lauf.current?.stop();
      timer.forEach((x) => clearTimeout(x));
    };
  }, []);

  const teilen = async () => {
    if (!karte.current) return;
    setTeilt(true);
    try {
      const uri = await captureRef(karte, { format: 'png', quality: 1, result: 'tmpfile' });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Seltenen Fund teilen', UTI: 'public.png' });
      }
    } catch (e) {
      // Teilen abgebrochen ist kein Fehler; alles andere kurz anzeigen
      const text = fehlerText(e, 'Das Teilen');
      if (!/cancel|abgebrochen/i.test(String(e))) console.warn(text);
    } finally {
      setTeilt(false);
    }
  };

  // Konfetti: feste Startpunkte je Buch, damit nichts bei jedem Render springt
  const stuecke = useMemo(
    () =>
      Array.from({ length: rar ? 36 : 22 }, (_, i) => ({
        x: ((i * 97) % 100) / 100,
        verz: (i % 7) / 7,
        dreh: (i % 2 ? 1 : -1) * (180 + ((i * 53) % 360)),
        farbe: KONFETTI_FARBEN[i % KONFETTI_FARBEN.length],
        gross: 7 + (i % 4) * 2,
      })),
    [rar],
  );

  const drehRueck = drehung.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', '90deg', '90deg'] });
  const drehVorne = drehung.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['-90deg', '-90deg', '0deg'] });
  const einblenden = (v: Animated.Value, y = 14) => ({
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [y, 0] }) }],
  });
  const diagonale = Math.hypot(width, height);

  return (
    <Pressable style={StyleSheet.absoluteFill} onPress={fertig ? undefined : zumEnde} accessibilityLabel="Enthüllung überspringen">
      {/* Dunkelheit */}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(15,13,12,0.94)', opacity: dunkel }]} />

      {/* Lichtstrahlen */}
      <Animated.View
        pointerEvents="none"
        style={[
          st.strahlenHalter,
          { width: diagonale, height: diagonale, left: (width - diagonale) / 2, top: (height - diagonale) / 2, opacity: Animated.multiply(dunkel, 0.9) },
          { transform: [{ rotate: strahlen.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] },
        ]}
      >
        {Array.from({ length: 12 }, (_, i) => (
          <View
            key={i}
            style={[st.strahl, { height: diagonale, left: diagonale / 2 - 22, backgroundColor: rar ? KONFETTI_FARBEN[i % 6] : farbe, transform: [{ rotate: `${i * 30}deg` }] }]}
          />
        ))}
      </Animated.View>

      {/* Konfetti-Zettel */}
      {bewegung &&
        stuecke.map((k, i) => (
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
                { translateY: konfetti.interpolate({ inputRange: [0, 1], outputRange: [0 - k.verz * 200, height + 60] }) },
                { rotate: konfetti.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${k.dreh}deg`] }) },
              ],
            }}
          />
        ))}

      {/* Die Karte */}
      <View style={[st.mitte, { paddingTop: rand.top, paddingBottom: rand.bottom + 110 }]} pointerEvents="box-none">
        <Animated.View
          style={{
            opacity: auftritt,
            transform: [
              { translateY: auftritt.interpolate({ inputRange: [0, 1], outputRange: [120, 0] }) },
              { scale: auftritt.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
              { rotate: wackeln.interpolate({ inputRange: [-1, 1], outputRange: ['-4deg', '4deg'] }) },
            ],
          }}
        >
          {/* Vorderseite – die Sammelkarte; genau sie wird als Bild geteilt */}
          <Animated.View style={{ transform: [{ perspective: 900 }, { rotateY: drehVorne }] }}>
            {/* Leicht mit dem Handy neigen wie im Scanner */}
            <Neigend aktiv={bewegung}>
              <View ref={karte} collapsable={false} style={{ boxShadow: `8px 8px 0px ${rar ? F.gelb : F.tinte}` }}>
                <BuchKarte
                  inhalt={{ titel: daten.titel, preis: daten.preis != null ? preisAnzeige : null, stufe: s.stufe, kurz, ort: daten.ort }}
                  breite={kartenBreite}
                  bewegung={bewegung}
                />
              </View>
            </Neigend>
            {gruende.length > 0 && <Animated.Text style={[st.gruende, einblenden(titel)]}>{gruende.join(' · ')}</Animated.Text>}
          </Animated.View>

          {/* Rückseite – liegt deckungsgleich über der Vorderseite */}
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, st.rueckseite, { borderColor: rar ? F.gelb : farbe, transform: [{ perspective: 900 }, { rotateY: drehRueck }] }]}
          >
            <Text style={st.rueckZeichen}>{rar ? '✦✦' : '✦'}</Text>
            <Text style={st.rueckHand}>was ist das?</Text>
          </Animated.View>
        </Animated.View>
      </View>

      {/* Blitz */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#fff', opacity: blitz }]} />

      {/* Knöpfe */}
      <Animated.View style={[st.knoepfe, { paddingBottom: rand.bottom + ABSTAND, opacity: knoepfe }]} pointerEvents={fertig ? 'auto' : 'none'}>
        <Knopf label={teilt ? 'Bild wird erstellt …' : 'Teilen'} icon="share-variant" farbe={farbe} onPress={teilen} deaktiviert={teilt} stil={{ flex: 1 }} />
        <Knopf label="Weiter" icon="arrow-right" leise farbe={F.tinte} onPress={onZu} stil={{ flex: 1 }} />
      </Animated.View>
      {!fertig && (
        <View style={[st.tippHinweis, { bottom: rand.bottom + 24 }]} pointerEvents="none">
          <Icon name="gesture-tap" size={14} farbe="#bdb5a6" />
          <Text style={st.tippText}>Tippen zum Überspringen</Text>
        </View>
      )}
    </Pressable>
  );
}

const st = StyleSheet.create({
  strahlenHalter: { position: 'absolute' },
  strahl: { position: 'absolute', top: 0, width: 44, opacity: 0.16 },
  mitte: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  rueckseite: {
    backgroundColor: F.tinte,
    borderWidth: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backfaceVisibility: 'hidden',
  },
  rueckZeichen: { fontSize: 72, color: F.gelb, fontWeight: '800' },
  rueckHand: { fontFamily: SCHRIFT.hand, fontSize: 30, color: F.papier, marginTop: 6 },
  vorderseite: { backgroundColor: F.papier, ...KASTEN, borderWidth: 3, padding: ABSTAND, backfaceVisibility: 'hidden' },
  kopfReihe: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  stufe: { ...KASTEN, paddingHorizontal: 10, paddingVertical: 4 },
  stufeText: { fontSize: 15, fontWeight: '800', letterSpacing: 1 },
  fund: { fontFamily: SCHRIFT.hand, fontSize: 22, color: F.hand, transform: [{ rotate: '-3deg' }] },
  coverReihe: { alignItems: 'center', marginVertical: 16 },
  cover: { width: 96, height: 144, ...KASTEN, backgroundColor: F.sand },
  titel: { fontSize: 22, fontWeight: '800', color: F.tinte, textAlign: 'center', letterSpacing: -0.3 },
  autor: { fontSize: 14, color: F.grau, textAlign: 'center', marginTop: 2 },
  preis: { fontSize: 44, fontWeight: '800', color: F.tinte, textAlign: 'center', marginTop: 8, fontVariant: ['tabular-nums'] },
  gruende: { fontSize: 12, color: '#d9d3c7', textAlign: 'center', marginTop: 14, fontFamily: SCHRIFT.normal },
  regenbogen: { flexDirection: 'row', height: 8, marginTop: -ABSTAND, marginHorizontal: -ABSTAND, marginBottom: 12, borderBottomWidth: 2, borderBottomColor: F.tinte },
  kurz: { fontSize: 14, color: F.tinte, textAlign: 'center', marginTop: 8, lineHeight: 19 },
  knoepfe: { position: 'absolute', left: ABSTAND, right: ABSTAND, bottom: 0, flexDirection: 'row', gap: 10 },
  tippHinweis: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 5 },
  tippText: { color: '#bdb5a6', fontSize: 12, fontWeight: '600' },
});
