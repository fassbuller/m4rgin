// Hauptbildschirm: Kamera (Barcode oder Titelseite) bzw. Suche, Live-Karte, Stapel-Leiste.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../components/Schrift';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Titel } from '../lib/titel';
import { findeIsbnInText, normalisiereIsbn } from '../lib/isbn';
import { felderAusRollen, OcrZeile, Rolle, schaetzeRollen, SuchFelder } from '../lib/suche';
import { kiTitelseite } from '../lib/ki';
import { texterkennen, texterkennungVerfuegbar } from '../lib/texterkennung';
import { rueckmeldung } from '../lib/haptik';
import { fehlerText } from '../lib/fehler';
import { MarktErgebnis } from '../lib/markt';
import { euro, KATEGORIE_LABEL, PreisErgebnis } from '../lib/preis';
import { Signal } from '../lib/trend';
import { Einstellungen } from '../einstellungen';
import { LogEintrag, logAuspreisen, logSuche, logVerworfen, Methode } from '../db';
import { marktFuer, seltenheitFuer, sucheFelder, sucheIsbn, trendsFuer, vorlaeufig } from '../dienste';
import { useBewegung } from '../components/Glanz';
import { MitteKarte } from '../components/MitteKarte';
import { KartenInhalt } from '../components/BuchKarte';
import { LiveKarte } from '../components/LiveKarte';
import { AuspreisDaten, PreisSheet } from '../components/PreisSheet';
import { OcrSheet, TrefferListe } from '../components/Auswahl';
import { Zuletzt } from '../components/Zuletzt';
import { Icon, IconName, Knopf } from '../components/Teile';
import { BEREICH, F, ABSTAND, schatten } from '../theme';

type Modus = 'barcode' | 'foto' | 'suche';
const MODI: { id: Modus; label: string; icon: IconName }[] = [
  { id: 'barcode', label: 'Barcode', icon: 'barcode' },
  { id: 'foto', label: 'Titelseite', icon: 'book-open-page-variant' },
  { id: 'suche', label: 'Suche', icon: 'magnify' },
];

interface Vorgang {
  logId: number | null;
  start: number;
  methode: Methode;
  suchbegriff: string;
  laedt: boolean;
  fehler?: string;
  titel: Titel | null;
  markt: MarktErgebnis | null;
  marktLaedt: boolean;
  trends: Signal[] | null;
  vorlaeufig: PreisErgebnis | null;
  ausgepreist: boolean;
}

interface Props {
  aktiv: boolean; // Tab sichtbar → Kamera an
  einst: Einstellungen;
  stapel: { anzahl: number; summe: number; name?: string | null };
  onStapelGeaendert: () => void;
  onZumStapel: () => void;
  /** Thekenmodus: Stapel steht daneben → keine Stapel-Leiste unten */
  ohneStapelLeiste?: boolean;
}

export function ScanScreen({ aktiv, einst, stapel, onStapelGeaendert, onZumStapel, ohneStapelLeiste }: Props) {
  const oben = useSafeAreaInsets().top;
  const [erlaubnis, erlaubnisAnfragen] = useCameraPermissions();
  const kamera = useRef<CameraView>(null);
  const [modus, setModus] = useState<Modus>('barcode');
  const [licht, setLicht] = useState(false);
  const [vorgang, setVorgang] = useState<Vorgang | null>(null);
  const [sheetOffen, setSheetOffen] = useState(false);
  const [treffer, setTreffer] = useState<{ liste: Titel[]; gesamt: number; ohne: Titel } | null>(null);
  const [ocr, setOcr] = useState<{ uri: string; base64?: string; zeilen: OcrZeile[]; rollen: Rolle[] } | null>(null);
  const [beschaeftigt, setBeschaeftigt] = useState(false);
  const letzterCode = useRef<{ code: string; zeit: number } | null>(null);
  const vorgangRef = useRef<Vorgang | null>(null);
  vorgangRef.current = vorgang;

  // Seltenheit fürs Live-Overlay – solange noch nichts ausgepreist ist, mit dem vorläufigen Preis
  const bewegung = useBewegung(einst.seltenheit.effekte);
  const seltenheit = useMemo(
    () =>
      vorgang?.titel && !vorgang.marktLaedt
        ? seltenheitFuer(vorgang.titel, vorgang.markt, vorgang.vorlaeufig, [], vorgang.trends, einst.seltenheit)
        : null,
    [vorgang?.titel, vorgang?.markt, vorgang?.marktLaedt, vorgang?.vorlaeufig, vorgang?.trends, einst.seltenheit],
  );
  // Einmal pro Buch: bestätigt seltene Funde werden gefeiert (Vollbild-Enthüllung mit Teilen) –
  // ist die Feier aus, gibt es nur die Vibration; man merkt es so oder so, ohne hinzuschauen.
  // Ist das Buch erkannt und bepreist, wandert es von der Leiste unten als Karte in die Mitte
  // (Bronze bis Schwarz). Unbelegte Seltenheit erscheint als Bronze mit „prüfen“.
  const karteMittig =
    !!vorgang?.titel && !vorgang.laedt && !vorgang.marktLaedt && !!vorgang.vorlaeufig && !!seltenheit && !sheetOffen && !treffer && !ocr;
  const kartenInhalt: KartenInhalt | null =
    karteMittig && vorgang?.titel && seltenheit
      ? {
          titel: vorgang.titel,
          preis: vorgang.vorlaeufig?.vorschlag ?? null,
          stufe: seltenheit.bestaetigt ? seltenheit.stufe : 'gewoehnlich',
          pruefen: !seltenheit.bestaetigt && seltenheit.stufe !== 'gewoehnlich',
          ort: vorgang.vorlaeufig ? KATEGORIE_LABEL[vorgang.vorlaeufig.kategorie] : null,
        }
      : null;

  // Suche-Formular
  const [fTitel, setFTitel] = useState('');
  const [fAutor, setFAutor] = useState('');
  const [fJahr, setFJahr] = useState('');
  const [fIsbn, setFIsbn] = useState('');

  useEffect(() => {
    if (aktiv && erlaubnis && !erlaubnis.granted && erlaubnis.canAskAgain) erlaubnisAnfragen();
  }, [aktiv, erlaubnis]);

  /** Laufenden, nicht ausgepreisten Vorgang als „verworfen“ protokollieren. */
  const vorgangBeenden = useCallback(() => {
    const v = vorgangRef.current;
    if (v?.logId && !v.ausgepreist) logVerworfen(v.logId, v.titel ?? undefined).catch(() => undefined);
    setVorgang(null);
  }, []);

  /**
   * Nur den Vorgang ändern, zu dem die Antwort gehört. `start` ist eindeutig (anders als logId, die anfangs
   * null ist) – späte Antworten eines inzwischen ersetzten Vorgangs prallen so sicher ab.
   */
  const aendere = (patch: Partial<Vorgang>, start: number) =>
    setVorgang((v) => (v && v.start === start ? { ...v, ...patch } : v));

  /** Titel steht fest → Markt + Trends nachladen (Karte zeigt sie, sobald sie da sind). */
  const titelGewaehlt = useCallback(
    async (t: Titel, start: number, hinweis?: string) => {
      setTreffer(null);
      aendere({ titel: t, laedt: false, fehler: hinweis, marktLaedt: true }, start);
      try {
        const m = await marktFuer(t, einst);
        const alleAus = m.status.length > 0 && m.status.every((x) => !x.ok);
        aendere(
          {
            markt: m,
            marktLaedt: false,
            vorlaeufig: vorlaeufig(m, t, einst.regeln),
            // Alle Quellen gescheitert → sagen, warum kein Preis kommt, statt still „kein Preis“
            ...(alleAus ? { fehler: fehlerText(new Error(m.status[0].fehler ?? ''), 'Die Preisabfrage') } : {}),
          },
          start,
        );
      } catch (e) {
        aendere({ marktLaedt: false, fehler: fehlerText(e, 'Die Preisabfrage') }, start);
      }
      trendsFuer(t, einst)
        .then((tr) => aendere({ trends: tr }, start))
        .catch(() => undefined);
    },
    [einst],
  );

  const neuerVorgang = (methode: Methode, suchbegriff: string) => {
    vorgangBeenden();
    setSheetOffen(false);
    const v: Vorgang = {
      logId: null, start: Date.now(), methode, suchbegriff, laedt: true, titel: null, markt: null,
      marktLaedt: false, trends: null, vorlaeufig: null, ausgepreist: false,
    };
    setVorgang(v);
    return v;
  };

  const starteIsbn = useCallback(
    async (isbn: string, methode: Methode) => {
      const { start } = neuerVorgang(methode, isbn);
      let suchFehler: unknown = null;
      const liste = await sucheIsbn(isbn).catch((e) => {
        suchFehler = e;
        return [] as Titel[];
      });
      // Protokollieren darf scheitern, ohne den Vorgang zu stoppen
      const logId = await logSuche(methode, isbn, liste.length).catch(() => null);
      aendere({ logId }, start);
      // Auch ohne Titeldaten lohnt die Marktabfrage per ISBN
      const t: Titel = liste[0] ?? { quelle: 'manuell', titel: `ISBN ${isbn}`, autoren: [], isbn };
      if (liste.length > 1 && !einst.schnellmodus) {
        setTreffer({ liste, gesamt: liste.length, ohne: t });
        aendere({ laedt: false }, start);
      } else {
        const hinweis = suchFehler
          ? `${fehlerText(suchFehler, 'Die Titelsuche')} Preise per ISBN:`
          : liste.length === 0
            ? 'Nicht in DNB/Open Library – Preise per ISBN:'
            : undefined;
        titelGewaehlt(t, start, hinweis);
      }
    },
    [einst, titelGewaehlt],
  );

  const starteFelder = useCallback(
    async (f: SuchFelder, methode: Methode) => {
      const anzeige = [f.autor, f.titel].filter(Boolean).join(': ') || f.frei || '…';
      const { start } = neuerVorgang(methode, anzeige);
      const ohne: Titel = { quelle: 'manuell', titel: f.titel ?? anzeige, autoren: f.autor ? [f.autor] : [], jahr: f.jahr };
      try {
        const r = await sucheFelder(f);
        const logId = await logSuche(methode, r.cql ?? anzeige, r.treffer.length).catch(() => null);
        aendere({ logId, laedt: false }, start);
        if (r.treffer.length === 0) {
          // Viele Antiquariatsbücher (Vereinsschriften, Privatdrucke, vor 1913) fehlen in der DNB –
          // dann gleich per Titel bei den Preisquellen suchen statt eine leere Liste zu zeigen.
          titelGewaehlt(ohne, start, 'Nicht in der DNB – Angebote per Titel gesucht:');
        } else if (r.treffer.length === 1 && einst.schnellmodus) titelGewaehlt(r.treffer[0], start);
        else setTreffer({ liste: r.treffer, gesamt: r.gesamt, ohne });
      } catch (e) {
        // DNB nicht erreichbar: Preise trotzdem per Titel abfragen
        titelGewaehlt(ohne, start, `${fehlerText(e, 'Die DNB-Suche')} Angebote per Titel gesucht:`);
      }
    },
    [einst, titelGewaehlt],
  );

  // ---------- Kamera-Ereignisse ----------

  const barcodeErkannt = ({ data }: { data: string }) => {
    if (sheetOffen || treffer || ocr) return;
    const isbn = normalisiereIsbn(data);
    if (!isbn) return;
    const jetzt = Date.now();
    if (letzterCode.current && letzterCode.current.code === isbn && jetzt - letzterCode.current.zeit < 4000) return;
    letzterCode.current = { code: isbn, zeit: jetzt };
    rueckmeldung('scan');
    starteIsbn(isbn, 'barcode');
  };

  const fotoMachen = async () => {
    if (!kamera.current || beschaeftigt) return;
    setBeschaeftigt(true);
    try {
      const bild = await kamera.current.takePictureAsync({ quality: 0.5, base64: einst.ki.aktiv });
      if (!bild) return;
      const r = await texterkennen(bild.uri);
      // Ohne Texterkennung (Expo Go): Foto trotzdem zeigen – von dort geht es per KI oder Suche weiter
      if (!r) {
        setOcr({ uri: bild.uri, base64: bild.base64, zeilen: [], rollen: [] });
        return;
      }
      // Impressum fotografiert? Dann gleich per ISBN.
      const isbn = findeIsbnInText(r.text);
      if (isbn) {
        starteIsbn(isbn, 'foto_isbn');
        return;
      }
      const zeilen: OcrZeile[] = r.blocks.flatMap((b) =>
        b.lines.map((l) => ({ text: l.text, hoehe: l.frame?.height ?? 0, oben: l.frame?.top ?? 0 })),
      );
      setOcr({ uri: bild.uri, base64: bild.base64, zeilen, rollen: schaetzeRollen(zeilen) });
    } catch (e) {
      Alert.alert('Foto/Texterkennung', fehlerText(e, 'Die Texterkennung'));
    } finally {
      setBeschaeftigt(false);
    }
  };

  const ocrSuchen = (rollen: Rolle[]) => {
    if (!ocr) return;
    const f = felderAusRollen(ocr.zeilen, rollen);
    setOcr(null);
    starteFelder(f, 'foto_ocr');
  };

  const ocrKi = async () => {
    if (!ocr?.base64) return Alert.alert('KI', 'Für die KI muss sie vor dem Foto in den Einstellungen aktiv sein.');
    setBeschaeftigt(true);
    try {
      const a = await kiTitelseite(ocr.base64, einst.ki);
      setOcr(null);
      const isbn = a.isbn ? normalisiereIsbn(a.isbn) : null;
      if (isbn) starteIsbn(isbn, 'foto_ki');
      else starteFelder(a, 'foto_ki');
    } catch (e) {
      Alert.alert('KI', fehlerText(e, 'Die KI-Abfrage'));
    } finally {
      setBeschaeftigt(false);
    }
  };

  const formularSuchen = () => {
    const isbn = normalisiereIsbn(fIsbn);
    if (isbn) return starteIsbn(isbn, 'isbn_getippt');
    if (!fTitel && !fAutor) return Alert.alert('Suche', 'Titel, Autor:in oder ISBN eingeben.');
    starteFelder({ titel: fTitel, autor: fAutor, jahr: fJahr }, 'manuell');
  };

  const zuletztGewaehlt = (e: LogEintrag) => {
    if (e.isbn) return starteIsbn(e.isbn, 'isbn_getippt');
    const autor = e.autor?.split(';')[0]?.trim() || undefined;
    setFTitel(e.titel ?? '');
    setFAutor(autor ?? '');
    starteFelder({ titel: e.titel ?? undefined, autor }, 'manuell');
  };

  // ---------- Auspreisen ----------

  const speichern = async (d: AuspreisDaten) => {
    const v = vorgangRef.current;
    if (!v?.titel) return;
    let logId = v.logId;
    if (logId == null) logId = await logSuche(v.methode, v.suchbegriff, 0);
    await logAuspreisen(logId, { ...v.titel, neupreis: d.neupreis ?? undefined }, {
      vergleichspreis: d.anker?.gesamt ?? null,
      anzahlAngebote: v.markt?.lage.anzahl ?? null,
      zustand: d.zustand,
      merkmale: d.merkmale,
      vorschlag: d.ergebnis.vorschlag,
      endpreis: d.endpreis,
      kategorie: d.ergebnis.kategorie,
      dauerMs: Date.now() - v.start,
      markt: v.markt,
      anker: d.anker,
      trend: v.trends?.map((s) => s.text).filter(Boolean).join(' · ') || null,
    });
    setVorgang((x) => (x ? { ...x, ausgepreist: true } : x));
    setSheetOffen(false);
    setVorgang(null);
    onStapelGeaendert();
  };

  // ---------- Darstellung ----------

  const kameraNoetig = modus !== 'suche';

  return (
    <View style={st.wurzel}>
      {/* Suche hat hellen Grund → dunkle Statusleiste; Kamera bleibt hell. Nur solange der Reiter sichtbar ist. */}
      {aktiv && modus === 'suche' && <StatusBar style="dark" />}
      {kameraNoetig && aktiv && erlaubnis?.granted ? (
        <CameraView
          ref={kamera}
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={licht}
          barcodeScannerSettings={{ barcodeTypes: ['ean13'] }}
          onBarcodeScanned={modus === 'barcode' ? barcodeErkannt : undefined}
        />
      ) : kameraNoetig ? (
        <View style={st.keineKamera}>
          <Icon name="camera-off" size={56} farbe="#fff" />
          <Text style={[st.weiss, { marginTop: 12 }]}>Kamera-Zugriff wird benötigt.</Text>
          <Knopf label="Kamera erlauben" icon="camera" farbe={BEREICH.scan} onPress={erlaubnisAnfragen} stil={{ marginTop: 16 }} />
        </View>
      ) : (
        <ScrollView
          style={st.formular}
          contentContainerStyle={{ padding: ABSTAND, paddingTop: oben + 76, paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={st.formKopf}>
            <Icon name="magnify" size={26} farbe={BEREICH.scan} />
            <Text style={st.formTitel}>Suche von Hand</Text>
          </View>
          <Eingabe icon="book-open-variant" placeholder="Titel" value={fTitel} onChangeText={setFTitel} />
          <Eingabe icon="account-edit" placeholder="Autor:in" value={fAutor} onChangeText={setFAutor} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Eingabe icon="calendar" placeholder="Jahr" zahl value={fJahr} onChangeText={setFJahr} stil={{ flex: 1 }} />
            <Eingabe icon="barcode" placeholder="oder ISBN" zahl value={fIsbn} onChangeText={setFIsbn} stil={{ flex: 2 }} />
          </View>
          <Knopf label="Suchen" icon="magnify" farbe={BEREICH.scan} onPress={formularSuchen} stil={{ marginTop: 16 }} />
          <Zuletzt neuLaden={`${aktiv}|${stapel.anzahl}|${vorgang == null}`} onWaehle={zuletztGewaehlt} />
        </ScrollView>
      )}

      {/* Oben: Modus + Licht */}
      <View style={[st.oben, { top: oben + 10 }]}>
        <View style={st.segment}>
          {MODI.map((m) => {
            const aktiv = modus === m.id;
            return (
              <Pressable key={m.id} onPress={() => setModus(m.id)} style={[st.segTeil, aktiv && st.segAktiv]}>
                <Icon name={m.icon} size={18} farbe={aktiv ? '#fff' : '#E9E2D8'} />
                <Text style={[st.segText, aktiv && { color: '#fff' }]}>{m.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {kameraNoetig && (
          <Pressable onPress={() => setLicht(!licht)} style={[st.licht, licht && { backgroundColor: F.gelb }]} accessibilityLabel="Licht">
            <Icon name={licht ? 'flashlight' : 'flashlight-off'} size={22} farbe={licht ? F.tinte : '#fff'} />
          </Pressable>
        )}
      </View>

      {/* Sucher: zeigt, wohin das Buch gehört */}
      {kameraNoetig && erlaubnis?.granted && !vorgang && (
        <View style={st.sucherFlaeche} pointerEvents="none">
          <View style={modus === 'barcode' ? st.sucherBarcode : st.sucherSeite}>
            <View style={[st.ecke, st.eckeLO]} />
            <View style={[st.ecke, st.eckeRO]} />
            <View style={[st.ecke, st.eckeLU]} />
            <View style={[st.ecke, st.eckeRU]} />
          </View>
          <View style={st.hilfe}>
            <Icon name={modus === 'barcode' ? 'barcode-scan' : 'camera'} size={16} farbe="#fff" />
            <Text style={st.hilfeText}>
              {modus === 'barcode' ? 'Barcode auf der Rückseite in den Rahmen halten' : 'Titelseite in den Rahmen, dann auslösen'}
            </Text>
          </View>
        </View>
      )}

      {/* Unten: Live-Karte, Auslöser, Stapel */}
      <View style={st.unten}>
        {/* Während Suche und Preisabfrage (oder wenn es keinen Preis gibt) bleibt das Buch unten */}
        {vorgang && !karteMittig && (
          <LiveKarte
            titel={vorgang.titel}
            suchbegriff={vorgang.suchbegriff}
            laedt={vorgang.laedt}
            fehler={vorgang.fehler}
            markt={vorgang.markt}
            marktLaedt={vorgang.marktLaedt}
            vorlaeufig={vorgang.vorlaeufig}
            trends={vorgang.trends}
            seltenheit={seltenheit}
            bewegung={bewegung}
            onOeffnen={() => setSheetOffen(true)}
            onSchliessen={vorgangBeenden}
          />
        )}
        {modus === 'foto' && (
          <Pressable onPress={fotoMachen} style={[st.ausloeser, beschaeftigt && { opacity: 0.5 }]} accessibilityLabel="Foto aufnehmen">
            <View style={st.ausloeserInnen}>
              <Icon name="camera" size={30} farbe="#fff" />
            </View>
          </Pressable>
        )}
        {!ohneStapelLeiste && (
        <Pressable onPress={onZumStapel} style={st.stapel}>
          <View style={st.stapelIcon}>
            <Icon name="bookshelf" size={20} farbe={BEREICH.stapel} />
          </View>
          <View style={{ flex: 1 }}>
            {stapel.name ? (
              <Text style={st.stapelName} numberOfLines={1}>
                {stapel.name}
              </Text>
            ) : null}
            <Text style={st.stapelText} numberOfLines={1}>
              {stapel.anzahl} {stapel.anzahl === 1 ? 'Buch' : 'Bücher'}
              {stapel.name ? '' : ' auf dem Stapel'}
            </Text>
          </View>
          <Text style={st.stapelSumme}>{euro(stapel.summe)}</Text>
          <Icon name="chevron-right" size={24} farbe="#fff" />
        </Pressable>
        )}
      </View>

      {sheetOffen && vorgang?.titel && (
        <PreisSheet
          titel={vorgang.titel}
          markt={vorgang.markt}
          marktLaedt={vorgang.marktLaedt}
          trends={vorgang.trends}
          regeln={einst.regeln}
          seltenheitRegeln={einst.seltenheit}
          links={einst.links}
          onSpeichern={speichern}
          onVerwerfen={() => {
            setSheetOffen(false);
            vorgangBeenden();
          }}
        />
      )}
      {kartenInhalt && aktiv && vorgang && (
        <MitteKarte
          key={vorgang.start}
          inhalt={kartenInhalt}
          gruende={seltenheit?.gruende.filter((g) => !g.startsWith('Preis '))}
          enthuellung={einst.seltenheit.feier}
          bewegung={bewegung}
          neigung={einst.seltenheit.neigung}
          vibration={einst.seltenheit.vibration}
          onOeffnen={() => setSheetOffen(true)}
          onWeg={vorgangBeenden}
        />
      )}
      {treffer && (
        <TrefferListe
          treffer={treffer.liste}
          gesamt={treffer.gesamt}
          onWaehle={(t) => vorgangRef.current && titelGewaehlt(t, vorgangRef.current.start)}
          onOhneTreffer={() => vorgangRef.current && titelGewaehlt(treffer.ohne, vorgangRef.current.start)}
          onAbbrechen={() => {
            setTreffer(null);
            vorgangBeenden();
          }}
        />
      )}
      {ocr && (
        <OcrSheet
          bildUri={ocr.uri}
          zeilen={ocr.zeilen}
          rollenStart={ocr.rollen}
          kiVerfuegbar={einst.ki.aktiv}
          ohneTexterkennung={!texterkennungVerfuegbar}
          laedt={beschaeftigt}
          onSuchen={ocrSuchen}
          onKi={ocrKi}
          onAbbrechen={() => setOcr(null)}
        />
      )}
    </View>
  );
}

/** Eingabefeld mit Icon links. */
function Eingabe(p: { icon: IconName; placeholder: string; value: string; onChangeText: (t: string) => void; zahl?: boolean; stil?: object }) {
  return (
    <View style={[st.eingabe, p.stil]}>
      <Icon name={p.icon} size={20} farbe={F.grau} />
      <TextInput
        style={st.eingabeText}
        placeholder={p.placeholder}
        placeholderTextColor={F.grau}
        keyboardType={p.zahl ? 'number-pad' : 'default'}
        value={p.value}
        onChangeText={p.onChangeText}
      />
    </View>
  );
}

const ECKE = 28;

const st = StyleSheet.create({
  wurzel: { flex: 1, backgroundColor: '#000' },
  keineKamera: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: ABSTAND },
  weiss: { color: '#fff', fontSize: 16 },
  formular: { flex: 1, backgroundColor: F.papier },
  formKopf: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  formTitel: { fontSize: 28, fontWeight: '800', color: F.tinte, letterSpacing: -0.5 },
  eingabe: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: F.karte, borderWidth: 2, borderColor: F.tinte, paddingHorizontal: 12, marginTop: 10 },
  eingabeText: { flex: 1, paddingVertical: 14, fontSize: 17, color: F.tinte },
  oben: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  segment: { flex: 1, flexDirection: 'row', backgroundColor: F.tinte, borderWidth: 2, borderColor: F.tinte, padding: 3, gap: 3 },
  segTeil: { flex: 1, flexDirection: 'row', gap: 5, paddingVertical: 9, alignItems: 'center', justifyContent: 'center' },
  segAktiv: { backgroundColor: BEREICH.scan },
  segText: { color: '#E9E2D8', fontWeight: '800', fontSize: 13 },
  licht: { borderWidth: 2, borderColor: F.tinte, width: 46, height: 46, backgroundColor: F.tinte, alignItems: 'center', justifyContent: 'center' },
  sucherFlaeche: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingBottom: 60 },
  sucherBarcode: { width: '78%', aspectRatio: 2.2 },
  sucherSeite: { width: '70%', aspectRatio: 0.7 },
  ecke: { position: 'absolute', width: ECKE, height: ECKE, borderColor: F.gelb },
  eckeLO: { left: 0, top: 0, borderLeftWidth: 5, borderTopWidth: 5 },
  eckeRO: { right: 0, top: 0, borderRightWidth: 5, borderTopWidth: 5 },
  eckeLU: { left: 0, bottom: 0, borderLeftWidth: 5, borderBottomWidth: 5 },
  eckeRU: { right: 0, bottom: 0, borderRightWidth: 5, borderBottomWidth: 5 },
  hilfe: { borderWidth: 2, borderColor: F.tinte, flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 18, backgroundColor: F.tinte, paddingHorizontal: 14, paddingVertical: 8 },
  hilfeText: { color: '#fff', fontWeight: '600' },
  unten: { position: 'absolute', bottom: 12, left: 0, right: 0, gap: 12 },
  ausloeser: { alignSelf: 'center', width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  ausloeserInnen: { width: 64, height: 64, borderRadius: 32, backgroundColor: BEREICH.scan, borderWidth: 2, borderColor: F.tinte, alignItems: 'center', justifyContent: 'center' },
  stapel: { borderWidth: 2, borderColor: F.tinte, marginLeft: 12, marginRight: 16, backgroundColor: BEREICH.stapel, paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10, ...schatten() },
  stapelIcon: { borderWidth: 2, borderColor: F.tinte, width: 34, height: 34, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  stapelText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  stapelName: { color: 'rgba(255,255,255,0.9)', fontWeight: '800', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
  stapelSumme: { color: '#fff', fontWeight: '900', fontSize: 18 },
});
