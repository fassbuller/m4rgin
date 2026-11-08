// Liste „Zuletzt angesehen“ unter der Suche von Hand – ein Tipp sucht das Buch erneut.
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Schrift';
import { LogEintrag, logLaden } from '../db';
import { zuletzt } from '../lib/zuletzt';
import { euro } from '../lib/preis';
import { F, KATEGORIE_FARBE, RADIUS } from '../theme';
import { Abschnitt, Icon, KATEGORIE_ICON } from './Teile';
import { Cover } from './Cover';

/** neuLaden ändert sich, wenn der Reiter sichtbar wird oder ein Buch dazukam. */
export function Zuletzt({ neuLaden, onWaehle }: { neuLaden: unknown; onWaehle: (e: LogEintrag) => void }) {
  const [liste, setListe] = useState<LogEintrag[]>([]);
  useEffect(() => {
    logLaden(60)
      .then((l) => setListe(zuletzt(l)))
      .catch(() => undefined);
  }, [neuLaden]);

  if (!liste.length) return null;
  return (
    <View>
      <Abschnitt titel="Zuletzt angesehen" icon="history" farbe={F.grau} />
      {liste.map((e) => (
        <Pressable key={e.id} onPress={() => onWaehle(e)} style={({ pressed }) => [st.zeile, pressed && { opacity: 0.7 }]}>
          <Cover isbn={e.isbn ?? undefined} style={st.cover} iconGroesse={16} />
          <View style={{ flex: 1 }}>
            <Text style={st.titel} numberOfLines={1}>{e.titel ?? `ISBN ${e.isbn}`}</Text>
            <Text style={st.klein} numberOfLines={1}>{[e.autor?.split(';')[0], zeitText(e.zeit)].filter(Boolean).join(' · ')}</Text>
          </View>
          {e.aktion === 'ausgepreist' && e.endpreis != null ? (
            <View style={[st.preis, { backgroundColor: KATEGORIE_FARBE[e.kategorie ?? 'regal'] }]}>
              {e.kategorie && <Icon name={KATEGORIE_ICON[e.kategorie]} size={12} farbe="#fff" />}
              <Text style={st.preisText}>{euro(e.endpreis)}</Text>
            </View>
          ) : e.aktion === 'verworfen' ? (
            <Text style={st.klein}>verworfen</Text>
          ) : null}
          <Icon name="magnify" size={20} farbe={F.grau} />
        </Pressable>
      ))}
    </View>
  );
}

function zeitText(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const heute = new Date();
  const gleicherTag = d.toDateString() === heute.toDateString();
  return gleicherTag
    ? d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

const st = StyleSheet.create({
  zeile: { borderWidth: 2, borderColor: F.tinte, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: F.karte, padding: 8, marginBottom: 6 },
  cover: { borderWidth: 2, borderColor: F.tinte, width: 30, height: 44, backgroundColor: F.linie },
  titel: { fontSize: 15, fontWeight: '700', color: F.tinte },
  klein: { fontSize: 12, color: F.grau, marginTop: 1 },
  preis: { borderWidth: 2, borderColor: F.tinte, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3 },
  preisText: { color: '#fff', fontWeight: '800', fontSize: 12 },
});
