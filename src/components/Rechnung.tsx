// Kurze Rechentabelle fürs Auspreisen: links die Begründung, rechts der Betrag.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './Schrift';
import { Rechenschritt } from '../lib/preis';
import { F } from '../theme';
import { Icon } from './Teile';

interface Props {
  schritte: Rechenschritt[];
  notizen?: string[];
  /** Farbe der Kategorie – hebt den Endbetrag hervor */
  farbe: string;
}

export function Rechnung({ schritte, notizen, farbe }: Props) {
  return (
    <View style={st.tabelle}>
      {schritte.map((s, i) => {
        if (s.art === 'wechsel') {
          return (
            <View key={i} style={st.wechsel}>
              <Icon name="archive-arrow-down" size={14} farbe={farbe} />
              <Text style={[st.wechselText, { color: farbe }]}>{s.label}</Text>
            </View>
          );
        }
        if (s.art === 'grenze') {
          return (
            <Text key={i} style={[st.notiz, i > 0 && st.linie]}>
              {s.label}
            </Text>
          );
        }
        const ende = s.art === 'raster';
        return (
          <View key={i} style={[st.zeile, i > 0 && st.linie]}>
            <Text style={[st.label, s.art === 'anker' && st.ankerLabel, s.art === 'summe' && st.summeLabel]} numberOfLines={2}>
              {s.label}
            </Text>
            <Text
              style={[
                st.wert,
                s.art === 'abschlag' && st.abschlag,
                s.art === 'zuschlag' && st.zuschlag,
                ende && [st.ende, { color: farbe }],
              ]}
            >
              {s.wert}
            </Text>
          </View>
        );
      })}
      {notizen?.map((n, i) => (
        <Text key={`n${i}`} style={st.notiz}>
          {n}
        </Text>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  tabelle: { borderWidth: 2, borderColor: F.tinte, marginTop: 10, backgroundColor: F.karte, paddingHorizontal: 12, paddingVertical: 4 },
  zeile: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, paddingVertical: 7 },
  linie: { borderTopWidth: 2, borderTopColor: F.tinte },
  label: { flex: 1, fontSize: 13, color: F.grau },
  ankerLabel: { color: F.tinte, fontWeight: '600' },
  summeLabel: { fontWeight: '900', color: F.tinte },
  wert: { fontSize: 15, fontWeight: '700', color: F.tinte, fontVariant: ['tabular-nums'] },
  abschlag: { color: F.rot, fontWeight: '600' },
  zuschlag: { color: F.gruen, fontWeight: '600' },
  ende: { fontSize: 18, fontWeight: '900' },
  wechsel: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  wechselText: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  notiz: { fontSize: 11, color: F.grau, paddingVertical: 3 },
});
