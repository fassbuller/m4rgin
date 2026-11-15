// Erste Schritte: fünf Zettel zum Durchblättern beim ersten Start (und jederzeit aus den Einstellungen).
// In Expo Go (Testversion) weist Seite 2 darauf hin, dass das Titelseiten-Foto noch keine Texterkennung hat.
// Erklärt vor allem, was man nicht sieht: Gesten im Stapel und was Glitzer bzw. „prüfen“ bedeutet.
import React, { useMemo, useRef, useState } from 'react';
import { Modal, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Text } from './Schrift';
import { Icon, IconName, Knopf } from './Teile';
import { ABSTAND, aufFarbe, BEREICH, F, KASTEN, SCHRIFT } from '../theme';
import { kartenstil, STUFE_NAME } from '../kartenstil';
import { texterkennungVerfuegbar } from '../lib/texterkennung';

interface Seite {
  icon: IconName;
  farbe: string;
  notiz: string;
  titel: string;
  punkte: { icon: IconName; text: string }[];
}

/** Seiten werden beim Öffnen gebaut: Kartenstil (FIFA Ultimate / Magic) und Expo Go (ohne Texterkennung) fließen ein. */
function seiten(): Seite[] {
  const n = STUFE_NAME[kartenstil()];
  return [
    {
      icon: 'pencil',
      farbe: F.gelb,
      notiz: 'willkommen!',
      titel: 'm4rgin preist Bücher in Sekunden aus',
      punkte: [
        { icon: 'store-search', text: 'Fragt booklooker, eurobuch und eBay gleichzeitig nach Vergleichspreisen.' },
        { icon: 'calculator-variant', text: 'Rechnet nach euren Regeln – jeder Zu- und Abschlag steht sichtbar in der Rechnung.' },
        { icon: 'bookshelf', text: 'Sagt, wohin das Buch gehört: Bücherbox (1 €/2 €), Regal oder Lager – und in welchem Raum es steht.' },
      ],
    },
    {
      icon: 'barcode-scan',
      farbe: BEREICH.scan,
      notiz: 'schritt 1',
      titel: 'Scannen',
      punkte: [
        { icon: 'barcode', text: 'Barcode auf der Rückseite in den Rahmen halten – fertig.' },
        texterkennungVerfuegbar
          ? { icon: 'book-open-page-variant', text: 'Alte Bücher ohne ISBN: Titelseite fotografieren.' }
          : {
              icon: 'alert',
              text: 'Titelseite fotografieren geht in dieser Testversion noch nicht (keine Texterkennung in Expo Go). Bücher ohne ISBN bitte über „Suche“ finden.',
            },
        { icon: 'magnify', text: 'Oder „Suche“: Titel und Autor tippen. Darunter stehen die zuletzt angesehenen Bücher.' },
      ],
    },
    {
      icon: 'tag',
      farbe: F.blau,
      notiz: 'schritt 2',
      titel: 'Die Buch-Karte',
      punkte: [
        { icon: 'gesture-tap', text: `Während der Suche steht das Buch unten. Ist es erkannt, springt es als Karte in die Mitte – ${n.gewoehnlich.kurz}, ${n.gefragt.kurz}, ${n.selten.kurz} oder ${n.raritaet.kurz}.` },
        { icon: 'arrow-right', text: 'Karte antippen = auspreisen. Wegwischen oder nächsten Barcode scannen = weiter.' },
        { icon: 'star-half-full', text: 'Zustand und Merkmale wählen – der m4rgin-Preis rechnet live mit. Anderes Vergleichsangebot? Einfach antippen.' },
        { icon: 'map-marker', text: '„Wo steht es?“ zeigt Raum und Abteilung nach dem Ladenplan. „An Haven“ schickt das Buch direkt an Haven.' },
      ],
    },
    {
      icon: 'bookshelf',
      farbe: BEREICH.stapel,
      notiz: 'schritt 3',
      titel: 'Der Stapel',
      punkte: [
        { icon: 'chevron-down', text: 'Stapelname antippen: Stapel wechseln, neu anlegen, umbenennen, CSV teilen, nach Raum sortieren.' },
        { icon: 'trash-can-outline', text: 'Buch nach links wischen = entfernen.' },
        { icon: 'pencil', text: 'Preis lange drücken = schnell um 50 Cent korrigieren. Auf 1 €/2 € gesetzt, wandert es in die Bücherbox.' },
      ],
    },
    {
      icon: 'star-four-points',
      farbe: F.lila,
      notiz: 'das beste zum schluss',
      titel: 'Seltene Bücher',
      punkte: [
        { icon: 'diamond-stone', text: `${n.selten.kurz} (selten) und ${n.raritaet.kurz} (Rarität) kommen mit großer Enthüllung und Vibration. Jede Karte lässt sich als Bild teilen.` },
        { icon: 'alert', text: 'Steht „prüfen“ dabei, ist die Seltenheit nicht belegt: lieber selbst nachsehen.' },
        { icon: 'cog', text: 'Alles lässt sich in den Einstellungen anpassen – auch der Kartenstil. Diese Einführung findest du dort wieder.' },
      ],
    },
  ];
}

export function Einfuehrung({ sichtbar, onFertig }: { sichtbar: boolean; onFertig: () => void }) {
  const { width } = useWindowDimensions();
  const rand = useSafeAreaInsets();
  const [seite, setSeite] = useState(0);
  const SEITEN = useMemo(seiten, [sichtbar]);
  const roll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  // Auf Tablets den Zettel nicht über die ganze Breite ziehen
  const zettelBreite = Math.min(width - ABSTAND * 2, 520);

  const gehe = (i: number) => {
    const ziel = Math.max(0, Math.min(SEITEN.length - 1, i));
    roll.current?.scrollTo({ x: ziel * width, animated: true });
    setSeite(ziel);
  };
  const gescrollt = (e: NativeSyntheticEvent<NativeScrollEvent>) => setSeite(Math.round(e.nativeEvent.contentOffset.x / width));
  const letzte = seite === SEITEN.length - 1;

  return (
    <Modal visible={sichtbar} animationType="fade" onRequestClose={onFertig} supportedOrientations={['portrait', 'landscape']}>
      <StatusBar style="dark" />
      <View style={[st.wurzel, { paddingTop: rand.top + 8, paddingBottom: rand.bottom + ABSTAND }]}>
        <View style={st.streifen}>
          {[F.gruen, F.gelb, F.orange, F.blau, F.lila, F.rot].map((f) => (
            <View key={f} style={{ flex: 1, backgroundColor: f }} />
          ))}
        </View>
        <Pressable onPress={onFertig} style={st.ueberspringen} hitSlop={10} accessibilityRole="button">
          <Text style={st.ueberspringenText}>Überspringen</Text>
        </Pressable>

        <ScrollView
          ref={roll}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={gescrollt}
          style={{ flex: 1 }}
        >
          {SEITEN.map((s, i) => (
            <View key={i} style={[st.seite, { width }]} accessibilityLabel={`Seite ${i + 1} von ${SEITEN.length}: ${s.titel}`}>
              <View style={[st.zettel, { width: zettelBreite, transform: [{ rotate: i % 2 ? '0.8deg' : '-0.8deg' }] }]}>
                <View style={[st.bildKachel, { backgroundColor: s.farbe }]}>
                  <Icon name={s.icon} size={44} farbe={aufFarbe(s.farbe)} />
                </View>
                <Text style={st.notiz}>{s.notiz}</Text>
                <Text style={st.titel}>{s.titel}</Text>
                <View style={{ gap: 12, marginTop: 10 }}>
                  {s.punkte.map((p, j) => (
                    <View key={j} style={st.punkt}>
                      <View style={st.punktIcon}>
                        <Icon name={p.icon} size={18} />
                      </View>
                      <Text style={st.punktText}>{p.text}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={st.punkte} accessibilityLabel={`Seite ${seite + 1} von ${SEITEN.length}`}>
          {SEITEN.map((_, i) => (
            <Pressable key={i} onPress={() => gehe(i)} hitSlop={6} style={[st.dot, i === seite && st.dotAktiv]} />
          ))}
        </View>
        <View style={st.fuss}>
          {seite > 0 && <Knopf label="Zurück" leise farbe={F.tinte} onPress={() => gehe(seite - 1)} stil={{ flex: 1 }} />}
          <Knopf
            label={letzte ? 'Los geht’s' : 'Weiter'}
            icon={letzte ? 'check' : 'arrow-right'}
            farbe={letzte ? BEREICH.stapel : F.tinte}
            onPress={() => (letzte ? onFertig() : gehe(seite + 1))}
            stil={{ flex: 2 }}
          />
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  wurzel: { flex: 1, backgroundColor: F.papier },
  streifen: { flexDirection: 'row', height: 8, marginHorizontal: ABSTAND },
  ueberspringen: { alignSelf: 'flex-end', paddingHorizontal: ABSTAND, paddingVertical: 10 },
  ueberspringenText: { fontSize: 15, fontWeight: '700', color: F.grau, textDecorationLine: 'underline' },
  seite: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: ABSTAND },
  zettel: { backgroundColor: F.karte, ...KASTEN, padding: ABSTAND + 4, boxShadow: `6px 6px 0px ${F.tinte}` },
  bildKachel: { width: 76, height: 76, ...KASTEN, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  notiz: { fontFamily: SCHRIFT.hand, fontSize: 26, color: F.hand, lineHeight: 28 },
  titel: { fontSize: 26, fontWeight: '800', color: F.tinte, letterSpacing: -0.4 },
  punkt: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  punktIcon: { width: 30, height: 30, ...KASTEN, alignItems: 'center', justifyContent: 'center', backgroundColor: F.papier },
  punktText: { flex: 1, fontSize: 16, color: F.tinte, lineHeight: 22 },
  punkte: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginVertical: 12 },
  dot: { width: 12, height: 12, borderWidth: 2, borderColor: F.tinte },
  dotAktiv: { backgroundColor: F.tinte, width: 28 },
  fuss: { flexDirection: 'row', gap: 10, paddingHorizontal: ABSTAND },
});
