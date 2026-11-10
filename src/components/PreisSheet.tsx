// Das Auspreisen eines Buches: Markt (nachvollziehbar), Trend, Zustand, Merkmale → Vorschlag → Stapel.
import React, { useMemo, useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { Text } from './Schrift';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Titel, titelZeile2 } from '../lib/titel';
import { Angebot, kurzerFehler, MarktErgebnis, marktMitAuswahl, QUELLEN_NAME } from '../lib/markt';
import { angebotSchluessel } from '../lib/pruefung';
import { AMPEL_LABEL, bewerteKonfidenz, Konfidenz } from '../lib/konfidenz';
import { testfallAus } from '../lib/testfall';
import { ignorierteHaendlerLaden, ignorierteHaendlerSpeichern } from '../db';
import { Signal } from '../lib/trend';
import {
  berechnePreis, euro, Merkmal, MERKMAL_LABEL, PreisErgebnis, PreisRegeln, Zustand, ZUSTAND_BUCH, ZUSTAND_LABEL,
} from '../lib/preis';
import { LinkVorlage, vergleichsLink } from '../lib/links';
import { parseZahl, zahlText } from '../einstellungen';
import { BEREICH, F, hell, KATEGORIE_FARBE, ABSTAND, SCHRIFT, schatten, ZUSTAND_FARBE } from '../theme';
import { Abschnitt, Chip, Genres, Icon, KategorieBadge, Knopf, MERKMAL_ICON, Schritt, Stepper } from './Teile';
import { Rechnung } from './Rechnung';
import { Cover } from './Cover';
import { Funkeln, HoloGlanz, SchimmerText, SeltenheitsInfo, STUFE_FARBE, StufenBadge, useBewegung } from './Glanz';
import { SeltenheitsRegeln } from '../lib/seltenheit';
import { marktUnvollstaendig, seltenheitFuer } from '../dienste';

export interface AuspreisDaten {
  ergebnis: PreisErgebnis;
  endpreis: number;
  zustand: Zustand;
  merkmale: Merkmal[];
  anker: Angebot | null;
  /** Neupreis, mit dem gerechnet wurde (ggf. von Hand korrigiert) */
  neupreis: number | null;
  /** Markt nach „passt nicht“/„zurückholen“ – das, womit gerechnet wurde */
  markt: MarktErgebnis | null;
  konfidenz: Konfidenz;
  vergleichVonHand: boolean;
  /** Zahl der von Hand aussortierten Angebote */
  aussortiertVonHand: number;
}

interface Props {
  titel: Titel;
  markt: MarktErgebnis | null;
  marktLaedt: boolean;
  trends: Signal[] | null;
  regeln: PreisRegeln;
  seltenheitRegeln: SeltenheitsRegeln;
  links: LinkVorlage[];
  onSpeichern: (d: AuspreisDaten) => void;
  onVerwerfen: () => void;
}

const ZUSTAENDE = Object.keys(ZUSTAND_LABEL) as Zustand[];
const MERKMALE = Object.keys(MERKMAL_LABEL) as Merkmal[];

export function PreisSheet(p: Props) {
  const t = p.titel;
  const rand = useSafeAreaInsets();
  const [zustand, setZustand] = useState<Zustand>('gut');
  const [merkmale, setMerkmale] = useState<Merkmal[]>([]);
  const [ankerSchluessel, setAnkerSchluessel] = useState<string | null>(null);
  const [schaetz, setSchaetz] = useState('');
  const [neupreisText, setNeupreisText] = useState(t.neupreis != null ? zahlText(t.neupreis) : '');
  const neupreis = parseZahl(neupreisText);
  const [korrektur, setKorrektur] = useState(0); // ±0,50-Schritte auf den Vorschlag
  const [alleZeigen, setAlleZeigen] = useState(false);
  // „Passt nicht“: von Hand aussortierte und von Hand zurückgeholte Angebote (Schlüssel)
  const [raus, setRaus] = useState<string[]>([]);
  const [rein, setRein] = useState<string[]>([]);
  const [aussortiertOffen, setAussortiertOffen] = useState(false);

  const markt = useMemo(() => (p.markt ? marktMitAuswahl(p.markt, raus, rein) : null), [p.markt, raus, rein]);
  const angebote = markt?.angebote ?? [];
  const aussortiert = markt?.aussortiert ?? [];
  const gewaehltesAngebot = ankerSchluessel != null ? angebote.find((a) => angebotSchluessel(a) === ankerSchluessel) ?? null : null;

  // Der Anker kommt aus den Regeln (Laden: günstigstes bzw. Mittel der zwei günstigsten, Lager: zweitgünstigstes).
  // Tippt jemand ein Angebot an, gilt das als gewähltes Vergleichsangebot.
  const ergebnis = useMemo(
    () =>
      berechnePreis(
        {
          angebote,
          vergleichspreis: gewaehltesAngebot?.gesamt ?? null,
          anzahlAngebote: markt?.lage.anzahl ?? null,
          schaetzpreis: parseZahl(schaetz),
          zustand,
          merkmale,
          neupreis,
          jahr: t.jahr,
          marktUnvollstaendig: marktUnvollstaendig(markt),
        },
        p.regeln,
      ),
    [angebote, gewaehltesAngebot, markt, schaetz, zustand, merkmale, neupreis, t.jahr, p.regeln],
  );
  const anker = ergebnis?.anker ?? null;
  const endpreis = ergebnis ? Math.max(0.5, ergebnis.vorschlag + korrektur * p.regeln.raster) : null;
  const konfidenz = useMemo(
    () => bewerteKonfidenz({ markt, preis: ergebnis, vonHandGewaehlt: gewaehltesAngebot != null }),
    [markt, ergebnis, gewaehltesAngebot],
  );
  const bewegung = useBewegung(p.seltenheitRegeln.effekte);
  const seltenheit = useMemo(
    () => seltenheitFuer(t, markt, ergebnis, merkmale, p.trends, p.seltenheitRegeln, endpreis, konfidenz),
    [t, markt, ergebnis, merkmale, p.trends, p.seltenheitRegeln, endpreis, konfidenz],
  );
  const uebergangen = new Map((ergebnis?.uebergangen ?? []).map((u) => [u.angebot, u.grund]));

  /** „Passt nicht“: nur hier aussortieren oder den Händler künftig immer ignorieren. */
  const passtNicht = (a: Angebot) => {
    const k = angebotSchluessel(a);
    const nurHier = () => {
      setRaus((x) => [...x, k]);
      if (ankerSchluessel === k) setAnkerSchluessel(null);
    };
    const knoepfe: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [
      { text: 'Nur hier aussortieren', onPress: nurHier },
    ];
    // eBay-Verkäufer werden nicht dauerhaft gespeichert (eBay-Nutzerdaten), also auch nicht auf die Ignorierliste
    if (a.haendler && a.haendler !== 'privat' && a.quelle !== 'ebay') {
      knoepfe.push({
        text: `„${a.haendler}“ immer ignorieren`,
        style: 'destructive',
        onPress: async () => {
          const alt = await ignorierteHaendlerLaden().catch(() => []);
          await ignorierteHaendlerSpeichern([...alt, a.haendler!]).catch(() => undefined);
          const h = a.haendler!.toLowerCase();
          setRaus((x) => [...x, ...angebote.filter((b) => b.haendler?.toLowerCase() === h).map(angebotSchluessel)]);
          if (ankerSchluessel && angebote.some((b) => b.haendler?.toLowerCase() === h && angebotSchluessel(b) === ankerSchluessel)) {
            setAnkerSchluessel(null);
          }
        },
      });
    }
    knoepfe.push({ text: 'Abbrechen', style: 'cancel' });
    Alert.alert('Angebot passt nicht?', `${a.plattform}${a.haendler ? ` · ${a.haendler}` : ''} · ${euro(a.gesamt)}\nEs zählt dann nicht mehr für Preis und Seltenheit.`, knoepfe);
  };
  const zurueckholen = (a: Angebot) => {
    const k = angebotSchluessel(a);
    if (raus.includes(k)) setRaus((x) => x.filter((y) => y !== k));
    else setRein((x) => [...x, k]);
  };
  const testfallTeilen = () => {
    if (!markt || endpreis == null) return;
    const tf = testfallAus(t, zustand, [...markt.angebote, ...(markt.aussortiert ?? []).map(({ grund: _g, ...a }) => a)], endpreis);
    Share.share({ message: JSON.stringify(tf, null, 1), title: `Testfall ${tf.name}` }).catch(() => undefined);
  };
  const glitzer = !!seltenheit && seltenheit.effekt === 'voll' && bewegung && (seltenheit.stufe === 'selten' || seltenheit.stufe === 'raritaet');

  const umschalten = (m: Merkmal) =>
    setMerkmale((alt) => (alt.includes(m) ? alt.filter((x) => x !== m) : [...alt, m]));

  const sichtbar = alleZeigen ? angebote : angebote.slice(0, 5);

  return (
    <Modal visible animationType="slide" onRequestClose={p.onVerwerfen}>
      <StatusBar style="dark" />
      <ScrollView style={st.wurzel} contentContainerStyle={{ padding: ABSTAND, paddingTop: rand.top + ABSTAND, paddingBottom: 140 + rand.bottom }}>
        {/* Kopf */}
        <View style={st.kopf}>
          <Funkeln aktiv={glitzer} farbe={seltenheit ? STUFE_FARBE[seltenheit.stufe] : F.gelb} anzahl={4}>
            <HoloGlanz aktiv={glitzer && seltenheit?.stufe === 'raritaet'} breite={72}>
              <Cover isbn={t.isbn} url={t.coverUrl} style={st.cover} iconGroesse={30} />
            </HoloGlanz>
          </Funkeln>
          <View style={{ flex: 1 }}>
            <SchimmerText aktiv={glitzer} grund={F.tinte} style={st.titel}>{t.titel}</SchimmerText>
            {t.autoren.length > 0 && <Text style={st.autor}>{t.autoren.join('; ')}</Text>}
            <Text style={st.klein}>{titelZeile2(t)}</Text>
            <Text style={st.klein}>
              {[t.umfang, t.einband, t.isbn, neupreis != null ? `Neupreis ${euro(neupreis)} (DNB)` : null].filter(Boolean).join(' · ')}
            </Text>
            <View style={{ marginTop: 6 }}>
              <Genres sachgruppen={t.sachgruppen} />
            </View>
          </View>
        </View>
        {seltenheit && seltenheit.stufe !== 'gewoehnlich' && (
          <View style={{ marginTop: 12 }}>
            <StufenBadge s={seltenheit} />
            <SeltenheitsInfo s={seltenheit} />
          </View>
        )}

        {/* Trend */}
        {p.trends && p.trends.filter((s) => s.text).length > 0 && (
          <View style={st.trendReihe}>
            {p.trends.filter((s) => s.text).map((s, i) => (
              <Pressable key={i} onPress={() => Alert.alert(s.text, s.detail)} style={[st.trend, { borderColor: farbeRichtung(s), backgroundColor: hell(farbeRichtung(s), 0.1) }]}>
                <Icon name={s.richtung === 'hoch' ? 'trending-up' : s.richtung === 'runter' ? 'trending-down' : 'trending-neutral'} size={16} farbe={farbeRichtung(s)} />
                <Text style={[st.trendText, { color: farbeRichtung(s) }]}>{s.text}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Markt */}
        <Abschnitt titel="Markt" icon="store-search" farbe={F.blau} />
        <View style={st.statusReihe}>
          {p.marktLaedt && <Text style={st.klein}>Frage Preisquellen ab …</Text>}
          {markt?.status.map((s) => (
            <Pressable
              key={s.quelle}
              style={st.statusTeil}
              disabled={s.ok}
              onPress={() => Alert.alert(`${QUELLEN_NAME[s.quelle]}: ${kurzerFehler(s.fehler)}`, s.fehler ?? '')}
            >
              <Icon name={s.ok ? 'check-circle' : 'close-circle'} size={16} farbe={s.ok ? F.gruen : F.rot} />
              <Text style={[st.status, { color: s.ok ? F.gruen : F.rot }]}>
                {QUELLEN_NAME[s.quelle]} {s.ok ? s.anzahl : kurzerFehler(s.fehler)}
                {s.versuche === 2 ? ' (2. Versuch)' : ''}
              </Text>
            </Pressable>
          ))}
          {markt?.aus?.map((q) => (
            <View key={q} style={st.statusTeil}>
              <Icon name="minus-circle-outline" size={16} farbe={F.grau} />
              <Text style={[st.status, { color: F.grau }]}>{QUELLEN_NAME[q]} aus</Text>
            </View>
          ))}
          {markt && markt.status.length === 0 && (
            <Text style={st.klein}>Keine Preisquelle eingerichtet (Einstellungen).</Text>
          )}
        </View>
        {markt && markt.lage.anzahl > 0 && (
          <Text style={st.lage}>
            {markt.lage.anzahl} Angebote · ab {euro(markt.lage.min!)} · Median {euro(markt.lage.median!)}
          </Text>
        )}
        {markt?.ueberIsbn === false && markt.lage.anzahl > 0 && (
          <Text style={st.mini}>Per Titel gesucht – Angebote mit anderem Titel/Autor sind aussortiert.</Text>
        )}
        {sichtbar.map((a) => {
          const k = angebotSchluessel(a);
          const gewaehlt = ergebnis?.ankerAngebote.includes(a) ?? false;
          const grund = uebergangen.get(a);
          return (
            <Pressable key={k} onPress={() => setAnkerSchluessel(k)} style={[st.angebot, gewaehlt && st.angebotGewaehlt]}>
              <Icon name={gewaehlt ? 'radiobox-marked' : 'radiobox-blank'} size={22} farbe={gewaehlt ? F.gruen : F.linie} />
              <View style={{ flex: 1 }}>
                <Text style={st.angebotKopf}>
                  <Text style={st.plattform}>{a.plattform}</Text>
                  {a.haendler ? `  ${a.haendler}` : ''}
                  {a.jahr ? `  · ${a.jahr}` : ''}
                </Text>
                {gewaehlt && (
                  <Text style={st.vergleich}>
                    {gewaehltesAngebot
                      ? 'Von Hand gewählter Vergleich'
                      : ergebnis?.zweig === 'lager'
                        ? 'Anker der Lager-Regeln (zweitgünstigstes)'
                        : (ergebnis?.ankerAngebote.length ?? 0) > 1
                          ? 'Vergleich (Mittel der 2 günstigsten)'
                          : 'Vergleich für den Preis'}
                  </Text>
                )}
                {grund && <Text style={st.uebergangen}>übergangen: {grund}</Text>}
                {a.zustandText ? <Text style={st.klein} numberOfLines={2}>{a.zustandText}</Text> : null}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={st.angebotPreis}>{euro(a.gesamt)}</Text>
                <Text style={st.mini}>
                  {euro(a.preis)} + {euro(a.versand)}{a.versandGeschaetzt ? '*' : ''}
                </Text>
                {a.url ? (
                  <Text style={st.link} onPress={() => Linking.openURL(a.url!)}>
                    ansehen <Icon name="open-in-new" size={13} farbe={F.blau} />
                  </Text>
                ) : null}
              </View>
              <Pressable onPress={() => passtNicht(a)} hitSlop={10} style={st.passtNicht} accessibilityLabel="Angebot passt nicht">
                <Icon name="close" size={18} farbe={F.grau} />
              </Pressable>
            </Pressable>
          );
        })}
        {angebote.length > 5 && (
          <Text style={st.link} onPress={() => setAlleZeigen(!alleZeigen)}>
            {alleZeigen ? 'weniger zeigen' : `alle ${angebote.length} zeigen`}
          </Text>
        )}
        {angebote.some((a) => a.versandGeschaetzt) && <Text style={st.mini}>* Versand geschätzt (Quelle nennt keinen)</Text>}
        {angebote.length > 0 && <Text style={st.mini}>Antippen = als Vergleich wählen · ✕ = passt nicht</Text>}
        {(markt?.hinweise ?? []).map((h, i) => <Text key={i} style={st.mini}>{h}</Text>)}

        {/* Aussortiert: mit Grund, zurückholbar */}
        {aussortiert.length > 0 && (
          <View style={{ marginTop: 10 }}>
            <Text style={st.link} onPress={() => setAussortiertOffen(!aussortiertOffen)}>
              {aussortiertOffen ? '▾' : '▸'} {aussortiert.length} aussortiert
            </Text>
            {aussortiertOffen &&
              aussortiert.map((a) => (
                <View key={angebotSchluessel(a)} style={[st.angebot, st.angebotAus]}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.angebotKopf}>
                      <Text style={st.plattform}>{a.plattform}</Text>
                      {a.haendler ? `  ${a.haendler}` : ''}
                      {a.jahr ? `  · ${a.jahr}` : ''}
                    </Text>
                    <Text style={st.uebergangen}>{a.grund}</Text>
                    {a.titel ? <Text style={st.klein} numberOfLines={1}>{a.titel}</Text> : null}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[st.angebotPreis, { color: F.grau }]}>{euro(a.gesamt)}</Text>
                    <Text style={st.link} onPress={() => zurueckholen(a)}>zurückholen</Text>
                  </View>
                </View>
              ))}
          </View>
        )}

        {!p.marktLaedt && angebote.length === 0 && (
          <View style={{ marginTop: 8 }}>
            <Text style={st.klein}>Kein Online-Angebot gefunden. Selbst nachsehen oder schätzen:</Text>
            <View style={[st.reihe, { marginTop: 8 }]}>
              {p.links.map((l) => (
                <Chip key={l.name} klein icon="open-in-new" label={l.name} farbe={F.blau} onPress={() => Linking.openURL(vergleichsLink(l, t))} />
              ))}
            </View>
            <View style={[st.neupreisReihe, { marginTop: 10 }]}>
              <Text style={[st.klein, { flex: 1, marginTop: 0 }]}>Schätzpreis</Text>
              <Stepper
                wert={parseZahl(schaetz)}
                schritt={p.regeln.raster}
                einheit="€"
                leerErlaubt
                setze={(v) => setSchaetz(v == null ? '' : zahlText(v))}
              />
            </View>
          </View>
        )}

        {/* Neupreis: Obergrenze für den Gebrauchtpreis */}
        <Abschnitt titel="Neupreis" icon="tag" farbe={F.orange} />
        <View style={st.neupreisReihe}>
          <Text style={[st.klein, { flex: 1, marginTop: 0 }]}>
            Ladenpreis neu laut DNB – dort oft veraltet, bitte prüfen. Der Gebrauchtpreis bleibt darunter.
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
        <Text style={st.klein}>{ZUSTAND_LABEL[zustand]} = im Antiquariat „{ZUSTAND_BUCH[zustand]}“</Text>
        <Abschnitt titel="Merkmale" icon="diamond-stone" farbe={F.lila} />
        <View style={st.reihe}>
          {MERKMALE.map((m) => (
            <Chip key={m} icon={MERKMAL_ICON[m]} label={MERKMAL_LABEL[m]} aktiv={merkmale.includes(m)} farbe={F.lila} onPress={() => umschalten(m)} />
          ))}
        </View>

        {/* Ergebnis */}
        {ergebnis && endpreis != null ? (
          <View style={[st.ergebnis, schatten(KATEGORIE_FARBE[ergebnis.kategorie], 6)]}>
            <View style={st.ergebnisKopf}>
              <Icon name="pencil" size={18} farbe={F.grau} />
              <Text style={st.ergebnisTitel}>m4rgin-Preis</Text>
              <KategorieBadge k={ergebnis.kategorie} gross />
            </View>
            <View style={st.stepper}>
              <Schritt gross onPress={() => setKorrektur((k) => k - 1)} />
              <Text style={st.preisGross}>{euro(endpreis)}</Text>
              <Schritt gross plus onPress={() => setKorrektur((k) => k + 1)} />
            </View>
            <AmpelZeile k={konfidenz} />
            <Rechnung schritte={ergebnis.schritte} notizen={ergebnis.notizen} farbe={KATEGORIE_FARBE[ergebnis.kategorie]} />
            {korrektur !== 0 && <Text style={st.erklaerung}>Von Hand {korrektur > 0 ? '+' : ''}{euro(korrektur * p.regeln.raster)}</Text>}
            {ergebnis.hinweise.map((h, i) => <Hinweis key={i} text={h} />)}
          </View>
        ) : (
          !p.marktLaedt && <Text style={[st.klein, { marginTop: 16 }]}>Für einen Vorschlag fehlt noch ein Vergleichs- oder Schätzpreis.</Text>
        )}
        {ergebnis && markt && markt.angebote.length + aussortiert.length > 0 && (
          <Text style={[st.link, { marginTop: 18, alignSelf: 'center' }]} onPress={testfallTeilen}>
            Als Testfall teilen
          </Text>
        )}
      </ScrollView>

      <View style={[st.fuss, { paddingBottom: ABSTAND + rand.bottom }]}>
        <Knopf label="Verwerfen" icon="close" leise farbe={F.rot} onPress={p.onVerwerfen} stil={{ flex: 1 }} />
        <Knopf
          label="Auf den Stapel"
          icon="bookshelf"
          farbe={BEREICH.stapel}
          deaktiviert={!ergebnis}
          stil={{ flex: 2 }}
          onPress={() =>
            ergebnis &&
            endpreis != null &&
            p.onSpeichern({
              ergebnis, endpreis, zustand, merkmale: ergebnis.merkmale, anker, neupreis, markt, konfidenz,
              vergleichVonHand: gewaehltesAngebot != null,
              aussortiertVonHand: raus.length,
            })
          }
        />
      </View>
    </Modal>
  );
}

const AMPEL_FARBE = { gruen: F.gruen, gelb: F.gelb, rot: F.rot } as const;

/** Konfidenz-Ampel: eine Zeile, antippen zeigt die Gründe. */
export function AmpelZeile({ k }: { k: Konfidenz }) {
  const farbe = AMPEL_FARBE[k.ampel];
  const text = k.gruende[0] ?? k.plus[0] ?? '';
  return (
    <Pressable
      onPress={() =>
        Alert.alert(
          `Preis: ${AMPEL_LABEL[k.ampel]}`,
          [...k.gruende.map((g) => `− ${g}`), ...k.plus.map((g) => `+ ${g}`)].join('\n') || 'Nichts auszusetzen.',
        )
      }
      style={[st.ampel, { borderColor: farbe, backgroundColor: hell(farbe, 0.12) }]}
    >
      <View style={[st.ampelPunkt, { backgroundColor: farbe }]} />
      <Text style={st.ampelText} numberOfLines={1}>
        <Text style={{ fontWeight: '800' }}>{AMPEL_LABEL[k.ampel]}</Text>
        {text ? ` · ${text}` : ''}
      </Text>
      <Icon name="information" size={16} farbe={F.grau} />
    </Pressable>
  );
}

function Hinweis({ text }: { text: string }) {
  return (
    <View style={st.hinweisReihe}>
      <Icon name="flag" size={16} farbe={F.rot} />
      <Text style={st.hinweis}>{text}</Text>
    </View>
  );
}

export function farbeRichtung(s: Signal): string {
  // Für die Preisfrage: knapper/mehr Interesse = grün (eher teurer), Neuauflage/fallend = rot
  if (s.richtung === 'hoch') return F.gruen;
  if (s.richtung === 'runter') return F.rot;
  return F.grau;
}


const st = StyleSheet.create({
  wurzel: { flex: 1, backgroundColor: F.papier },
  kopf: { flexDirection: 'row', gap: 12 },
  cover: { borderWidth: 2, borderColor: F.tinte, width: 72, height: 108, backgroundColor: F.linie },
  titel: { fontSize: 24, fontWeight: '800', color: F.tinte, letterSpacing: -0.3 },
  autor: { fontSize: 16, color: F.tinte, marginTop: 2 },
  klein: { fontSize: 13, color: F.grau, marginTop: 2 },
  mini: { fontSize: 11, color: F.grau },
  reihe: { flexDirection: 'row', flexWrap: 'wrap' },
  trendReihe: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  trend: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 2 },
  trendText: { fontWeight: '700' },
  statusReihe: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statusTeil: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  status: { fontSize: 13, fontWeight: '700' },
  lage: { fontSize: 15, fontWeight: '700', color: F.tinte, marginTop: 6, marginBottom: 6 },
  angebot: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: F.karte, padding: 12, marginTop: 8, borderWidth: 2, borderColor: 'transparent' },
  angebotGewaehlt: { borderColor: F.gruen, backgroundColor: hell(F.gruen, 0.06) },
  vergleich: { fontSize: 12, fontWeight: '800', color: F.gruen, marginTop: 2 },
  uebergangen: { fontSize: 12, fontWeight: '700', color: F.orange, marginTop: 2 },
  angebotAus: { opacity: 0.75, borderStyle: 'dashed', borderColor: F.linie },
  passtNicht: { paddingLeft: 4, alignSelf: 'flex-start' },
  ampel: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 2, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 10 },
  ampelPunkt: { width: 12, height: 12, borderRadius: 6 },
  ampelText: { flex: 1, fontSize: 13, color: F.tinte },
  angebotKopf: { fontSize: 14, color: F.tinte },
  plattform: { fontWeight: '800' },
  angebotPreis: { fontSize: 17, fontWeight: '800', color: F.tinte },
  link: { color: F.blau, fontWeight: '700', marginTop: 6 },
  hinweisReihe: { flexDirection: 'row', gap: 6, marginTop: 8, alignItems: 'flex-start' },
  hinweis: { flex: 1, color: F.rot, fontSize: 13, fontWeight: '600' },
  eingabe: { backgroundColor: F.karte, borderWidth: 2, borderColor: F.tinte, padding: 12, fontSize: 18, marginTop: 10 },
  neupreisReihe: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  neupreisFeld: { width: 110, textAlign: 'right', marginTop: 0, paddingVertical: 8 },
  // Der Preis-Zettel: weiß, Tintenrahmen, harter Schatten in Kategoriefarbe
  ergebnis: { padding: ABSTAND, marginTop: 24, marginRight: 6, backgroundColor: F.karte, borderWidth: 2, borderColor: F.tinte },
  ergebnisKopf: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ergebnisTitel: { flex: 1, fontFamily: SCHRIFT.hand, fontSize: 26, color: F.hand, lineHeight: 28 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginVertical: 12 },
  preisGross: { fontSize: 42, fontWeight: '800', color: F.tinte, minWidth: 140, textAlign: 'center', fontVariant: ['tabular-nums'] },
  erklaerung: { fontSize: 13, color: F.grau, marginTop: 2 },
  fuss: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 10, padding: ABSTAND, backgroundColor: F.papier, borderTopWidth: 2, borderTopColor: F.tinte },
});
