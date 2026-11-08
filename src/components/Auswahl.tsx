// Zwei Auswahl-Dialoge: Treffer wählen (welche Ausgabe?) und OCR-Zeilen einordnen.
import React, { useMemo, useState } from 'react';
import { FlatList, Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './Schrift';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Titel, titelZeile2 } from '../lib/titel';
import { OcrZeile, Rolle } from '../lib/suche';
import { BEREICH, F, RADIUS, ABSTAND } from '../theme';
import { facetten, Filter, filtere } from '../lib/ausgaben';
import { Chip, Genres, Icon, IconName, Knopf } from './Teile';
import { Cover } from './Cover';

// Farben wie bei der OCR-Zuordnung: Verlag lila, Jahr grün
const FILTER_ZEILEN: { gruppe: keyof Filter; icon: IconName; farbe: string }[] = [
  { gruppe: 'bindung', icon: 'book-open-variant', farbe: F.orange },
  { gruppe: 'verlag', icon: 'domain', farbe: F.lila },
  { gruppe: 'jahr', icon: 'calendar', farbe: F.gruen },
];

export function TrefferListe(p: {
  treffer: Titel[];
  gesamt: number;
  onWaehle: (t: Titel) => void;
  onOhneTreffer: () => void;
  onAbbrechen: () => void;
}) {
  const rand = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>({});
  const gefiltert = useMemo(() => filtere(p.treffer, filter), [p.treffer, filter]);
  const chips = useMemo(() => facetten(p.treffer, filter), [p.treffer, filter]);
  const aktiv = Object.values(filter).some(Boolean);
  const zahl = aktiv
    ? `${gefiltert.length} von ${p.treffer.length}`
    : p.gesamt > p.treffer.length
      ? `${p.treffer.length} von ${p.gesamt}`
      : String(p.treffer.length);
  const umschalten = (g: keyof Filter, wert: string) =>
    setFilter((f) => ({ ...f, [g]: f[g] === wert ? undefined : wert }));

  return (
    <Modal visible animationType="slide" onRequestClose={p.onAbbrechen}>
      <StatusBar style="dark" />
      <View style={[st.wurzel, { paddingTop: rand.top + ABSTAND, paddingBottom: rand.bottom + ABSTAND }]}>
        <Ueberschrift
          icon={p.treffer.length === 0 ? 'book-remove' : 'book-multiple'}
          text={p.treffer.length === 0 ? 'Nichts gefunden' : `Welche Ausgabe? (${zahl})`}
        />
        {FILTER_ZEILEN.map(({ gruppe, icon, farbe }) =>
          chips[gruppe].length === 0 ? null : (
            <View key={gruppe} style={st.filterZeile}>
              <Icon name={icon} size={18} farbe={farbe} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.filterChips} keyboardShouldPersistTaps="handled">
                {chips[gruppe].map((c) => (
                  <Chip
                    key={c.wert}
                    klein
                    farbe={farbe}
                    aktiv={filter[gruppe] === c.wert}
                    label={`${c.label} · ${c.anzahl}`}
                    onPress={() => umschalten(gruppe, c.wert)}
                  />
                ))}
              </ScrollView>
            </View>
          ),
        )}
        {aktiv && (
          <Pressable onPress={() => setFilter({})} style={st.zuruecksetzen} hitSlop={8}>
            <Icon name="filter-remove" size={16} farbe={F.grau} />
            <Text style={st.klein}>Filter zurücksetzen</Text>
          </Pressable>
        )}
        {aktiv && gefiltert.length === 0 && <Text style={[st.klein, { marginTop: 12 }]}>Keine Ausgabe passt zu allen Filtern.</Text>}
        <FlatList
          data={gefiltert}
          keyExtractor={(t, i) => t.id ?? String(i)}
          renderItem={({ item }) => (
            <Pressable onPress={() => p.onWaehle(item)} style={st.zeile}>
              <Cover isbn={item.isbn} url={item.coverUrl} style={st.cover} />
              <View style={{ flex: 1 }}>
                <Text style={st.titel}>{item.titel}</Text>
                <Text style={st.klein}>{item.autoren.join('; ')}</Text>
                <Text style={st.klein}>{[titelZeile2(item), item.umfang, item.einband].filter(Boolean).join(' · ')}</Text>
                <Genres sachgruppen={item.sachgruppen} />
              </View>
              <Icon name="chevron-right" size={24} farbe={F.grau} />
            </Pressable>
          )}
        />
        <View style={st.fuss}>
          <Knopf label="Abbrechen" icon="close" leise farbe={F.grau} onPress={p.onAbbrechen} stil={{ flex: 1 }} />
          <Knopf label="Ohne Treffer weiter" icon="arrow-right" farbe={F.blau} onPress={p.onOhneTreffer} stil={{ flex: 1 }} />
        </View>
      </View>
    </Modal>
  );
}

const ROLLEN: Rolle[] = ['titel', 'autor', 'verlag', 'jahr', 'ignorieren'];
const ROLLEN_LABEL: Record<Rolle, string> = { titel: 'Titel', autor: 'Autor:in', verlag: 'Verlag', jahr: 'Jahr', ignorieren: '–' };
const ROLLEN_FARBE: Record<Rolle, string> = { titel: F.rot, autor: F.blau, verlag: F.lila, jahr: F.gruen, ignorieren: F.grau };

/** Wie ManaBox' strikter Modus: Die App schlägt vor, der Mensch korrigiert mit einem Tipp. */
export function OcrSheet(p: {
  bildUri: string;
  zeilen: OcrZeile[];
  rollenStart: Rolle[];
  kiVerfuegbar: boolean;
  /** Expo Go: keine Texterkennung an Bord */
  ohneTexterkennung?: boolean;
  laedt: boolean;
  onSuchen: (rollen: Rolle[]) => void;
  onKi: () => void;
  onAbbrechen: () => void;
}) {
  const [rollen, setRollen] = useState<Rolle[]>(p.rollenStart);
  const rand = useSafeAreaInsets();
  const weiter = (i: number) =>
    setRollen((r) => r.map((x, j) => (j === i ? ROLLEN[(ROLLEN.indexOf(x) + 1) % ROLLEN.length] : x)));

  return (
    <Modal visible animationType="slide" onRequestClose={p.onAbbrechen}>
      <StatusBar style="dark" />
      <View style={[st.wurzel, { paddingTop: rand.top + ABSTAND, paddingBottom: rand.bottom + ABSTAND }]}>
        <Ueberschrift icon="text-recognition" text="Was steht auf der Titelseite?" />
        <View style={st.tippReihe}>
          <Icon name="gesture-tap" size={16} farbe={F.grau} />
          <Text style={st.klein}>Tippe eine Zeile an, um sie umzuordnen.</Text>
        </View>
        <ScrollView style={{ marginTop: 10 }}>
          <Image source={{ uri: p.bildUri }} style={st.foto} resizeMode="contain" />
          {p.zeilen.length === 0 && (
            <Text style={st.klein}>
              {p.ohneTexterkennung
                ? 'In dieser Testversion (Expo Go) gibt es keine Texterkennung – „KI“ fragen oder Suche von Hand.'
                : 'Kein Text erkannt. Fraktur kann die Texterkennung nicht – dann „KI fragen“ oder Suche von Hand.'}
            </Text>
          )}
          {p.zeilen.map((z, i) => (
            <Pressable key={i} onPress={() => weiter(i)} style={st.ocrZeile}>
              <View style={[st.rolle, { backgroundColor: ROLLEN_FARBE[rollen[i]] }]}>
                <Text style={st.rolleText}>{ROLLEN_LABEL[rollen[i]]}</Text>
              </View>
              <Text style={[st.ocrText, rollen[i] === 'ignorieren' && { color: F.grau }]}>{z.text}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={st.fuss}>
          <Knopf label="Abbrechen" icon="close" leise farbe={F.grau} onPress={p.onAbbrechen} stil={{ flex: 1 }} />
          {p.kiVerfuegbar && <Knopf label="KI" icon="robot" farbe={F.lila} onPress={p.onKi} deaktiviert={p.laedt} stil={{ flex: 1 }} />}
          <Knopf label={p.laedt ? 'Suche …' : 'Suchen'} icon="magnify" farbe={BEREICH.scan} onPress={() => p.onSuchen(rollen)} deaktiviert={p.laedt} stil={{ flex: 1 }} />
        </View>
      </View>
    </Modal>
  );
}

function Ueberschrift({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={st.kopf}>
      <Icon name={icon} size={24} farbe={BEREICH.scan} />
      <Text style={st.ueberschrift}>{text}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  wurzel: { flex: 1, backgroundColor: F.papier, paddingHorizontal: ABSTAND },
  kopf: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  ueberschrift: { flex: 1, fontSize: 20, fontWeight: '900', color: F.tinte },
  tippReihe: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  // Chips bringen unten 8 px Abstand mit → oben genauso viel, damit das Icon mittig sitzt
  filterZeile: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 8 },
  filterChips: { alignItems: 'center', paddingRight: ABSTAND },
  zuruecksetzen: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 6 },
  zeile: { borderWidth: 2, borderColor: F.tinte, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: F.karte, padding: 12, marginTop: 8 },
  cover: { borderWidth: 2, borderColor: F.tinte, width: 44, height: 66, backgroundColor: F.linie },
  titel: { fontSize: 16, fontWeight: '700', color: F.tinte },
  klein: { fontSize: 13, color: F.grau, marginTop: 2 },
  fuss: { flexDirection: 'row', gap: 10, paddingTop: 12 },
  foto: { borderWidth: 2, borderColor: F.tinte, width: '100%', height: 220, backgroundColor: '#000', marginBottom: 10 },
  ocrZeile: { borderWidth: 2, borderColor: F.tinte, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: F.karte, padding: 10, marginTop: 6 },
  rolle: { borderWidth: 2, borderColor: F.tinte, paddingHorizontal: 8, paddingVertical: 4, minWidth: 72, alignItems: 'center' },
  rolleText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  ocrText: { flex: 1, fontSize: 16, color: F.tinte },
});
