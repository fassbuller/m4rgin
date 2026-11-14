// Detailansicht eines Buches im Stapel: alle gespeicherten Infos, Marktangebote,
// Rechnung und – bei Bedarf – Markt frisch abfragen und Preis/Zustand übernehmen.
import React, { useMemo, useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './Schrift';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { EintragAenderung, LogEintrag, ausStapelEntfernen, eintragAktualisieren } from '../db';
import { Einstellungen, parseZahl, zahlText } from '../einstellungen';
import { marktFuer, marktUnvollstaendig, seltenheitAusEintrag } from '../dienste';
import { Titel } from '../lib/titel';
import { MarktErgebnis } from '../lib/markt';
import { Beschreibung, kiBeschreibung } from '../lib/beschreibung';
import { fehlerText } from '../lib/fehler';
import {
  berechnePreis, euro, KATEGORIE_LABEL, kategorieFuerEndpreis, Merkmal, MERKMAL_LABEL, PreisRegeln, Zustand, ZUSTAND_LABEL,
} from '../lib/preis';
import { BEREICH, F, hell, KATEGORIE_FARBE, ABSTAND, SCHRIFT, schatten, ZUSTAND_FARBE } from '../theme';
import { Abschnitt, Chip, Genres, Icon, KategorieBadge, Knopf, Schritt, Stepper } from './Teile';
import { Rechnung } from './Rechnung';
import { Cover } from './Cover';
import { BuchAktionen } from './BuchAktionen';
import { Feier } from './Feier';
import { Seltenheit } from '../lib/seltenheit';
import { Funkeln, HoloGlanz, SchimmerText, SeltenheitsInfo, STUFE_FARBE, StufenBadge, useBewegung } from './Glanz';

interface Props {
  eintrag: LogEintrag;
  regeln: PreisRegeln;
  einst: Einstellungen;
  onSchliessen: () => void;
  onGespeichert: () => void;
}

const ZUSTAENDE = Object.keys(ZUSTAND_LABEL) as Zustand[];
const MERKMALE = Object.keys(MERKMAL_LABEL) as Merkmal[];

/** Kompakte Angebote, wie sie beim Auspreisen mitgespeichert wurden. */
interface TopAngebot {
  p: string;
  h?: string | null;
  g: number;
  v?: number | string | null;
  z?: string | null;
  u?: string | null;
}

interface Zeile {
  plattform: string;
  haendler?: string;
  jahr?: string;
  gesamt: number;
  versand?: string;
  zustandText?: string;
  url?: string;
}

function gespeicherteAngebote(json: string | null): TopAngebot[] {
  if (!json) return [];
  try {
    const x = JSON.parse(json);
    return Array.isArray(x) ? (x as TopAngebot[]) : [];
  } catch {
    return [];
  }
}

const merkmaleAus = (s: string | null): Merkmal[] =>
  (s ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter((x): x is Merkmal => (MERKMALE as string[]).includes(x));

const OHNE_STUFE: Seltenheit = { stufe: 'gewoehnlich', bestaetigt: true, moeglich: false, gruende: [], vorbehalte: [], effekt: 'keiner' };

export function StapelDetail({ eintrag, regeln, einst, onSchliessen, onGespeichert }: Props) {
  const rand = useSafeAreaInsets();
  const [zustand, setZustand] = useState<Zustand>(eintrag.zustand ?? 'gut');
  const [merkmale, setMerkmale] = useState<Merkmal[]>(merkmaleAus(eintrag.merkmale));
  const [korrektur, setKorrektur] = useState(0);
  const [markt, setMarkt] = useState<MarktErgebnis | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [neupreisText, setNeupreisText] = useState(
    eintrag.neupreis != null ? zahlText(eintrag.neupreis) : '',
  );
  const neupreis = parseZahl(neupreisText);
  const [beschreibung, setBeschreibung] = useState<Beschreibung | null>(null);
  const [kiLaedt, setKiLaedt] = useState(false);
  const [feiern, setFeiern] = useState(false);
  const kiMoeglich = !!einst.ki.basisUrl && !!(einst.ki.textModell || einst.ki.modell);

  const titel: Titel = useMemo(
    () => ({
      quelle: 'manuell',
      titel: eintrag.titel ?? eintrag.suchbegriff,
      autoren: (eintrag.autor ?? '').split(';').map((s) => s.trim()).filter(Boolean),
      verlag: eintrag.verlag ?? undefined,
      jahr: eintrag.jahr ?? undefined,
      isbn: eintrag.isbn ?? undefined,
      neupreis: eintrag.neupreis ?? undefined,
      sachgruppen: (eintrag.sachgruppen ?? '').split(';').map((s) => s.trim()).filter(Boolean),
    }),
    [eintrag],
  );

  const zeilen: Zeile[] = markt
    ? markt.angebote.slice(0, 10).map((a) => ({
        plattform: a.plattform,
        haendler: a.haendler,
        jahr: a.jahr,
        gesamt: a.gesamt,
        versand: `${euro(a.preis)} + ${euro(a.versand)}${a.versandGeschaetzt ? '*' : ''}`,
        zustandText: a.zustandText,
        url: a.url,
      }))
    : gespeicherteAngebote(eintrag.markt_json).map((a) => ({
        plattform: a.p,
        haendler: a.h ?? undefined,
        gesamt: a.g,
        versand: typeof a.v === 'number' ? `Versand ${euro(a.v)}` : a.v ? `Versand ${a.v}` : undefined,
        zustandText: a.z ?? undefined,
        url: a.u ?? undefined,
      }));

  // Von Hand gewähltes Vergleichsangebot (Index in zeilen); null = nach den Regeln bzw. wie gespeichert
  const [gewaehlt, setGewaehlt] = useState<number | null>(null);
  const gewaehltPreis = gewaehlt != null ? zeilen[gewaehlt]?.gesamt ?? null : null;

  const ergebnis = useMemo(
    () =>
      berechnePreis(
        {
          angebote: markt?.angebote ?? null,
          vergleichspreis: gewaehltPreis ?? (markt ? null : eintrag.vergleichspreis),
          anzahlAngebote: markt?.lage.anzahl ?? eintrag.markt_anzahl,
          schaetzpreis: markt || gewaehltPreis != null || eintrag.vergleichspreis != null ? null : eintrag.endpreis,
          zustand,
          merkmale,
          neupreis,
          jahr: eintrag.jahr,
          marktUnvollstaendig: marktUnvollstaendig(markt),
        },
        regeln,
      ),
    [markt, eintrag, zustand, merkmale, neupreis, regeln, gewaehltPreis],
  );

  const endpreis = ergebnis ? Math.max(0.5, ergebnis.vorschlag + korrektur * regeln.raster) : null;
  // Kategorie zum aktuellen Preis: von Hand auf 1 €/2 € → Bücherbox (und zurück)
  const kategorie = ergebnis && endpreis != null ? kategorieFuerEndpreis(endpreis, ergebnis.kategorie, regeln) : ergebnis?.kategorie ?? null;
  const bewegung = useBewegung(einst.seltenheit.effekte);
  const seltenheit = useMemo(
    () => seltenheitAusEintrag(eintrag, einst.seltenheit, { markt, preis: ergebnis, endpreis, merkmale }),
    [eintrag, einst.seltenheit, markt, ergebnis, endpreis, merkmale],
  );
  const glitzer = !!seltenheit && seltenheit.effekt === 'voll' && bewegung && (seltenheit.stufe === 'selten' || seltenheit.stufe === 'raritaet');
  // Welche Karte das Buch bekommt: belegte Stufe, sonst Bronze
  const kartenStufe = seltenheit && seltenheit.bestaetigt ? seltenheit.stufe : 'gewoehnlich';

  const lage = markt?.lage
    ? `${markt.lage.anzahl} Angebote · ab ${euro(markt.lage.min ?? 0)} · Median ${euro(markt.lage.median ?? 0)}`
    : eintrag.markt_anzahl != null
      ? `${eintrag.markt_anzahl} Angebote · ab ${euro(eintrag.markt_min ?? 0)} · Median ${euro(eintrag.markt_median ?? 0)}`
      : 'Keine Marktdaten gespeichert';

  const umschalten = (m: Merkmal) =>
    setMerkmale((alt) => (alt.includes(m) ? alt.filter((x) => x !== m) : [...alt, m]));

  const neuAbfragen = async () => {
    setLaedt(true);
    try {
      const m = await marktFuer(titel, einst);
      setMarkt(m);
      setGewaehlt(null);
      setKorrektur(0);
    } catch (e) {
      Alert.alert('Markt', fehlerText(e, 'Die Marktabfrage'));
    } finally {
      setLaedt(false);
    }
  };

  const beschreiben = async () => {
    setKiLaedt(true);
    try {
      setBeschreibung(await kiBeschreibung(titel, einst.ki));
    } catch (e) {
      Alert.alert('KI', fehlerText(e, 'Die KI-Beschreibung'));
    } finally {
      setKiLaedt(false);
    }
  };

  const uebernehmen = async () => {
    if (!ergebnis || endpreis == null) return;
    const aenderung: EintragAenderung = {
      zustand,
      merkmale: ergebnis.merkmale,
      vorschlag: ergebnis.vorschlag,
      endpreis,
      kategorie: kategorieFuerEndpreis(endpreis, ergebnis.kategorie, regeln),
      vergleichspreis: ergebnis.vergleichspreis,
      neupreis,
      anker: ergebnis.anker,
      // Ohne frische Marktdaten gibt es kein Angebot-Objekt – dann die gewählte gespeicherte Zeile merken
      ankerGewaehlt: !markt && gewaehlt != null && zeilen[gewaehlt]
        ? { plattform: zeilen[gewaehlt].plattform, haendler: zeilen[gewaehlt].haendler, url: zeilen[gewaehlt].url }
        : undefined,
      markt: markt ?? undefined,
    };
    await eintragAktualisieren(eintrag.id, aenderung);
    onGespeichert();
  };

  const entfernen = () =>
    Alert.alert('Entfernen?', eintrag.titel ?? '', [
      { text: 'Nein', style: 'cancel' },
      {
        text: 'Entfernen',
        style: 'destructive',
        onPress: async () => {
          await ausStapelEntfernen(eintrag.id);
          onGespeichert();
        },
      },
    ]);

  const ankerPreis = ergebnis?.vergleichspreis ?? null;
  // Nur ein Angebot markieren, auch wenn mehrere gleich viel kosten
  const ankerIndex = gewaehlt ?? zeilen.findIndex((z) => ankerPreis != null && Math.abs(z.gesamt - ankerPreis) < 0.005);
  const waehle = (i: number) => {
    setGewaehlt((g) => (g === i ? null : i));
    setKorrektur(0);
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onSchliessen}>
      <StatusBar style="dark" />
      <ScrollView
        style={st.wurzel}
        contentContainerStyle={{ padding: ABSTAND, paddingTop: rand.top + ABSTAND, paddingBottom: 150 + rand.bottom }}
      >
        {/* Kopf */}
        <View style={st.kopf}>
          <Funkeln aktiv={glitzer} farbe={seltenheit ? STUFE_FARBE[seltenheit.stufe] : F.gelb} anzahl={4}>
            <HoloGlanz aktiv={glitzer && seltenheit?.stufe === 'raritaet'} breite={72}>
              <Cover isbn={eintrag.isbn ?? undefined} style={st.cover} iconGroesse={30} />
            </HoloGlanz>
          </Funkeln>
          <View style={{ flex: 1 }}>
            <SchimmerText aktiv={glitzer} grund={F.tinte} style={st.titel}>{eintrag.titel ?? eintrag.suchbegriff}</SchimmerText>
            {eintrag.autor ? <Text style={st.autor}>{eintrag.autor.split(';').join('; ')}</Text> : null}
            <Text style={st.klein}>
              {[eintrag.verlag, eintrag.jahr].filter(Boolean).join(' · ')}
            </Text>
            <Text style={st.klein}>
              {[eintrag.isbn ? `ISBN ${eintrag.isbn}` : null, neupreis != null ? `Neupreis ${euro(neupreis)} (DNB)` : null]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            <View style={{ marginTop: 6 }}>
              <Genres sachgruppen={titel.sachgruppen} />
            </View>
            <BuchAktionen
              haven={einst.haven}
              buch={{
                isbn: eintrag.isbn ?? undefined,
                titel: eintrag.titel ?? eintrag.suchbegriff,
                autoren: eintrag.autor ? eintrag.autor.split(';').map((a) => a.trim()) : [],
                verlag: eintrag.verlag ?? undefined,
                jahr: eintrag.jahr ?? undefined,
                neupreis: neupreis ?? undefined,
                preis: endpreis ?? eintrag.endpreis,
                kategorie: kategorie ?? eintrag.kategorie ?? undefined,
                zustand,
                stufe: seltenheit?.stufe,
                vergleich: eintrag.vergleichspreis,
                angebote: eintrag.markt_anzahl,
              }}
            />
          </View>
          <Pressable onPress={onSchliessen} hitSlop={12} style={st.schliessen}>
            <Icon name="close" size={24} farbe={F.grau} />
          </Pressable>
        </View>

        {seltenheit && seltenheit.stufe !== 'gewoehnlich' && (
          <View style={{ marginTop: 12 }}>
            <StufenBadge s={seltenheit} />
            <SeltenheitsInfo s={seltenheit} />
          </View>
        )}
        {/* Jedes Buch hat seine Karte (Bronze bis Schwarz) – Gold und Schwarz mit großer Feier */}
        <Knopf
          label={kartenStufe === 'selten' || kartenStufe === 'raritaet' ? 'Fund feiern und teilen' : 'Karte ansehen und teilen'}
          icon="star-four-points"
          leise
          farbe={F.tinte}
          onPress={() => setFeiern(true)}
          stil={{ marginTop: 12 }}
        />

        {eintrag.trend ? (
          <View style={st.trendReihe}>
            <Icon name="chart-line" size={16} farbe={F.grau} />
            <Text style={st.trendText}>{eintrag.trend}</Text>
          </View>
        ) : null}

        {/* KI-Kurzbeschreibung – nur auf Knopfdruck, lokale Modelle brauchen eine Weile */}
        {kiMoeglich && (
          <>
            <Abschnitt titel="Worum geht's?" icon="robot" farbe={F.lila} />
            {beschreibung ? (
              <View style={st.kiKarte}>
                <Text style={st.kiText}>{beschreibung.text}</Text>
                <View style={st.kiQuellen}>
                  {beschreibung.quellen.map((q) => (
                    <Text
                      key={q.name}
                      style={[st.mini, q.url && { color: F.blau, fontWeight: '700' }]}
                      onPress={q.url ? () => Linking.openURL(q.url!) : undefined}
                    >
                      {q.name}
                    </Text>
                  ))}
                </View>
                <Text style={st.mini}>KI-Text – kann Fehler enthalten, im Zweifel nachprüfen.</Text>
              </View>
            ) : null}
            <Knopf
              label={kiLaedt ? 'KI schreibt … (kann 1–2 Min. dauern)' : beschreibung ? 'Neu schreiben lassen' : 'KI-Kurzbeschreibung'}
              icon="robot"
              leise
              farbe={F.lila}
              deaktiviert={kiLaedt}
              onPress={beschreiben}
              stil={{ marginTop: beschreibung ? 8 : 0 }}
            />
          </>
        )}

        {/* Markt */}
        <Abschnitt titel="Markt" icon="store-search" farbe={F.blau} />
        <Text style={st.lage}>{lage}</Text>
        {zeilen.map((z, i) => {
          const istAnker = i === ankerIndex;
          return (
            <Pressable
              key={i}
              onPress={() => waehle(i)}
              style={[st.angebot, istAnker && st.angebotAnker]}
              accessibilityRole="radio"
              accessibilityState={{ checked: istAnker }}
              accessibilityLabel={`${z.plattform} ${euro(z.gesamt)}${istAnker ? ', Vergleich für den Preis' : ', als Vergleich wählen'}`}
            >
              <Icon name={istAnker ? 'radiobox-marked' : 'radiobox-blank'} size={20} farbe={istAnker ? F.gruen : F.linie} />
              <View style={{ flex: 1 }}>
                <Text style={st.angebotKopf}>
                  <Text style={st.plattform}>{z.plattform}</Text>
                  {z.haendler ? `  ${z.haendler}` : ''}
                  {z.jahr ? `  · ${z.jahr}` : ''}
                </Text>
                {istAnker ? (
                  <Text style={st.ankerText}>{gewaehlt != null ? 'Von dir gewählter Vergleich' : 'Vergleich für den Preis'}</Text>
                ) : null}
                {z.zustandText ? (
                  <Text style={st.mini} numberOfLines={2}>{z.zustandText}</Text>
                ) : null}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={st.angebotPreis}>{euro(z.gesamt)}</Text>
                {z.versand ? <Text style={st.mini}>{z.versand}</Text> : null}
                {z.url ? (
                  <Text style={st.link} onPress={() => Linking.openURL(z.url!)}>
                    ansehen <Icon name="open-in-new" size={13} farbe={F.blau} />
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
        {zeilen.length > 1 && (
          <Text style={st.mini}>Antippen, um ein anderes Angebot als Vergleich zu nehmen. Nochmal antippen hebt die Wahl auf.</Text>
        )}
        {!zeilen.length && <Text style={st.klein}>Keine Angebote gespeichert.</Text>}
        {zeilen.some((z) => z.versand?.includes('*')) && (
          <Text style={st.mini}>* Versand geschätzt (Quelle nennt keinen)</Text>
        )}
        <Knopf
          label={laedt ? 'Frage Quellen ab …' : 'Markt neu abfragen'}
          icon="refresh"
          leise
          farbe={F.blau}
          deaktiviert={laedt}
          onPress={neuAbfragen}
          stil={{ marginTop: 12 }}
        />

        {/* Neupreis */}
        <Abschnitt titel="Neupreis" icon="tag" farbe={F.orange} />
        <View style={st.neupreisReihe}>
          <Text style={[st.klein, { flex: 1, marginTop: 0 }]}>
            Ladenpreis neu laut DNB – dort oft veraltet, bitte prüfen
          </Text>
          <Stepper
            wert={neupreis}
            schritt={0.5}
            einheit="€"
            leerErlaubt
            setze={(v) => setNeupreisText(v == null ? '' : zahlText(v))}
          />
        </View>

        {/* Zustand & Merkmale */}
        <Abschnitt titel="Zustand" icon="star-half-full" farbe={ZUSTAND_FARBE[zustand]} />
        <View style={st.reihe}>
          {ZUSTAENDE.map((z) => (
            <Chip key={z} label={ZUSTAND_LABEL[z]} aktiv={zustand === z} farbe={ZUSTAND_FARBE[z]} onPress={() => setZustand(z)} />
          ))}
        </View>
        <Abschnitt titel="Merkmale" icon="diamond-stone" farbe={F.lila} />
        <View style={st.reihe}>
          {MERKMALE.map((m) => (
            <Chip key={m} label={MERKMAL_LABEL[m]} aktiv={merkmale.includes(m)} farbe={F.lila} onPress={() => umschalten(m)} />
          ))}
        </View>

        {/* Ergebnis */}
        {ergebnis && endpreis != null ? (
          <View style={[st.ergebnis, schatten(KATEGORIE_FARBE[kategorie ?? ergebnis.kategorie], 6)]}>
            <View style={st.ergebnisKopf}>
              <Icon name="pencil" size={18} farbe={F.grau} />
              <Text style={st.ergebnisTitel}>m4rgin-Preis</Text>
              <KategorieBadge k={kategorie ?? ergebnis.kategorie} gross />
            </View>
            <View style={st.stepper}>
              <Schritt gross onPress={() => setKorrektur((k) => k - 1)} />
              <Text style={st.preisGross}>{euro(endpreis)}</Text>
              <Schritt gross plus onPress={() => setKorrektur((k) => k + 1)} />
            </View>
            <Rechnung schritte={ergebnis.schritte} notizen={ergebnis.notizen} farbe={KATEGORIE_FARBE[kategorie ?? ergebnis.kategorie]} />
            {korrektur !== 0 && (
              <Text style={st.erklaerung}>
                Von Hand {korrektur > 0 ? '+' : ''}{euro(korrektur * regeln.raster)}
              </Text>
            )}
            {ergebnis.hinweise.map((h, i) => (
              <View key={i} style={st.hinweisReihe}>
                <Icon name="flag" size={16} farbe={F.rot} />
                <Text style={st.hinweis}>{h}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={st.ergebnis}>
            <Text style={st.klein}>
              Für dieses Buch ist kein Vergleichspreis gespeichert (Schätzung). Preis: {euro(eintrag.endpreis ?? 0)}
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={[st.fuss, { paddingBottom: ABSTAND + rand.bottom }]}>
        <Knopf label="Entfernen" icon="trash-can-outline" leise farbe={F.rot} onPress={entfernen} stil={{ flex: 1 }} />
        <Knopf
          label="Übernehmen"
          icon="check"
          farbe={BEREICH.stapel}
          deaktiviert={!ergebnis || endpreis == null}
          onPress={uebernehmen}
          stil={{ flex: 2 }}
        />
      </View>
      <Feier
        daten={
          feiern
            ? {
                titel,
                preis: endpreis ?? eintrag.endpreis,
                // Unbelegte Seltenheit zeigt die Karte als Bronze – wie beim Scannen
                seltenheit: seltenheit && seltenheit.bestaetigt ? seltenheit : { ...OHNE_STUFE, gruende: seltenheit?.gruende ?? [] },
                ort: kategorie ? KATEGORIE_LABEL[kategorie] : null,
              }
            : null
        }
        effekte={einst.seltenheit.effekte}
        onZu={() => setFeiern(false)}
      />
    </Modal>
  );
}

const st = StyleSheet.create({
  wurzel: { flex: 1, backgroundColor: F.papier },
  kopf: { flexDirection: 'row', gap: 12 },
  cover: { borderWidth: 2, borderColor: F.tinte, width: 72, height: 108, backgroundColor: F.linie },
  schliessen: { padding: 4 },
  titel: { fontSize: 24, fontWeight: '800', color: F.tinte, letterSpacing: -0.3, paddingRight: 24 },
  autor: { fontSize: 16, color: F.tinte, marginTop: 2 },
  klein: { fontSize: 13, color: F.grau, marginTop: 2 },
  mini: { fontSize: 11, color: F.grau },
  reihe: { flexDirection: 'row', flexWrap: 'wrap' },
  neupreisReihe: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  neupreisFeld: {
    width: 110,
    textAlign: 'right',
    backgroundColor: F.karte,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: F.linie,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 0,
    fontSize: 16,
    color: F.tinte,
  },
  trendReihe: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  kiKarte: { backgroundColor: hell(F.lila, 0.08), borderLeftWidth: 4, borderLeftColor: F.lila, padding: 12, gap: 6 },
  kiText: { fontSize: 15, lineHeight: 21, color: F.tinte },
  kiQuellen: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 10 },
  trendText: { flex: 1, color: F.grau, fontSize: 13, fontWeight: '600' },
  lage: { fontSize: 15, fontWeight: '700', color: F.tinte, marginTop: 2, marginBottom: 6 },
  angebot: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: F.karte, padding: 12, marginTop: 8, borderWidth: 2, borderColor: F.tinte },
  angebotAnker: { borderColor: F.gruen, borderWidth: 3, backgroundColor: hell(F.gruen, 0.08) },
  angebotKopf: { fontSize: 14, color: F.tinte },
  plattform: { fontWeight: '800' },
  ankerText: { fontSize: 12, fontWeight: '800', color: F.gruen, marginTop: 2 },
  angebotPreis: { fontSize: 17, fontWeight: '800', color: F.tinte },
  link: { color: F.blau, fontWeight: '700', marginTop: 6 },
  // Der Preis-Zettel: weiß, Tintenrahmen, harter Schatten in Kategoriefarbe
  ergebnis: { padding: ABSTAND, marginTop: 24, marginRight: 6, backgroundColor: F.karte, borderWidth: 2, borderColor: F.tinte },
  ergebnisKopf: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ergebnisTitel: { flex: 1, fontFamily: SCHRIFT.hand, fontSize: 26, color: F.hand, lineHeight: 28 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginVertical: 12 },
  preisGross: { fontSize: 42, fontWeight: '800', color: F.tinte, minWidth: 140, textAlign: 'center', fontVariant: ['tabular-nums'] },
  erklaerung: { fontSize: 13, color: F.grau, marginTop: 2 },
  hinweisReihe: { flexDirection: 'row', gap: 6, marginTop: 8, alignItems: 'flex-start' },
  hinweis: { flex: 1, color: F.rot, fontSize: 13, fontWeight: '600' },
  fuss: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 10, padding: ABSTAND, backgroundColor: F.papier, borderTopWidth: 2, borderTopColor: F.tinte },
});
