// Die Buch-Karte (Variante „Sammelkarte“): Metall vollflächig, Preis groß oben links, Cover rechts,
// Namensband unten. Vier Metalle nach Seltenheit:
//   Bronze = gewöhnlich · Silber = gefragt · Gold = selten · Schwarz = Rarität (mit Holo-Regenbogen).
// Ein Glanzstreifen wandert langsam über das Metall (nativ animiert, aus bei „Bewegung reduzieren“).
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from './Schrift';
import { Cover } from './Cover';
import { HoloGlanz } from './Glanz';
import { Stufe } from '../lib/seltenheit';
import { Titel } from '../lib/titel';
import { F } from '../theme';

export type Metall = 'bronze' | 'silber' | 'gold' | 'schwarz';

export const METALL_FUER: Record<Stufe, Metall> = {
  gewoehnlich: 'bronze',
  gefragt: 'silber',
  selten: 'gold',
  raritaet: 'schwarz',
};

export const METALL_NAME: Record<Metall, string> = {
  bronze: 'BRONZE',
  silber: 'GEFRAGT',
  gold: '✦ SELTEN',
  schwarz: '✦✦ RARITÄT',
};

/** Verlauf je Metall (dunkel – hell – mittel – hell – dunkel ergibt den Schimmer), Schrift- und Rahmenfarbe. */
const METALL: Record<Metall, { verlauf: [string, string, string, string, string]; schrift: string; rahmen: string; akzent: string }> = {
  bronze: { verlauf: ['#7a4c22', '#d9a06a', '#a86b38', '#e3b07c', '#7a4c22'], schrift: F.tinte, rahmen: F.tinte, akzent: F.tinte },
  silber: { verlauf: ['#7f868e', '#f3f5f7', '#b3b9c0', '#f3f5f7', '#7f868e'], schrift: F.tinte, rahmen: F.tinte, akzent: F.tinte },
  gold: { verlauf: ['#a87a06', '#ffe27a', '#d9a72c', '#fff0a8', '#a87a06'], schrift: F.tinte, rahmen: F.tinte, akzent: F.tinte },
  schwarz: { verlauf: ['#0b0b0a', '#3d3c38', '#1d1d1b', '#34332f', '#0b0b0a'], schrift: F.papier, rahmen: F.gelb, akzent: F.gelb },
};
const REGENBOGEN = ['#e86435', '#eecb33', '#367d47', '#2f6db5', '#7a226f', '#dd2a4b'] as const;

export interface KartenInhalt {
  titel: Titel;
  /** angezeigter Preis (die Feier zählt ihn hoch) */
  preis: number | null;
  stufe: Stufe;
  /** „Bronze/Silber“ ohne Beleg o. ä. – kleiner Vermerk */
  pruefen?: boolean;
  /** Worum geht's – ein Satz */
  kurz?: string | null;
  /** Kategorie- oder Fachhinweis unter dem Preis, z. B. „Regal“ */
  ort?: string | null;
}

export function BuchKarte({ inhalt, breite, bewegung }: { inhalt: KartenInhalt; breite: number; bewegung: boolean }) {
  const metall = METALL_FUER[inhalt.stufe];
  const m = METALL[metall];
  const schwarz = metall === 'schwarz';
  const glanz = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!bewegung) return;
    const lauf = Animated.loop(
      Animated.sequence([
        Animated.timing(glanz, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(schwarz ? 900 : 2200),
        Animated.timing(glanz, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    lauf.start();
    return () => lauf.stop();
  }, [bewegung, schwarz]);

  const p = inhalt.preis;
  const euro = p == null ? '—' : String(Math.floor(p));
  const cent = p == null ? '' : `,${String(Math.round((p % 1) * 100)).padStart(2, '0')}`;
  const laenge = inhalt.titel.titel.length;
  const titelGroesse = laenge > 90 ? 15 : laenge > 55 ? 17 : laenge > 30 ? 19 : 21;
  const coverBreite = Math.round(breite * 0.34);

  return (
    <View style={[st.karte, { width: breite, borderColor: m.rahmen }]}>
      <LinearGradient colors={m.verlauf} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {schwarz && (
        <LinearGradient colors={REGENBOGEN} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { opacity: 0.16 }]} />
      )}
      {/* Wandernder Glanzstreifen über dem Metall */}
      {bewegung && (
        <Animated.View
          pointerEvents="none"
          style={[
            st.glanz,
            {
              width: breite * 0.35,
              opacity: schwarz ? 0.22 : 0.45,
              transform: [{ translateX: glanz.interpolate({ inputRange: [0, 1], outputRange: [-breite, breite * 1.4] }) }, { rotate: '18deg' }],
            },
          ]}
        />
      )}

      <View style={st.oben}>
        <View style={{ flex: 1 }}>
          <Text style={[st.euro, { color: m.schrift }]}>
            {euro}
            <Text style={[st.cent, { color: m.schrift }]}>{cent}</Text>
          </Text>
          <Text style={[st.einheit, { color: m.schrift }]}>EURO</Text>
          <Text style={[st.stufe, { color: m.akzent }]}>{METALL_NAME[metall]}</Text>
          {inhalt.ort ? <Text style={[st.ort, { color: m.schrift }]}>{inhalt.ort}</Text> : null}
          {inhalt.pruefen ? <Text style={[st.ort, { color: m.schrift }]}>· prüfen</Text> : null}
        </View>
        <View style={[st.coverRahmen, { borderColor: m.rahmen }]}>
          <HoloGlanz aktiv={bewegung && schwarz} breite={coverBreite}>
            <Cover isbn={inhalt.titel.isbn} url={inhalt.titel.coverUrl} style={{ width: coverBreite, height: coverBreite * 1.45, backgroundColor: F.sand }} iconGroesse={30} />
          </HoloGlanz>
        </View>
      </View>

      <View style={[st.band, { borderTopColor: m.rahmen }]}>
        <Text style={[st.titel, { fontSize: titelGroesse, color: m.schrift }]}>{inhalt.titel.titel}</Text>
        <Text style={[st.meta, { color: m.schrift }]}>
          {[inhalt.titel.autoren[0]?.split(',').reverse().join(' ').trim(), inhalt.titel.verlag, inhalt.titel.jahr].filter(Boolean).join(' · ')}
        </Text>
        {inhalt.kurz ? <Text style={[st.kurz, { color: m.schrift }]}>{inhalt.kurz}</Text> : null}
      </View>
      {schwarz && (
        <View style={st.regenbogen}>
          {REGENBOGEN.map((f) => (
            <View key={f} style={{ flex: 1, backgroundColor: f }} />
          ))}
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  karte: { borderWidth: 3, padding: 12, overflow: 'hidden' },
  glanz: { position: 'absolute', top: -60, bottom: -60, backgroundColor: '#fff' },
  oben: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  euro: { fontSize: 46, fontWeight: '800', lineHeight: 48, fontVariant: ['tabular-nums'] },
  cent: { fontSize: 22, fontWeight: '800' },
  einheit: { fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  stufe: { fontSize: 13, fontWeight: '800', letterSpacing: 1, marginTop: 10 },
  ort: { fontSize: 11, fontWeight: '700', marginTop: 2, opacity: 0.85 },
  coverRahmen: { borderWidth: 2 },
  band: { borderTopWidth: 2, marginTop: 12, paddingTop: 8 },
  titel: { fontWeight: '800', letterSpacing: -0.3 },
  meta: { fontSize: 12, marginTop: 2, opacity: 0.85 },
  kurz: { fontSize: 12.5, marginTop: 6, lineHeight: 17 },
  regenbogen: { flexDirection: 'row', height: 6, marginHorizontal: -12, marginBottom: -12, marginTop: 10 },
});
