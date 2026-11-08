// Das ManaBox-artige Overlay: erscheint sofort beim Scannen, Kamera läuft weiter.
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Schrift';
import { Titel } from '../lib/titel';
import { MarktErgebnis } from '../lib/markt';
import { euro, PreisErgebnis } from '../lib/preis';
import { Signal } from '../lib/trend';
import { BEREICH, F, KASTEN, KATEGORIE_FARBE, schatten } from '../theme';
import { Genres, Icon, KategorieBadge } from './Teile';
import { Cover } from './Cover';
import { Seltenheit } from '../lib/seltenheit';
import { Funkeln, GlanzRahmen, HoloGlanz, SchimmerText, SeltenheitsInfo, STUFE_FARBE, StufenBadge } from './Glanz';

interface Props {
  titel: Titel | null;
  suchbegriff: string;
  laedt: boolean;
  fehler?: string;
  markt: MarktErgebnis | null;
  marktLaedt: boolean;
  vorlaeufig: PreisErgebnis | null;
  trends: Signal[] | null;
  seltenheit: Seltenheit | null;
  /** Animationen erlaubt (Einstellung + Gerät) */
  bewegung: boolean;
  onOeffnen: () => void;
  onSchliessen: () => void;
}

export function LiveKarte(p: Props) {
  const akzent = p.vorlaeufig ? KATEGORIE_FARBE[p.vorlaeufig.kategorie] : BEREICH.scan;
  const quelleFehlt = p.markt?.status.some((s) => !s.ok);
  const s = p.seltenheit;
  const voll = !!s && s.effekt === 'voll' && p.bewegung;
  const glanz = voll && s!.stufe === 'raritaet';
  const funkeln = voll && (s!.stufe === 'selten' || s!.stufe === 'raritaet');
  return (
    <GlanzRahmen s={s} bewegung={p.bewegung} plopp style={st.rahmen}>
    <Pressable onPress={p.titel ? p.onOeffnen : undefined} style={[st.karte, { borderLeftColor: akzent }]}>
      <Pressable onPress={p.onSchliessen} style={st.zu} hitSlop={12} accessibilityLabel="Karte schließen">
        <Icon name="close" size={22} farbe={F.tinte} />
      </Pressable>

      {p.laedt && (
        <View style={st.reihe}>
          <ActivityIndicator color={F.tinte} />
          <Text style={st.weiss}>Suche {p.suchbegriff} …</Text>
        </View>
      )}
      {p.fehler && (
        <View style={st.reihe}>
          <Icon name="information" size={18} farbe={F.hand} />
          <Text style={[st.weiss, { flex: 1 }]}>{p.fehler}</Text>
        </View>
      )}

      {p.titel && (
        <View style={st.reihe}>
          <Funkeln aktiv={funkeln} farbe={s ? STUFE_FARBE[s.stufe] : F.gelb}>
            <HoloGlanz aktiv={glanz} breite={44}>
              <Cover isbn={p.titel.isbn} url={p.titel.coverUrl} style={st.cover} iconFarbe={F.grau} />
            </HoloGlanz>
          </Funkeln>
          <View style={{ flex: 1 }}>
            <SchimmerText aktiv={funkeln} grund={F.tinte} style={st.titel} numberOfLines={2}>{p.titel.titel}</SchimmerText>
            <Text style={st.grau} numberOfLines={1}>
              {[p.titel.autoren[0], p.titel.verlag, p.titel.jahr].filter(Boolean).join(' · ')}
            </Text>
            <View style={{ marginTop: 4 }}>
              <Genres sachgruppen={p.titel.sachgruppen} />
            </View>
          </View>
          <View style={st.rechts}>
            {p.marktLaedt ? (
              <ActivityIndicator color={F.tinte} />
            ) : p.vorlaeufig ? (
              <>
                <KategorieBadge k={p.vorlaeufig.kategorie} />
                <Text style={st.preis}>≈ {euro(p.vorlaeufig.vorschlag)}</Text>
              </>
            ) : (
              <Text style={st.grau}>kein Preis</Text>
            )}
          </View>
        </View>
      )}

      {p.markt && (
        <View style={[st.reihe, { marginTop: 8 }]}>
          <Icon name={p.markt.lage.anzahl > 0 ? 'store-search' : 'store-off'} size={16} farbe={F.tinte} />
          <Text style={st.lage}>
            {p.markt.lage.anzahl > 0
              ? `${p.markt.lage.anzahl} Angebote · ab ${euro(p.markt.lage.min!)} · Median ${euro(p.markt.lage.median!)}`
              : 'Keine Online-Angebote gefunden'}
          </Text>
          {quelleFehlt && <Icon name="alert" size={16} farbe={F.orange} />}
        </View>
      )}
      {p.trends && p.trends.some((x) => x.text) && (
        <View style={[st.reihe, { marginTop: 4 }]}>
          <Icon name="trending-up" size={16} farbe={F.hand} />
          <Text style={st.trends}>{p.trends.map((x) => x.text).filter(Boolean).join('   ')}</Text>
        </View>
      )}
      {s && s.stufe !== 'gewoehnlich' && (
        <View style={{ marginTop: 8 }}>
          <StufenBadge s={s} />
          <SeltenheitsInfo s={s} />
        </View>
      )}
      {p.titel && (
        <View style={st.tippReihe}>
          <Icon name="gesture-tap" size={14} farbe={F.grau} />
          <Text style={st.tipp}>Antippen zum Auspreisen · weiter scannen ersetzt die Karte</Text>
        </View>
      )}
    </Pressable>
    </GlanzRahmen>
  );
}

const st = StyleSheet.create({
  // Der Glanz-Rahmen sitzt außen und trägt Rundung + Abstand, damit er die Karte sauber umschließt
  rahmen: { marginLeft: 12, marginRight: 17 },
  // Papierzettel mit hartem Schatten wie Fountains Pinnwand-Zettel
  karte: { backgroundColor: F.papier, padding: 14, ...KASTEN, borderLeftWidth: 7, ...schatten() },
  zu: { position: 'absolute', right: 8, top: 8, zIndex: 2 },
  reihe: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingRight: 24 },
  cover: { borderWidth: 2, borderColor: F.tinte, width: 44, height: 66, backgroundColor: F.sand },
  titel: { color: F.tinte, fontSize: 17, fontWeight: '800' },
  weiss: { color: F.tinte, fontSize: 15 },
  grau: { color: F.grau, fontSize: 13 },
  rechts: { alignItems: 'flex-end', minWidth: 90 },
  preis: { color: F.tinte, fontSize: 26, fontWeight: '800', marginTop: 4, fontVariant: ['tabular-nums'] },
  lage: { flex: 1, color: F.tinte, fontSize: 13, fontWeight: '600' },
  trends: { flex: 1, color: F.hand, fontSize: 13, fontWeight: '700' },
  tippReihe: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  tipp: { color: F.grau, fontSize: 11 },
});
