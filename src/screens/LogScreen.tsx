// Such-Log mit kleiner Auswertung und CSV-Export für spätere Analysen.
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Text } from '../components/Schrift';
import { LogEintrag, logLaden, statistik, Statistik, exportCsv } from '../db';
import { euro, KATEGORIE_LABEL, Kategorie } from '../lib/preis';
import { aufFarbe, BEREICH, F, hell, KATEGORIE_FARBE, ABSTAND, schatten } from '../theme';
import { Icon, IconName, Knopf, Kopf } from '../components/Teile';
import { StufenBadge } from '../components/Glanz';
import { seltenheitAusEintrag } from '../dienste';
import { Einstellungen } from '../einstellungen';

const METHODE: Record<string, string> = {
  barcode: 'Barcode', isbn_getippt: 'ISBN getippt', foto_ocr: 'Foto', foto_isbn: 'Foto (ISBN)', foto_ki: 'Foto + KI', manuell: 'Hand',
};
const METHODE_ICON: Record<string, IconName> = {
  barcode: 'barcode', isbn_getippt: 'keyboard', foto_ocr: 'camera', foto_isbn: 'camera', foto_ki: 'robot', manuell: 'magnify',
};

export function LogScreen({ sichtbar, einst }: { sichtbar: boolean; einst: Einstellungen }) {
  const [log, setLog] = useState<LogEintrag[]>([]);
  const [stat, setStat] = useState<Statistik | null>(null);
  const [laedt, setLaedt] = useState(false);

  const laden = useCallback(async () => {
    setLaedt(true);
    const [l, s] = await Promise.all([logLaden(), statistik()]);
    setLog(l);
    setStat(s);
    setLaedt(false);
  }, []);

  useEffect(() => {
    if (sichtbar) laden();
  }, [sichtbar]);

  return (
    <View style={st.wurzel}>
      <Kopf titel="Verlauf" icon="chart-timeline-variant" farbe={BEREICH.log} />
      <FlatList
        data={log}
        keyExtractor={(e) => String(e.id)}
        refreshControl={<RefreshControl refreshing={laedt} onRefresh={laden} />}
        contentContainerStyle={{ padding: ABSTAND, paddingBottom: 100 }}
        ListHeaderComponent={
          stat ? (
            <View style={{ marginBottom: 12 }}>
              <Text style={st.ueberschrift}>Auswertung</Text>
              <View style={st.kacheln}>
                <Kachel zahl={String(stat.suchen)} text="Suchen" icon="magnify" farbe={F.blau} />
                <Kachel zahl={stat.suchen ? `${Math.round((stat.mitTreffer / stat.suchen) * 100)} %` : '–'} text="mit Treffer" icon="target" farbe={F.orange} />
                <Kachel zahl={String(stat.ausgepreist)} text="ausgepreist" icon="tag" farbe={F.lila} />
                <Kachel zahl={euro(stat.summe)} text="Summe" icon="cash" farbe={F.gruen} />
              </View>
              <Text style={st.klein}>
                {stat.proMethode.map((m) => `${METHODE[m.methode] ?? m.methode}: ${m.n}`).join(' · ')}
              </Text>
              <Text style={st.klein}>
                {stat.proKategorie.filter((k) => k.kategorie).map((k) => `${KATEGORIE_LABEL[k.kategorie as Kategorie]}: ${k.n}`).join(' · ')}
              </Text>
              <Text style={[st.ueberschrift, { marginTop: 16 }]}>Letzte Suchen</Text>
            </View>
          ) : undefined
        }
        renderItem={({ item: e }) => (
          <View style={st.zeile}>
            <View style={st.methode}>
              <Icon name={METHODE_ICON[e.methode] ?? 'magnify'} size={18} farbe={F.blau} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.titel} numberOfLines={1}>{e.titel ?? e.suchbegriff}</Text>
              <Text style={st.klein}>
                {new Date(e.zeit).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })} · {METHODE[e.methode] ?? e.methode} · {e.treffer_anzahl} Treffer
                {e.markt_anzahl != null ? ` · ${e.markt_anzahl} Angebote` : ''}
              </Text>
            </View>
            {e.aktion === 'ausgepreist' && <ListenStufe e={e} einst={einst} />}
            {e.aktion === 'ausgepreist' ? (
              <View style={[st.preisPille, { backgroundColor: e.kategorie ? KATEGORIE_FARBE[e.kategorie] : F.gruen }]}>
                <Text style={[st.preisPilleText, { color: aufFarbe(e.kategorie ? KATEGORIE_FARBE[e.kategorie] : F.gruen) }]}>{euro(e.endpreis ?? 0)}</Text>
              </View>
            ) : (
              <Text style={[st.aktion, e.aktion === 'verworfen' && { color: F.grau }]}>{e.aktion}</Text>
            )}
          </View>
        )}
      />
      <View style={st.fuss}>
        <Knopf label="Verlauf als CSV teilen" icon="share-variant" farbe={BEREICH.log} onPress={() => exportCsv(false)} />
      </View>
    </View>
  );
}

function Kachel({ zahl, text, icon, farbe }: { zahl: string; text: string; icon: IconName; farbe: string }) {
  return (
    <View style={[st.kachel, { borderTopColor: farbe }]}>
      <Icon name={icon} size={22} farbe={farbe} />
      <Text style={st.kachelZahl}>{zahl}</Text>
      <Text style={st.klein}>{text}</Text>
    </View>
  );
}

function ListenStufe({ e, einst }: { e: LogEintrag; einst: Einstellungen }) {
  const s = seltenheitAusEintrag(e, einst.seltenheit);
  if (!s || (s.stufe !== 'selten' && s.stufe !== 'raritaet')) return null;
  return <StufenBadge s={s} klein />;
}

const st = StyleSheet.create({
  wurzel: { flex: 1, backgroundColor: F.papier },
  ueberschrift: { fontSize: 13, fontWeight: '800', color: F.grau, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  kacheln: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  // wie Fountains Kacheln: weiß, Tintenrahmen, dicke Farbkante oben, harter Schatten
  kachel: { padding: 12, minWidth: '45%', flexGrow: 1, backgroundColor: F.karte, borderWidth: 2, borderColor: F.tinte, borderTopWidth: 8, marginRight: 4, marginBottom: 4, ...schatten(F.tinte, 4) },
  kachelZahl: { fontSize: 30, fontWeight: '800', marginTop: 4, color: F.tinte },
  methode: { borderWidth: 2, borderColor: F.tinte, width: 34, height: 34, backgroundColor: hell(F.blau, 0.12), alignItems: 'center', justifyContent: 'center' },
  preisPille: { borderWidth: 2, borderColor: F.tinte, paddingHorizontal: 8, paddingVertical: 3 },
  preisPilleText: { color: '#fff', fontWeight: '900', fontSize: 14 },
  klein: { fontSize: 13, color: F.grau, marginTop: 2 },
  zeile: { borderWidth: 2, borderColor: F.tinte, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: F.karte, padding: 10, marginTop: 6 },
  titel: { fontSize: 15, fontWeight: '700', color: F.tinte },
  aktion: { fontSize: 14, fontWeight: '700', color: F.tinte },
  fuss: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: ABSTAND, paddingBottom: 12, backgroundColor: F.papier, borderTopWidth: 2, borderTopColor: F.tinte },
});
