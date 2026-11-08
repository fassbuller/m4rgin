// Der Stapel: benannte Arbeitsvorräte. Genau einer ist aktiv (Bücher landen dort),
// die übrigen bleiben pausiert und lassen sich weiterführen oder umbenennen.
// Aufgeräumt: Wechseln, Umbenennen, Pausieren, CSV und Sortieren stecken im Stapel-Blatt (Tipp auf den Namen),
// die Liste ist nach Kategorie gruppiert (so trägt man die Bücher weg), jedes Buch hat zwei Zeilen + Preis.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, Modal, PanResponder, Pressable, SectionList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, TextInput } from '../components/Schrift';
import {
  LogEintrag, Stapel, ausStapelEntfernen, endpreisAendern, exportCsv,
  stapelAbschliessen, stapelAktivieren, stapelAnlegen, stapelPausieren, stapelUmbenennen, stapelUebersicht,
} from '../db';
import { euro, Kategorie, KATEGORIE_LABEL, PreisRegeln, ZUSTAND_LABEL } from '../lib/preis';
import { BEREICHE, bereichFuerBuch, erstesFach } from '../lib/bereiche';
import { Einstellungen } from '../einstellungen';
import { Sortierung, stapelGruppen, stapelWert } from '../lib/stapelwert';
import { aufFarbe, BEREICH, F, ABSTAND, KASTEN, KATEGORIE_FARBE, SCHRIFT, ZUSTAND_FARBE } from '../theme';
import { Chip, Icon, IconName, Knopf, Kopf, Schritt } from '../components/Teile';
import { STUFE_FARBE } from '../components/Glanz';
import { seltenheitAusEintrag } from '../dienste';
import { StapelDetail } from '../components/StapelDetail';

interface Props {
  regeln: PreisRegeln;
  einst: Einstellungen;
  onGeaendert: () => void;
}

interface Dialog {
  /** null = neuen Stapel anlegen */
  id: number | null;
  name: string;
}

const SORTIERUNG_LABEL: Record<Sortierung, string> = { kategorie: 'Kategorie', preis: 'Preis', zeit: 'Zuletzt gescannt' };

export function StapelScreen({ regeln, einst, onGeaendert }: Props) {
  const [aktiv, setAktiv] = useState<Stapel | null>(null);
  const [alle, setAlle] = useState<Stapel[]>([]);
  const [eintraege, setEintraege] = useState<LogEintrag[]>([]);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [detail, setDetail] = useState<LogEintrag | null>(null);
  const [blatt, setBlatt] = useState(false);
  const [sortierung, setSortierung] = useState<Sortierung>('kategorie');
  const [schnell, setSchnell] = useState<LogEintrag | null>(null);

  const laden = useCallback(async () => {
    const u = await stapelUebersicht();
    setAktiv(u.aktiv);
    setAlle(u.alle);
    setEintraege(u.eintraege);
  }, []);

  useEffect(() => {
    laden().catch(() => undefined);
  }, [laden]);

  /** Nach jeder Änderung: eigenen Zustand und den Reiter-Zähler in App aktualisieren. */
  const geaendert = async () => {
    await laden();
    onGeaendert();
  };

  const wert = stapelWert(eintraege);
  const gruppen = stapelGruppen(eintraege, sortierung);

  const neuerStapel = () => {
    setBlatt(false);
    setDialog({ id: null, name: '' });
  };
  const umbenennen = () => {
    if (!aktiv) return;
    setBlatt(false);
    setDialog({ id: aktiv.id, name: aktiv.name });
  };

  const dialogSpeichern = async () => {
    if (!dialog) return;
    const name = dialog.name.trim();
    if (dialog.id == null) await stapelAnlegen(name || undefined);
    else if (name) await stapelUmbenennen(dialog.id, name);
    setDialog(null);
    await geaendert();
  };

  const weiter = async (s: Stapel) => {
    await stapelAktivieren(s.id);
    setBlatt(false);
    await geaendert();
  };

  const pausieren = async () => {
    if (!aktiv) return;
    await stapelPausieren(aktiv.id);
    await geaendert();
  };

  const abschliessen = () => {
    if (!aktiv) return;
    Alert.alert(
      `„${aktiv.name}“ abschließen?`,
      'Die Bücher verlassen den Stapel, bleiben aber im Verlauf erhalten.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Abschließen', onPress: async () => { await stapelAbschliessen(aktiv.id); await geaendert(); } },
      ],
    );
  };

  const entfernen = (e: LogEintrag, zurueck: () => void) =>
    Alert.alert('Aus dem Stapel entfernen?', e.titel ?? '', [
      { text: 'Nein', style: 'cancel', onPress: zurueck },
      { text: 'Entfernen', style: 'destructive', onPress: async () => { await ausStapelEntfernen(e.id); await geaendert(); } },
    ], { onDismiss: zurueck });

  const preis = async (e: LogEintrag, delta: number) => {
    const neu = Math.max(0.5, (e.endpreis ?? 0) + delta * regeln.raster);
    await endpreisAendern(e.id, neu);
    onGeaendert();
    setEintraege((alt) => alt.map((x) => (x.id === e.id ? { ...x, endpreis: neu } : x)));
    setSchnell((s) => (s && s.id === e.id ? { ...s, endpreis: neu } : s));
  };

  return (
    <View style={st.wurzel}>
      <Kopf
        titel={aktiv ? aktiv.name : 'Kein Stapel aktiv'}
        icon={aktiv ? 'bookshelf' : 'archive-off-outline'}
        farbe={BEREICH.stapel}
        onTitel={() => setBlatt(true)}
        rechts={
          <Pressable onPress={() => setBlatt(true)} style={st.mehr} hitSlop={8} accessibilityLabel="Stapel-Menü">
            <Icon name="dots-horizontal" size={22} />
          </Pressable>
        }
        unter={eintraege.length > 0 ? <Wert wert={wert} anzahl={eintraege.length} /> : null}
      />

      <SectionList
        sections={gruppen}
        keyExtractor={(e) => String(e.id)}
        contentContainerStyle={{ paddingBottom: 110 }}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={
          <View style={st.leer}>
            <Icon name="bookshelf" size={64} farbe={F.linie} />
            <Text style={st.leerHand}>{aktiv ? 'noch leer' : 'kein Stapel aktiv'}</Text>
            <Text style={[st.klein, { textAlign: 'center' }]}>
              {aktiv ? 'Im Scanner ausgepreiste Bücher landen hier.' : 'Oben auf den Namen tippen, um einen Stapel weiterzuführen oder neu zu beginnen.'}
            </Text>
          </View>
        }
        renderSectionHeader={({ section }) =>
          section.kategorie ? (
            <View style={[st.gruppe, { borderBottomColor: KATEGORIE_FARBE[section.kategorie] }]}>
              <Text style={st.gruppeName}>
                {KATEGORIE_LABEL[section.kategorie]} · {section.anzahl}
                {section.kategorie === 'lager' ? ' · vorläufig' : ''}
              </Text>
              <Text style={st.gruppeSumme}>{euro(section.summe)}</Text>
            </View>
          ) : (
            <View style={st.gruppe}>
              <Text style={st.gruppeName}>Nach {SORTIERUNG_LABEL[sortierung]} · {section.anzahl}</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <Zeile
            e={item}
            einst={einst}
            onOeffnen={() => setDetail(item)}
            onSchnell={() => setSchnell(item)}
            onEntfernen={(zurueck) => entfernen(item, zurueck)}
          />
        )}
      />

      <View style={st.fuss}>
        <Knopf label="Abschließen" icon="check-all" farbe={BEREICH.stapel} onPress={abschliessen} stil={{ flex: 1 }} deaktiviert={!aktiv || !eintraege.length} />
      </View>

      <StapelBlatt
        offen={blatt}
        alle={alle}
        aktiv={aktiv}
        sortierung={sortierung}
        hatBuecher={eintraege.length > 0}
        onZu={() => setBlatt(false)}
        onWeiter={weiter}
        onNeu={neuerStapel}
        onUmbenennen={umbenennen}
        onPausieren={async () => { setBlatt(false); await pausieren(); }}
        onCsv={() => { setBlatt(false); exportCsv(true); }}
        onSortierung={setSortierung}
      />

      {/* Schnellkorrektur: Preis lange drücken */}
      <Modal visible={schnell != null} transparent animationType="fade" onRequestClose={() => setSchnell(null)}>
        <Pressable style={st.dialogHintergrund} onPress={() => setSchnell(null)}>
          <Pressable style={st.dialog} onPress={() => undefined}>
            <Text style={st.dialogTitel} numberOfLines={2}>{schnell?.titel}</Text>
            <View style={st.schnellReihe}>
              <Schritt gross onPress={() => schnell && preis(schnell, -1)} />
              <Text style={st.schnellPreis}>{euro(schnell?.endpreis ?? 0)}</Text>
              <Schritt gross plus onPress={() => schnell && preis(schnell, 1)} />
            </View>
            <Knopf label="Fertig" icon="check" farbe={F.tinte} onPress={() => setSchnell(null)} stil={{ marginTop: 14 }} />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={dialog != null} transparent animationType="fade" onRequestClose={() => setDialog(null)}>
        <View style={st.dialogHintergrund}>
          <View style={st.dialog}>
            <Text style={st.dialogTitel}>{dialog?.id == null ? 'Neuer Stapel' : 'Stapel umbenennen'}</Text>
            <TextInput
              autoFocus
              style={st.dialogEingabe}
              value={dialog?.name ?? ''}
              onChangeText={(name) => setDialog((d) => (d ? { ...d, name } : d))}
              placeholder={dialog?.id == null ? 'z. B. Kiste Küche' : 'Name'}
              placeholderTextColor={F.grau}
              returnKeyType="done"
              onSubmitEditing={dialogSpeichern}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <Knopf label="Abbrechen" leise farbe={F.grau} onPress={() => setDialog(null)} stil={{ flex: 1 }} />
              <Knopf label="Speichern" icon="check" farbe={BEREICH.stapel} onPress={dialogSpeichern} stil={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>

      {detail && (
        <StapelDetail
          eintrag={detail}
          regeln={regeln}
          einst={einst}
          onSchliessen={() => setDetail(null)}
          onGespeichert={async () => {
            setDetail(null);
            await geaendert();
          }}
        />
      )}
    </View>
  );
}

/** Gesamtwert groß, daneben die Anzahl in Handschrift, darunter ein geteilter Balken Grabbel / Regal / Lager. */
function Wert({ wert, anzahl }: { wert: ReturnType<typeof stapelWert>; anzahl: number }) {
  const teile = (['grabbel', 'regal', 'lager'] as Kategorie[]).filter((k) => wert.je[k].summe > 0);
  return (
    <View style={{ marginTop: 6 }}>
      <View style={st.wertReihe}>
        <Text style={st.gross}>{euro(wert.gesamt)}</Text>
        <Text style={st.anzahlHand}>{anzahl} {anzahl === 1 ? 'Buch' : 'Bücher'}</Text>
      </View>
      {wert.gesamt > 0 && (
        <>
          <View style={st.balken}>
            {teile.map((k) => (
              <View key={k} style={{ flex: wert.je[k].summe, backgroundColor: KATEGORIE_FARBE[k] }} />
            ))}
          </View>
          <View style={st.balkenLegende}>
            {teile.map((k) => (
              <Text key={k} style={st.legendeText}>
                {KATEGORIE_LABEL[k] === 'Ins Lager' ? 'Lager' : KATEGORIE_LABEL[k]} {euro(wert.je[k].summe)}
                {k === 'lager' ? ' vorl.' : ''}
              </Text>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

/**
 * Ein Buch: Titel, darunter Autor · Zustand · Fach, rechts der Preis.
 * Tippen öffnet die Einzelbuch-Ansicht, Preis lange drücken = Schnellkorrektur, nach links wischen = entfernen.
 */
function Zeile({ e, einst, onOeffnen, onSchnell, onEntfernen }: {
  e: LogEintrag;
  einst: Einstellungen;
  onOeffnen: () => void;
  onSchnell: () => void;
  onEntfernen: (zurueck: () => void) => void;
}) {
  const fach = bereichFuerBuch(e);
  const fachFarbe = fach ? BEREICHE[fach].farbe : F.grau;
  const fachName = fach === 'grabbel' ? null : erstesFach(e.sachgruppen) ?? (fach ? BEREICHE[fach].name : null);
  const s = seltenheitAusEintrag(e, einst.seltenheit);
  const stern = s && s.bestaetigt ? (s.stufe === 'raritaet' ? '✦✦ ' : s.stufe === 'selten' ? '✦ ' : '') : '';

  // Wischen nach links legt „Entfernen“ frei; weit genug → Rückfrage, sonst zurückschnappen
  const x = useRef(new Animated.Value(0)).current;
  const zurueck = () => Animated.spring(x, { toValue: 0, useNativeDriver: true }).start();
  const wisch = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dx < -12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_, g) => x.setValue(Math.min(0, g.dx)),
      onPanResponderRelease: (_, g) => {
        if (g.dx < -110) {
          Animated.timing(x, { toValue: -140, duration: 120, useNativeDriver: true }).start();
          onEntfernen(zurueck);
        } else zurueck();
      },
      onPanResponderTerminate: zurueck,
    }),
  ).current;

  return (
    <View style={st.zeileHalter}>
      <View style={st.wischGrund}>
        <Icon name="trash-can-outline" size={20} farbe="#fff" />
        <Text style={st.wischText}>Entfernen</Text>
      </View>
      <Animated.View style={{ transform: [{ translateX: x }] }} {...wisch.panHandlers}>
        <Pressable
          onPress={onOeffnen}
          style={[st.zeile, { borderLeftColor: fach ? fachFarbe : F.grau }]}
          accessibilityRole="button"
          accessibilityLabel={`${e.titel ?? 'Buch'}, ${euro(e.endpreis ?? 0)}, Details öffnen`}
          accessibilityHint="Preis lange drücken zum Korrigieren, nach links wischen zum Entfernen"
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={st.titel} numberOfLines={1}>{e.titel}</Text>
            <View style={st.unterZeile}>
              {e.zustand && <View style={[st.punkt, { backgroundColor: ZUSTAND_FARBE[e.zustand] }]} />}
              <Text style={st.klein} numberOfLines={1}>
                {[e.autor?.split(';')[0]?.split(',')[0], e.zustand ? ZUSTAND_LABEL[e.zustand] : null, fachName ?? e.jahr]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
          </View>
          <Pressable onLongPress={onSchnell} onPress={onOeffnen} hitSlop={8} delayLongPress={300}>
            <Text style={[st.preis, stern && s ? { color: s.stufe === 'selten' ? F.tinte : STUFE_FARBE[s.stufe] } : null]}>
              {stern}{euro(e.endpreis ?? 0)}
            </Text>
          </Pressable>
        </Pressable>
      </Animated.View>
    </View>
  );
}

/** Blatt von unten: Stapel wechseln/anlegen und alles, was den aktiven Stapel betrifft. */
function StapelBlatt(p: {
  offen: boolean;
  alle: Stapel[];
  aktiv: Stapel | null;
  sortierung: Sortierung;
  hatBuecher: boolean;
  onZu: () => void;
  onWeiter: (s: Stapel) => void;
  onNeu: () => void;
  onUmbenennen: () => void;
  onPausieren: () => void;
  onCsv: () => void;
  onSortierung: (s: Sortierung) => void;
}) {
  const unten = useSafeAreaInsets().bottom;
  return (
    <Modal visible={p.offen} transparent animationType="slide" onRequestClose={p.onZu}>
      <Pressable style={st.blattHintergrund} onPress={p.onZu}>
        <Pressable style={[st.blatt, { paddingBottom: unten + ABSTAND }]} onPress={() => undefined}>
          <View style={st.blattKopf}>
            <Text style={st.blattTitel}>Stapel</Text>
            <Pressable onPress={p.onZu} hitSlop={10} accessibilityLabel="Schließen">
              <Icon name="close" size={24} />
            </Pressable>
          </View>
          {p.alle.map((s) => {
            const istAktiv = s.aktiv === 1;
            return (
              <Pressable
                key={s.id}
                onPress={() => (istAktiv ? p.onZu() : p.onWeiter(s))}
                style={[st.stapelZeile, istAktiv && st.stapelZeileAktiv]}
                accessibilityLabel={`${s.name}, ${s.anzahl} Bücher${istAktiv ? ', aktiv' : ', pausiert – antippen zum Weiterführen'}`}
              >
                <Icon name={istAktiv ? 'record-circle' : 'pause'} size={18} farbe={istAktiv ? aufFarbe(BEREICH.stapel) : F.tinte} />
                <Text style={[st.stapelName, istAktiv && { color: aufFarbe(BEREICH.stapel) }]} numberOfLines={1}>{s.name}</Text>
                <Text style={[st.stapelZahl, istAktiv && { color: aufFarbe(BEREICH.stapel) }]}>{s.anzahl}</Text>
              </Pressable>
            );
          })}
          <Pressable onPress={p.onNeu} style={[st.stapelZeile, st.stapelNeu]}>
            <Icon name="plus" size={18} />
            <Text style={st.stapelName}>Neuer Stapel</Text>
          </Pressable>

          {p.aktiv && (
            <>
              <Text style={st.blattAbschnitt}>Dieser Stapel</Text>
              <View style={st.blattRaster}>
                <BlattKnopf icon="pencil" label="Umbenennen" onPress={p.onUmbenennen} />
                <BlattKnopf icon="pause" label="Pausieren" onPress={p.onPausieren} />
                <BlattKnopf icon="share-variant" label="CSV teilen" onPress={p.onCsv} aus={!p.hatBuecher} />
              </View>
            </>
          )}

          <Text style={st.blattAbschnitt}>Sortieren nach</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {(Object.keys(SORTIERUNG_LABEL) as Sortierung[]).map((s) => (
              <Chip key={s} klein label={SORTIERUNG_LABEL[s]} aktiv={p.sortierung === s} farbe={F.tinte} onPress={() => p.onSortierung(s)} />
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function BlattKnopf({ icon, label, onPress, aus }: { icon: IconName; label: string; onPress: () => void; aus?: boolean }) {
  return (
    <Pressable onPress={aus ? undefined : onPress} style={[st.blattKnopf, aus && { opacity: 0.4 }]}>
      <Icon name={icon} size={18} />
      <Text style={st.blattKnopfText}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  wurzel: { flex: 1, backgroundColor: F.papier },
  mehr: { ...KASTEN, width: 38, height: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: F.karte },
  wertReihe: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  gross: { fontSize: 38, fontWeight: '800', color: F.tinte, fontVariant: ['tabular-nums'] },
  anzahlHand: { fontFamily: SCHRIFT.hand, fontSize: 24, color: F.hand },
  balken: { flexDirection: 'row', height: 12, ...KASTEN, marginTop: 6, overflow: 'hidden' },
  balkenLegende: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3, gap: 8 },
  legendeText: { fontSize: 12, fontWeight: '600', color: F.grau },
  gruppe: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginHorizontal: ABSTAND, marginTop: 18, paddingBottom: 4, borderBottomWidth: 3, borderBottomColor: F.tinte },
  gruppeName: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.1, color: F.tinte },
  gruppeSumme: { fontSize: 14, fontWeight: '800', color: F.tinte, fontVariant: ['tabular-nums'] },
  zeileHalter: { marginHorizontal: ABSTAND, marginTop: 6, backgroundColor: F.rot },
  wischGrund: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 140, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  wischText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  zeile: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: F.karte, ...KASTEN, borderLeftWidth: 7, paddingVertical: 10, paddingHorizontal: 12 },
  titel: { fontSize: 16, fontWeight: '700', color: F.tinte },
  unterZeile: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  punkt: { width: 9, height: 9, borderRadius: 5, borderWidth: 1, borderColor: F.tinte },
  klein: { fontSize: 13, color: F.grau, flexShrink: 1 },
  preis: { fontSize: 18, fontWeight: '800', color: F.tinte, fontVariant: ['tabular-nums'] },
  leer: { alignItems: 'center', padding: 40, gap: 6 },
  leerHand: { fontFamily: SCHRIFT.hand, fontSize: 30, color: F.hand },
  fuss: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: ABSTAND, paddingBottom: 12, backgroundColor: F.papier, borderTopWidth: 2, borderTopColor: F.tinte },
  dialogHintergrund: { flex: 1, backgroundColor: 'rgba(29,27,27,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { ...KASTEN, backgroundColor: F.karte, padding: 18, width: '100%', maxWidth: 420, boxShadow: `6px 6px 0px ${F.tinte}` },
  dialogTitel: { fontSize: 18, fontWeight: '800', color: F.tinte, marginBottom: 10 },
  dialogEingabe: { backgroundColor: F.papier, ...KASTEN, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: F.tinte },
  schnellReihe: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 6 },
  schnellPreis: { fontSize: 34, fontWeight: '800', color: F.tinte, minWidth: 130, textAlign: 'center', fontVariant: ['tabular-nums'] },
  blattHintergrund: { flex: 1, backgroundColor: 'rgba(29,27,27,0.45)', justifyContent: 'flex-end' },
  blatt: { backgroundColor: F.papier, borderTopWidth: 3, borderTopColor: F.tinte, padding: ABSTAND, gap: 8 },
  blattKopf: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  blattTitel: { fontSize: 22, fontWeight: '800', color: F.tinte },
  stapelZeile: { flexDirection: 'row', alignItems: 'center', gap: 10, ...KASTEN, backgroundColor: F.karte, paddingHorizontal: 12, paddingVertical: 11 },
  stapelZeileAktiv: { backgroundColor: BEREICH.stapel },
  stapelNeu: { borderStyle: 'dashed', backgroundColor: 'transparent' },
  stapelName: { flex: 1, fontSize: 15, fontWeight: '800', color: F.tinte },
  stapelZahl: { fontSize: 14, fontWeight: '800', color: F.grau, fontVariant: ['tabular-nums'] },
  blattAbschnitt: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.1, color: F.tinte, marginTop: 10 },
  blattRaster: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  blattKnopf: { flexDirection: 'row', alignItems: 'center', gap: 6, ...KASTEN, backgroundColor: F.karte, paddingHorizontal: 12, paddingVertical: 10, flexGrow: 1, flexBasis: '45%' },
  blattKnopfText: { fontSize: 14, fontWeight: '700', color: F.tinte },
});
