// Einstellungen: Preisquellen, Preisregeln, Abläufe, KI, Vergleichslinks.
import React, { useEffect, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Text, TextInput } from '../components/Schrift';
import { Einstellungen, STANDARD_EINSTELLUNGEN, parseZahl, zahlText } from '../einstellungen';
import { einstellungenSpeichern, ignorierteHaendlerLaden, ignorierteHaendlerSpeichern, korrekturenLaden, korrekturenLoeschen } from '../db';
import { Auswertung, werteKorrekturenAus } from '../lib/korrektur';
import { quellenTesten } from '../dienste';
import { VERSION_TEXT } from '../version';
import { Merkmal, MERKMAL_LABEL, ZweigRegeln, Zustand, ZUSTAND_LABEL } from '../lib/preis';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BEREICH, F, hell, RADIUS, ABSTAND, ZUSTAND_FARBE } from '../theme';
import { Chip, Icon, IconName, Knopf, Kopf, MERKMAL_ICON, Stepper } from '../components/Teile';
import { Feier, FeierDaten } from '../components/Feier';
import { Stufe } from '../lib/seltenheit';

/** Beispiele für „Karten ausprobieren“ – je Metall ein erfundener, aber plausibler Fund */
const probe = (stufe: Stufe, titel: string, autor: string, jahr: string, preis: number, gruende: string[]): FeierDaten => ({
  titel: { quelle: 'manuell', titel, autoren: [autor], jahr },
  preis,
  seltenheit: { stufe, bestaetigt: true, moeglich: false, gruende, vorbehalte: [], effekt: stufe === 'gewoehnlich' ? 'keiner' : 'voll' },
  ort: preis >= 15 ? 'Ins Lager' : 'Regal',
});
const PROBEN: { label: string; daten: FeierDaten }[] = [
  { label: 'Bronze', daten: probe('gewoehnlich', 'Die Liebe: Psychologie eines Phänomens', 'Lauster, Peter', '2009', 3, []) },
  { label: 'Silber', daten: probe('gefragt', 'Faserland', 'Kracht, Christian', '1995', 12, ['nur 8 Angebote online']) },
  { label: 'Gold', daten: probe('selten', 'Die Ausgewanderten', 'Sebald, W. G.', '1992', 45, ['nur 3 Angebote online']) },
  { label: 'Schwarz', daten: probe('raritaet', 'Der Untertan', 'Mann, Heinrich', '1918', 120, ['nur 1 Angebot online', 'erschienen 1918, Erstausgabe']) },
];

interface Props {
  einst: Einstellungen;
  onGespeichert: (e: Einstellungen) => void;
  /** Erste-Schritte-Einführung erneut zeigen */
  onEinfuehrung?: () => void;
}

export function EinstellungenScreen({ einst, onGespeichert, onEinfuehrung }: Props) {
  const [e, setE] = useState<Einstellungen>(einst);
  const [test, setTest] = useState<string | null>(null);
  const [testLaeuft, setTestLaeuft] = useState(false);
  const [probeDaten, setProbeDaten] = useState<FeierDaten | null>(null);
  const rand = useSafeAreaInsets();
  useEffect(() => setE(einst), [einst]);
  const [ignoriert, setIgnoriert] = useState<string[]>([]);
  const [auswertung, setAuswertung] = useState<Auswertung | null>(null);
  // Bei jedem Öffnen frisch: Beides ändert sich beim Auspreisen, nicht hier
  useEffect(() => {
    ignorierteHaendlerLaden().then(setIgnoriert).catch(() => undefined);
    korrekturenLaden()
      .then((k) => setAuswertung(werteKorrekturenAus(k)))
      .catch(() => undefined);
  }, [einst]);

  const r = e.regeln;
  const setR = (patch: Partial<Einstellungen['regeln']>) => setE({ ...e, regeln: { ...r, ...patch } });
  const setK = (patch: Partial<Einstellungen['regeln']['knappheit']>) => setR({ knappheit: { ...r.knappheit, ...patch } });
  const sr = e.seltenheit;
  const setS = (patch: Partial<Einstellungen['seltenheit']>) => setE({ ...e, seltenheit: { ...sr, ...patch } });
  /** Anteil → ganze Prozent, ohne Fließkomma-Krümel (0.35 → 35) */
  const pz = (x: number) => Math.round(x * 1000) / 10;
  const setZweig = (zweig: 'laden' | 'lager') => (patch: Partial<ZweigRegeln>) =>
    setE({ ...e, regeln: { ...r, [zweig]: { ...r[zweig], ...patch } } });

  const speichern = async (neu: Einstellungen = e) => {
    await einstellungenSpeichern(neu);
    onGespeichert(neu);
    Alert.alert('Gespeichert');
  };

  const testen = async () => {
    setTestLaeuft(true);
    try {
      setTest(await quellenTesten(e));
    } catch (err) {
      setTest(`Test abgebrochen: ${String(err)}`);
    } finally {
      setTestLaeuft(false);
    }
  };

  return (
    <View style={st.wurzel}>
      <Kopf titel="Einstellungen" icon="cog" farbe={BEREICH.einst} />
      <ScrollView contentContainerStyle={{ padding: ABSTAND, paddingBottom: 120 }}>
        <Text selectable style={[st.klein, { textAlign: 'center', marginBottom: 8 }]}>{VERSION_TEXT}</Text>
        <Abschnitt titel="Preisquellen" icon="store-search" farbe={F.blau}>
          <Schalter label="booklooker" wert={e.booklooker.aktiv} setze={(v) => setE({ ...e, booklooker: { ...e.booklooker, aktiv: v } })} />
          <Feld label="Partner-ID (pid)" wert={e.booklooker.pid} setze={(v) => setE({ ...e, booklooker: { ...e.booklooker, pid: v.trim() } })} />
          <Schalter label="eurobuch" wert={e.eurobuch.aktiv} setze={(v) => setE({ ...e, eurobuch: { ...e.eurobuch, aktiv: v } })} />
          <Feld label="Benutzer" wert={e.eurobuch.benutzer} setze={(v) => setE({ ...e, eurobuch: { ...e.eurobuch, benutzer: v.trim() } })} />
          {e.eurobuch.benutzer === 'test' && (
            <Text style={[st.klein, { color: F.rot }]}>Testzugang: liefert nur wenige Abfragen pro Tag und dann „0 Angebote“. Echten Partnerzugang bei eurobuch beantragen.</Text>
          )}
          {!e.eurobuch.benutzer && <Text style={st.klein}>Ohne Zugang ist eurobuch aus. Passwörter liegen im sicheren Speicher des Geräts.</Text>}
          <Feld label="Passwort" wert={e.eurobuch.passwort} geheim setze={(v) => setE({ ...e, eurobuch: { ...e.eurobuch, passwort: v } })} />
          <Schalter label="eBay" wert={e.ebay.aktiv} setze={(v) => setE({ ...e, ebay: { ...e.ebay, aktiv: v } })} />
          {!e.ebay.aktiv && !!e.ebay.clientId && (
            <Text style={[st.klein, { color: F.rot }]}>eBay ist ausgeschaltet – beim Scannen wird eBay nicht gefragt.</Text>
          )}
          <Feld label="Client-ID" wert={e.ebay.clientId} setze={(v) => setE({ ...e, ebay: { ...e.ebay, clientId: v.trim() } })} />
          <Feld label="Client-Secret" wert={e.ebay.clientSecret} geheim setze={(v) => setE({ ...e, ebay: { ...e.ebay, clientSecret: v.trim() } })} />
          <Feld label="Google-Books-Schlüssel (Cover, optional)" wert={e.googleBooksKey} geheim setze={(v) => setE({ ...e, googleBooksKey: v.trim() })} />
          <ZahlFeld label="Versandpauschale, wenn unbekannt" einheit="€" schritt={0.5} wert={e.versandPauschale} setze={(v) => setE({ ...e, versandPauschale: v })} />
          <Knopf label={testLaeuft ? 'Teste …' : 'Quellen testen'} icon="stethoscope" leise farbe={F.blau} onPress={testen} deaktiviert={testLaeuft} stil={{ marginTop: 10 }} />
        </Abschnitt>

        <ZweigBlock
          titel="Laden-Regeln"
          icon="store"
          farbe={F.gruen}
          hinweis="Für Grabbelkiste und Regal: das günstigste vergleichbare Angebot unterbieten, damit das Buch weggeht."
          z={r.laden}
          setze={setZweig('laden')}
        />
        <ZweigBlock
          titel="Lager-Regeln"
          icon="archive-arrow-down"
          farbe={F.lila}
          hinweis="Für Bücher, die ins Lager gehen: ungefähr das zweitgünstigste vergleichbare Angebot – dort darf es etwas mehr sein."
          z={r.lager}
          setze={setZweig('lager')}
        />

        <Abschnitt titel="Zustand & Merkmale" icon="star-half-full" farbe={F.tuerkis}>
          <Text style={st.klein}>
            Auf- und Abschläge in Prozent vom Vergleichspreis, für Laden und Lager gleich. Jeder Posten erscheint als eigene Zeile in der Rechnung.
          </Text>
          <Text style={[st.label, { marginTop: 10, fontWeight: '700', color: F.tinte }]}>Zustand (+ besser, − schlechter als der Normalfall)</Text>
          {ZUSTAENDE.map((zz) => (
            <ZahlFeld
              key={zz}
              punkt={ZUSTAND_FARBE[zz]}
              label={ZUSTAND_LABEL[zz]}
              einheit="%"
              schritt={5}
              min={-90}
              max={100}
              vorzeichen
              wert={Math.round(r.zustand[zz] * 1000) / 10}
              setze={(v) => setR({ zustand: { ...r.zustand, [zz]: v / 100 } })}
            />
          ))}
          <Text style={[st.label, { marginTop: 14, fontWeight: '700', color: F.tinte }]}>Merkmale (nur Zuschläge)</Text>
          {MERKMALE.map((m) => {
            const z = r.merkmale[m];
            const setM = (patch: Partial<typeof z>) => setR({ merkmale: { ...r.merkmale, [m]: { ...z, ...patch } } });
            return (
              <View key={m} style={st.merkmalBlock}>
                <View style={st.feldReihe}>
                  <Icon name={MERKMAL_ICON[m]} size={18} farbe={F.lila} />
                  <Text style={[st.label, { flex: 1 }]}>{MERKMAL_LABEL[m]}</Text>
                  <Chip klein label="%" farbe={F.lila} aktiv={z.art === 'prozent'} onPress={() => setM({ art: 'prozent', wert: z.art === 'prozent' ? z.wert : 0.1 })} />
                  <Chip klein label="€" farbe={F.lila} aktiv={z.art === 'euro'} onPress={() => setM({ art: 'euro', wert: z.art === 'euro' ? z.wert : 10 })} />
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  {z.art === 'prozent' ? (
                    <Stepper farbe={F.lila} einheit="%" schritt={5} max={500} wert={Math.round(z.wert * 1000) / 10} setze={(v) => setM({ wert: (v ?? 0) / 100 })} />
                  ) : (
                    <Stepper farbe={F.lila} einheit="€" schritt={5} max={10000} wert={z.wert} setze={(v) => setM({ wert: v ?? 0 })} />
                  )}
                </View>
              </View>
            );
          })}
        </Abschnitt>

        <Abschnitt titel="Knappheit (Preis)" icon="chart-bell-curve" farbe={F.rot}>
          <Text style={st.klein}>
            Zu- oder Abschlag nach Zahl der Online-Angebote, als eigene Zeile in der Rechnung. Fehlt eine Preisquelle, wird Knappheit nicht gewertet.
          </Text>
          <ZahlFeld label="1 Angebot" einheit="%" schritt={5} max={300} wert={pz(r.knappheit.einAngebot)} setze={(v) => setK({ einAngebot: v / 100 })} />
          <ZahlFeld label="2–3 Angebote" einheit="%" schritt={5} max={300} wert={pz(r.knappheit.zweiDrei)} setze={(v) => setK({ zweiDrei: v / 100 })} />
          <ZahlFeld label="4–6 Angebote" einheit="%" schritt={5} max={300} wert={pz(r.knappheit.vierSechs)} setze={(v) => setK({ vierSechs: v / 100 })} />
          <ZahlFeld label="Massenware ab … Angeboten" schritt={5} min={7} max={1000} wert={r.knappheit.massenwareAb} setze={(v) => setK({ massenwareAb: Math.round(v) })} />
          <ZahlFeld label="Massenware-Abschlag" einheit="%" schritt={1} max={90} wert={pz(r.knappheit.massenware)} setze={(v) => setK({ massenware: v / 100 })} />
          <ZahlFeld label="Nicht unterbieten bis … Angebote" schritt={1} max={10} wert={r.knappheit.nichtUnterbietenBis} setze={(v) => setK({ nichtUnterbietenBis: Math.round(v) })} />
          <ZahlFeld label="Keine Knappheit bei Neuerscheinungen der letzten … Jahre" schritt={1} max={30} wert={r.knappheit.neuBisJahre} setze={(v) => setK({ neuBisJahre: Math.round(v) })} />
        </Abschnitt>

        <Abschnitt titel="Vergleich absichern" icon="check-circle" farbe={F.gruen}>
          <Text style={st.klein}>
            Ein einzelnes falsches Angebot ganz unten soll nicht den Preis bestimmen. Mängelexemplare, Hörbücher, Sets, nur Umschläge,
            teurer Auslandsversand und – bei der Titelsuche – Angebote mit anderem Titel/Autor werden immer aussortiert und stehen mit Grund
            unter „aussortiert“. Was übergangen wird, steht in der Rechnung.
          </Text>
          <Schalter
            label="Ausreißer nach unten übergehen"
            wert={r.robust.ausreisserUebergehen}
            setze={(v) => setR({ robust: { ...r.robust, ausreisserUebergehen: v } })}
          />
          <Schalter
            label="Großhändler (momox, rebuy …) übergehen"
            wert={r.robust.grosshaendlerUebergehen}
            setze={(v) => setR({ robust: { ...r.robust, grosshaendlerUebergehen: v } })}
          />
          <ZahlFeld
            label="Laden: Mittel der 2 günstigsten ab … Angeboten (0 = aus)"
            schritt={1}
            max={50}
            wert={r.robust.mittelAusZweiAb}
            setze={(v) => setR({ robust: { ...r.robust, mittelAusZweiAb: Math.round(v) } })}
          />
        </Abschnitt>

        <Abschnitt titel="Ignorierte Händler" icon="store-off" farbe={F.grau}>
          <Text style={st.klein}>Über ✕ im Preis-Blatt hinzugefügt. Ihre Angebote zählen nie als Vergleich. Antippen = wieder zulassen.</Text>
          {ignoriert.length === 0 ? (
            <Text style={[st.klein, { marginTop: 6 }]}>Keine.</Text>
          ) : (
            <View style={st.reihe}>
              {ignoriert.map((h) => (
                <Chip
                  key={h}
                  icon="close"
                  label={h}
                  farbe={F.grau}
                  onPress={async () => {
                    const neu = ignoriert.filter((x) => x !== h);
                    await ignorierteHaendlerSpeichern(neu);
                    setIgnoriert(neu);
                  }}
                />
              ))}
            </View>
          )}
        </Abschnitt>

        <Abschnitt titel="Korrektur-Protokoll" icon="chart-line" farbe={F.blau}>
          <Text style={st.klein}>
            Jede Abweichung vom Vorschlag wird gemerkt: Preis von Hand geändert, anderes Vergleichsangebot gewählt, Angebot aussortiert.
            Nach ein paar Wochen zeigt sich, welche Regel systematisch danebenliegt.
          </Text>
          {auswertung && auswertung.n > 0 ? (
            <View style={{ marginTop: 8, gap: 4 }}>
              <Text style={st.wert}>
                {auswertung.n} Korrekturen · {auswertung.mitPreis} mit Preisänderung
                {auswertung.mittel != null ? ` (im Schnitt ${auswertung.mittel >= 0 ? '+' : '−'}${Math.round(Math.abs(auswertung.mittel) * 100)} %)` : ''}
              </Text>
              <Text style={st.klein}>
                {auswertung.vergleichVonHand}× anderen Vergleich gewählt · {auswertung.aussortiertVonHand}× Angebote aussortiert
              </Text>
              {auswertung.nachKategorie.map((g) => (
                <Text key={g.name} style={st.klein}>
                  {g.name}: {g.n}× · {g.mittel >= 0 ? '+' : '−'}{Math.round(Math.abs(g.mittel) * 100)} %
                </Text>
              ))}
              {auswertung.auffaellig.map((a) => (
                <Text key={a} style={[st.klein, { color: F.rot, fontWeight: '700' }]}>⚑ {a}</Text>
              ))}
              <View style={[st.reihe, { marginTop: 6 }]}>
                <Chip
                  icon="trash-can-outline"
                  label="Protokoll leeren"
                  farbe={F.rot}
                  onPress={() =>
                    Alert.alert('Korrektur-Protokoll leeren?', 'Alle gemerkten Korrekturen werden gelöscht. Das lässt sich nicht rückgängig machen.', [
                      { text: 'Abbrechen', style: 'cancel' },
                      {
                        text: 'Leeren',
                        style: 'destructive',
                        onPress: async () => {
                          await korrekturenLoeschen();
                          setAuswertung(werteKorrekturenAus([]));
                        },
                      },
                    ])
                  }
                />
              </View>
            </View>
          ) : (
            <Text style={[st.klein, { marginTop: 6 }]}>Noch keine Korrekturen.</Text>
          )}
        </Abschnitt>

        <Abschnitt titel="Seltenheit & Glitzer" icon="star-four-points" farbe={F.lila}>
          <Text style={st.klein}>
            Stufen Gefragt → Selten → Rarität. Glitzer gibt es nur, wenn die Gründe belegt sind (Fehlalarm-Schutz) – sonst erscheint das Abzeichen mit „prüfen“. Neuerscheinungen und noch lieferbare Bücher zählen nicht als selten.
          </Text>
          <Schalter label="Glitzer-Effekte" wert={sr.effekte} setze={(v) => setS({ effekte: v })} />
          <Schalter label="Große Enthüllung bei Gold und Schwarz" wert={sr.feier} setze={(v) => setS({ feier: v })} />
          <Schalter label="Karten neigen sich mit dem Handy (3D)" wert={sr.neigung} setze={(v) => setS({ neigung: v })} />
          <Text style={[st.label, { marginTop: 8 }]}>Karten ausprobieren (Gold und Schwarz mit großer Feier)</Text>
          <View style={st.reihe}>
            {PROBEN.map((x) => (
              <Chip key={x.label} label={x.label} farbe={F.tinte} onPress={() => setProbeDaten(x.daten)} />
            ))}
          </View>
          <Schalter label="Vibration bei seltenen Büchern" wert={sr.vibration} setze={(v) => setS({ vibration: v })} />
          <Text style={[st.label, { marginTop: 10, fontWeight: '700', color: F.tinte }]}>Nach Angebotszahl (höchstens)</Text>
          <ZahlFeld label="Gefragt bis" schritt={1} max={100} wert={sr.gefragtBisAngebote} setze={(v) => setS({ gefragtBisAngebote: Math.round(v) })} />
          <ZahlFeld label="Selten bis" schritt={1} max={50} wert={sr.seltenBisAngebote} setze={(v) => setS({ seltenBisAngebote: Math.round(v) })} />
          <ZahlFeld label="Rarität bis (und alt oder Merkmal)" schritt={1} max={10} wert={sr.raritaetBisAngebote} setze={(v) => setS({ raritaetBisAngebote: Math.round(v) })} />
          <Text style={[st.label, { marginTop: 10, fontWeight: '700', color: F.tinte }]}>Nach Preis (ab)</Text>
          <ZahlFeld label="Gefragt ab" einheit="€" schritt={5} max={10000} wert={sr.gefragtAbPreis} setze={(v) => setS({ gefragtAbPreis: v })} />
          <ZahlFeld label="Selten ab" einheit="€" schritt={5} max={10000} wert={sr.seltenAbPreis} setze={(v) => setS({ seltenAbPreis: v })} />
          <ZahlFeld label="Rarität ab" einheit="€" schritt={10} max={100000} wert={sr.raritaetAbPreis} setze={(v) => setS({ raritaetAbPreis: v })} />
          <Text style={[st.label, { marginTop: 10, fontWeight: '700', color: F.tinte }]}>Fehlalarm-Schutz</Text>
          <ZahlFeld label="„Alt“ heißt erschienen vor" schritt={10} min={1450} max={2100} wert={sr.altVor} setze={(v) => setS({ altVor: Math.round(v) })} />
          <ZahlFeld label="Bestätigendes Angebot höchstens ± (vom Vergleich)" einheit="%" schritt={5} min={5} max={200} wert={pz(sr.bestaetigungsSpanne)} setze={(v) => setS({ bestaetigungsSpanne: v / 100 })} />
          <ZahlFeld label="Neuerscheinung = erschienen in den letzten … Jahren" schritt={1} max={30} wert={sr.neuBisJahre} setze={(v) => setS({ neuBisJahre: Math.round(v) })} />
          <ZahlFeld label="Neuerscheinung zählt nach Preis erst ab … über Neupreis" einheit="%" schritt={5} max={500} wert={pz(sr.neuUeberNeupreis)} setze={(v) => setS({ neuUeberNeupreis: v / 100 })} />
        </Abschnitt>

        <Abschnitt titel="Grenzen & Raster" icon="calculator-variant" farbe={F.orange}>
          <ZahlFeld label="Regal ab" einheit="€" schritt={0.5} wert={r.regalAb} setze={(v) => setR({ regalAb: v })} />
          <ZahlFeld label="Ins Lager ab (Ladenpreis)" einheit="€" schritt={1} wert={r.lagerAb} setze={(v) => setR({ lagerAb: v })} />
          <Feld
            label="Grabbelkisten-Preise (€, mit ; getrennt)"
            wert={r.grabbelPreise.map(zahlText).join('; ')}
            setze={(v) => setR({ grabbelPreise: v.split(';').map((x) => parseZahl(x)).filter((x): x is number => x != null).sort((a, b) => a - b) })}
          />
          <ZahlFeld label="Raster" einheit="€" schritt={0.1} min={0.1} wert={r.raster} setze={(v) => setR({ raster: v })} />
          <View style={st.reihe}>
            <Chip label="kaufmännisch runden" farbe={F.orange} aktiv={r.rundung === 'naechst'} onPress={() => setR({ rundung: 'naechst' })} />
            <Chip label="immer abrunden" farbe={F.orange} aktiv={r.rundung === 'ab'} onPress={() => setR({ rundung: 'ab' })} />
          </View>
        </Abschnitt>

        <Abschnitt titel="Abläufe" icon="lightning-bolt" farbe={F.orange}>
          <Schalter label="Schnellmodus (1 Treffer → direkt weiter)" wert={e.schnellmodus} setze={(v) => setE({ ...e, schnellmodus: v })} />
          <Schalter label="Trends (Wikipedia, Neuauflage)" wert={e.trendAktiv} setze={(v) => setE({ ...e, trendAktiv: v })} />
        </Abschnitt>

        <Abschnitt titel="KI (optional)" icon="robot" farbe={F.lila}>
          <Text style={st.klein}>
            OpenAI-kompatible Schnittstelle, z. B. Ollama: http://IP-des-PCs:11434/v1 – im Android-Emulator http://10.0.2.2:11434/v1.
            Damit ein Handy im WLAN den PC erreicht, Ollama mit OLLAMA_HOST=0.0.0.0 starten.
          </Text>
          <Schalter label="KI-Knopf bei Titelseiten anzeigen" wert={e.ki.aktiv} setze={(v) => setE({ ...e, ki: { ...e.ki, aktiv: v } })} />
          <Feld label="Basis-URL" wert={e.ki.basisUrl} setze={(v) => setE({ ...e, ki: { ...e.ki, basisUrl: v.trim() } })} />
          <Feld label="Modell für Titelseiten (Bild), z. B. qwen2.5vl:7b" wert={e.ki.modell} setze={(v) => setE({ ...e, ki: { ...e.ki, modell: v.trim() } })} />
          <Feld label="Modell für Kurzbeschreibung (Text), z. B. gemma3:12b" wert={e.ki.textModell} setze={(v) => setE({ ...e, ki: { ...e.ki, textModell: v.trim() } })} />
          <Feld label="API-Schlüssel" wert={e.ki.apiKey} geheim setze={(v) => setE({ ...e, ki: { ...e.ki, apiKey: v.trim() } })} />
        </Abschnitt>

        <Abschnitt titel="Vergleichslinks (bei 0 Treffern)" icon="link-variant" farbe={F.tuerkis}>
          <Text style={st.klein}>Platzhalter {'{isbn}'} und {'{suche}'}</Text>
          {e.links.map((l, i) => (
            <View key={l.name}>
              <Feld label={`${l.name} – ISBN`} wert={l.isbn} setze={(v) => setE({ ...e, links: e.links.map((x, j) => (j === i ? { ...x, isbn: v } : x)) })} />
              <Feld label={`${l.name} – Text`} wert={l.text} setze={(v) => setE({ ...e, links: e.links.map((x, j) => (j === i ? { ...x, text: v } : x)) })} />
            </View>
          ))}
        </Abschnitt>

        <Knopf label="Einführung ansehen" icon="gesture-tap" leise farbe={F.tinte} onPress={() => onEinfuehrung?.()} stil={{ marginBottom: 10 }} />
        <Knopf
          label="Auf Standard zurücksetzen"
          icon="restore"
          leise
          farbe={F.rot}
          onPress={() =>
            Alert.alert('Zurücksetzen?', 'Zugangsdaten bleiben erhalten.', [
              { text: 'Abbrechen', style: 'cancel' },
              {
                text: 'Zurücksetzen',
                onPress: () =>
                  speichern({ ...STANDARD_EINSTELLUNGEN, booklooker: e.booklooker, eurobuch: e.eurobuch, ebay: e.ebay, ki: e.ki, googleBooksKey: e.googleBooksKey }),
              },
            ])
          }
        />
      </ScrollView>
      <View style={st.fuss}>
        <Knopf label="Speichern" icon="content-save" farbe={BEREICH.einst} onPress={() => speichern()} />
      </View>

      <Feier daten={probeDaten} effekte={e.seltenheit.effekte} onZu={() => setProbeDaten(null)} />
      {test != null && (
        <Modal visible animationType="slide" onRequestClose={() => setTest(null)}>
          <ScrollView style={{ flex: 1, backgroundColor: F.papier }} contentContainerStyle={{ padding: ABSTAND, paddingTop: rand.top + ABSTAND, paddingBottom: rand.bottom + ABSTAND }}>
            <View style={st.abschnittKopf}>
              <Icon name="stethoscope" size={20} farbe={F.blau} />
              <Text style={[st.ueberschrift, { color: F.blau, marginBottom: 0 }]}>Rohantwort der Quellen</Text>
            </View>
            <Text selectable style={st.mono}>{test}</Text>
            <Knopf label="Schließen" icon="close" onPress={() => setTest(null)} stil={{ marginTop: 20 }} />
          </ScrollView>
        </Modal>
      )}
    </View>
  );
}

const ZUSTAENDE = Object.keys(ZUSTAND_LABEL) as Zustand[];
const MERKMALE = Object.keys(MERKMAL_LABEL) as Merkmal[];

/** Ein Regelsatz (Laden oder Lager) zum Bearbeiten. */
function ZweigBlock({
  titel, icon, farbe, hinweis, z, setze,
}: {
  titel: string;
  icon: IconName;
  farbe: string;
  hinweis: string;
  z: ZweigRegeln;
  setze: (patch: Partial<ZweigRegeln>) => void;
}) {
  return (
    <Abschnitt titel={titel} icon={icon} farbe={farbe}>
      <Text style={st.klein}>{hinweis}</Text>

      <Text style={[st.label, { fontWeight: '700', color: F.tinte, marginTop: 10 }]}>Anker (Vergleichsangebot)</Text>
      <View style={[st.reihe, { marginTop: 2 }]}>
        <Chip label="günstigstes" farbe={farbe} aktiv={z.anker === 'guenstigstes'} onPress={() => setze({ anker: 'guenstigstes' })} />
        <Chip label="zweitgünstigstes" farbe={farbe} aktiv={z.anker === 'zweitguenstigstes'} onPress={() => setze({ anker: 'zweitguenstigstes' })} />
      </View>

      <ZahlFeld
        label="Unter Markt (unterbieten)"
        einheit="%"
        schritt={5}
        max={90}
        wert={Math.round(z.marktAbschlag * 1000) / 10}
        setze={(v) => setze({ marktAbschlag: v / 100 })}
      />

      <Text style={[st.label, { marginTop: 12 }]}>Nur vergleichbare Angebote als Anker</Text>
      <View style={[st.reihe, { marginTop: 2 }]}>
        <Chip label="gleiche Ausgabe (Jahr)" farbe={farbe} aktiv={z.nurGleicheAusgabe} onPress={() => setze({ nurGleicheAusgabe: !z.nurGleicheAusgabe })} />
        <Chip label="gleicher Zustand" farbe={farbe} aktiv={z.nurGleicherZustand} onPress={() => setze({ nurGleicherZustand: !z.nurGleicherZustand })} />
      </View>
    </Abschnitt>
  );
}

function Abschnitt({ titel, icon, farbe, children }: { titel: string; icon: IconName; farbe: string; children: React.ReactNode }) {
  return (
    <View style={[st.abschnitt, { borderTopColor: farbe }]}>
      <View style={st.abschnittKopf}>
        <View style={[st.abschnittIcon, { backgroundColor: hell(farbe, 0.15) }]}>
          <Icon name={icon} size={18} farbe={farbe} />
        </View>
        <Text style={[st.ueberschrift, { color: farbe }]}>{titel}</Text>
      </View>
      {children}
    </View>
  );
}

function Feld({ label, wert, setze, geheim }: { label: string; wert: string; setze: (v: string) => void; geheim?: boolean }) {
  return (
    <View style={st.feld}>
      <Text style={st.label}>{label}</Text>
      <TextInput style={st.eingabe} value={wert} onChangeText={setze} secureTextEntry={geheim} autoCapitalize="none" autoCorrect={false} />
    </View>
  );
}

/** Zahl mit −/+-Knöpfen (Prozent ganzzahlig, Euro in Rasterschritten). */
function ZahlFeld(p: {
  label: string;
  wert: number;
  setze: (v: number) => void;
  schritt: number;
  einheit?: string;
  min?: number;
  max?: number;
  punkt?: string;
  /** „+10 %“ statt „10 %“ – bei Zustands-Auf-/Abschlägen */
  vorzeichen?: boolean;
}) {
  return (
    <View style={st.feldReihe}>
      {p.punkt && <View style={[st.punkt, { backgroundColor: p.punkt }]} />}
      <Text style={[st.label, { flex: 1 }]}>
        {p.label}
        {p.vorzeichen && p.wert !== 0 ? <Text style={{ color: p.wert > 0 ? F.gruen : F.rot, fontWeight: '800' }}>{p.wert > 0 ? '  ↑' : '  ↓'}</Text> : null}
      </Text>
      <Stepper wert={p.wert} schritt={p.schritt} min={p.min} max={p.max} einheit={p.einheit} setze={(v) => p.setze(v ?? 0)} />
    </View>
  );
}

function Schalter({ label, wert, setze }: { label: string; wert: boolean; setze: (v: boolean) => void }) {
  return (
    <View style={st.feldReihe}>
      <Text style={[st.label, { flex: 1, fontWeight: '700', color: F.tinte }]}>{label}</Text>
      <Switch value={wert} onValueChange={setze} trackColor={{ true: hell(BEREICH.einst, 0.5), false: F.linie }} thumbColor={wert ? BEREICH.einst : '#f4f3f4'} />
    </View>
  );
}

const st = StyleSheet.create({
  wurzel: { flex: 1, backgroundColor: F.papier },
  abschnitt: { borderWidth: 2, borderColor: F.tinte, backgroundColor: F.karte, padding: 14, marginBottom: 14, borderTopWidth: 8 },
  abschnittKopf: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  abschnittIcon: { borderWidth: 2, borderColor: F.tinte, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  ueberschrift: { flex: 1, fontSize: 13, fontWeight: '800', color: F.grau, textTransform: 'uppercase', letterSpacing: 1 },
  punkt: { width: 12, height: 12, borderRadius: 6 },
  klein: { fontSize: 12, color: F.grau, marginBottom: 6 },
  wert: { fontSize: 14, fontWeight: '700', color: F.tinte },
  feld: { marginTop: 8 },
  merkmalBlock: { borderTopWidth: 2, borderTopColor: F.tinte, paddingTop: 6, marginTop: 6 },
  feldReihe: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  label: { fontSize: 14, color: F.grau },
  eingabe: { backgroundColor: F.papier, borderWidth: 2, borderColor: F.tinte, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15, marginTop: 4 },
  reihe: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  mono: { fontFamily: 'monospace', fontSize: 12, color: F.tinte },
  fuss: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: ABSTAND, paddingBottom: 12, backgroundColor: F.papier, borderTopWidth: 2, borderTopColor: F.tinte },
});
