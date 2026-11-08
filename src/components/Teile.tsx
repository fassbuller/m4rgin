// Kleine wiederverwendbare Bausteine.
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import { parseZahl, zahlText } from '../einstellungen';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ABSTAND, aufFarbe, F, hell, KASTEN, KATEGORIE_FARBE, RAHMEN } from '../theme';
import { Text, TextInput } from './Schrift';
import { Icon, IconName } from './Icon';
import { Kategorie, KATEGORIE_LABEL, Merkmal } from '../lib/preis';
import { BEREICHE, bereichAusSachgruppe, sachgruppeOhneCode } from '../lib/bereiche';

export { Icon };
export type { IconName };

export const KATEGORIE_ICON: Record<Kategorie, IconName> = {
  grabbel: 'basket',
  regal: 'bookshelf',
  lager: 'archive-arrow-down',
};

export const MERKMAL_ICON: Record<Merkmal, IconName> = {
  erstausgabe: 'numeric-1-circle',
  signiert: 'draw-pen',
  schutzumschlag: 'book-check',
  selten: 'diamond-stone',
};

/**
 * Kopfzeile eines Reiters wie Fountain: Papier, großer schwarzer Titel, dicker Unterstrich in Bereichsfarbe,
 * optional eine Notiz in Handschrift darüber. Reicht bis unter die Statusleiste.
 */
export function Kopf(props: {
  titel: string;
  icon: IconName;
  farbe: string;
  notiz?: string;
  unter?: React.ReactNode;
  rechts?: React.ReactNode;
  /** Titel wird antippbar (mit ▾), z. B. um zwischen Stapeln zu wechseln */
  onTitel?: () => void;
}) {
  const oben = useSafeAreaInsets().top;
  const titel = <Text style={s.kopfTitel} numberOfLines={1}>{props.titel}</Text>;
  return (
    <View style={[s.kopf, { borderBottomColor: props.farbe, paddingTop: oben + 10 }]}>
      {props.notiz ? <Text style={s.notiz}>{props.notiz}</Text> : null}
      <View style={s.kopfZeile}>
        <View style={[s.kopfIcon, { backgroundColor: props.farbe }]}>
          <Icon name={props.icon} size={20} farbe={aufFarbe(props.farbe)} />
        </View>
        {props.onTitel ? (
          <Pressable onPress={props.onTitel} style={s.kopfTitelKnopf} hitSlop={8} accessibilityRole="button">
            {titel}
            <Icon name="chevron-down" size={22} />
          </Pressable>
        ) : (
          <View style={{ flex: 1 }}>{titel}</View>
        )}
        {props.rechts}
      </View>
      {props.unter}
    </View>
  );
}

/** Abschnittsüberschrift: Großbuchstaben in Tinte, davor ein Farbklötzchen mit Icon. */
export function Abschnitt({ titel, icon, farbe = F.grau }: { titel: string; icon: IconName; farbe?: string }) {
  return (
    <View style={s.abschnitt}>
      <View style={[s.abschnittIcon, { backgroundColor: farbe }]}>
        <Icon name={icon} size={14} farbe={aufFarbe(farbe)} />
      </View>
      <Text style={s.abschnittText}>{titel}</Text>
    </View>
  );
}

export function Chip(props: { label: string; aktiv?: boolean; farbe?: string; icon?: IconName; onPress?: () => void; klein?: boolean }) {
  const farbe = props.farbe ?? F.tinte;
  const textFarbe = props.aktiv ? aufFarbe(farbe) : F.tinte;
  return (
    <Pressable
      onPress={props.onPress}
      style={[
        s.chip,
        props.klein && s.chipKlein,
        { backgroundColor: props.aktiv ? farbe : hell(farbe, 0.1) },
      ]}
      hitSlop={6}
    >
      {props.aktiv && !props.icon && <Icon name="check" size={props.klein ? 14 : 16} farbe={textFarbe} />}
      {props.icon && <Icon name={props.icon} size={props.klein ? 14 : 16} farbe={textFarbe} />}
      <Text style={[s.chipText, props.klein && s.chipTextKlein, { color: textFarbe }]}>{props.label}</Text>
    </Pressable>
  );
}

export function KategorieBadge({ k, gross, leise }: { k: Kategorie; gross?: boolean; leise?: boolean }) {
  const textFarbe = leise ? F.tinte : aufFarbe(KATEGORIE_FARBE[k]);
  return (
    <View style={[s.badge, { backgroundColor: leise ? hell(KATEGORIE_FARBE[k], 0.22) : KATEGORIE_FARBE[k] }, gross && s.badgeGross]}>
      <Icon name={KATEGORIE_ICON[k]} size={gross ? 20 : 14} farbe={textFarbe} />
      <Text style={[s.badgeText, { color: textFarbe }, gross && s.badgeTextGross]}>{KATEGORIE_LABEL[k]}</Text>
    </View>
  );
}

/** DNB-Sachgruppen als kleine Etiketten, farblich nach Ladenbereich. */
export function Genres({ sachgruppen, hell: aufDunkel }: { sachgruppen?: string[]; hell?: boolean }) {
  if (!sachgruppen?.length) return null;
  return (
    <View style={s.reihe}>
      {sachgruppen.map((g) => {
        const bereich = bereichAusSachgruppe(g);
        const farbe = bereich ? BEREICHE[bereich].farbe : F.orange;
        return (
          <View
            key={g}
            style={[s.genre, { backgroundColor: hell(farbe, 0.2), borderLeftColor: farbe }, aufDunkel && s.genreHell]}
          >
            <Text style={[s.genreText, aufDunkel && { color: '#fff' }]}>
              {sachgruppeOhneCode(g)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export function Knopf(props: {
  label: string;
  onPress: () => void;
  farbe?: string;
  icon?: IconName;
  leise?: boolean;
  stil?: ViewStyle;
  deaktiviert?: boolean;
}) {
  const farbe = props.farbe ?? F.tinte;
  const textFarbe = props.leise ? (farbe === F.grau ? F.tinte : farbe) : aufFarbe(farbe);
  return (
    <Pressable
      onPress={props.deaktiviert ? undefined : props.onPress}
      style={({ pressed }) => [
        s.knopf,
        props.leise ? { borderColor: farbe === F.grau ? F.tinte : farbe, backgroundColor: F.karte } : { backgroundColor: farbe },
        pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] },
        props.deaktiviert && { opacity: 0.4 },
        props.stil,
      ]}
    >
      {props.icon && <Icon name={props.icon} size={20} farbe={textFarbe} />}
      <Text style={[s.knopfText, { color: textFarbe }]}>{props.label}</Text>
    </Pressable>
  );
}

/** Eckiger −/+-Knopf für Preiskorrekturen. */
export function Schritt({ plus, onPress, gross }: { plus?: boolean; onPress: () => void; gross?: boolean }) {
  const groesse = gross ? 44 : 34;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        s.schritt,
        { width: groesse, height: groesse, backgroundColor: plus ? F.gruen : F.rot },
        pressed && { transform: [{ translateX: 1 }, { translateY: 1 }] },
      ]}
    >
      <Icon name={plus ? 'plus' : 'minus'} size={gross ? 26 : 20} farbe="#fff" />
    </Pressable>
  );
}

/**
 * Zahl mit −/+-Knöpfen. Die Zahl in der Mitte bleibt antippbar, falls man z. B. 24,90 € direkt eintippen will.
 * Eigener Textzustand, damit „2,“ beim Tippen nicht verschwindet.
 */
export function Stepper(props: {
  wert: number | null;
  setze: (v: number | null) => void;
  schritt: number;
  min?: number;
  max?: number;
  einheit?: string;
  /** null erlaubt (leeres Feld, „–“) – z. B. Neupreis unbekannt */
  leerErlaubt?: boolean;
  farbe?: string;
}) {
  const { wert, schritt, min = 0, max = Infinity } = props;
  const anzeige = (n: number | null) =>
    n == null ? '' : props.einheit === '€' ? n.toFixed(2).replace('.', ',') : zahlText(n);
  const [text, setText] = useState(anzeige(wert));
  useEffect(() => {
    if (parseZahl(text) !== wert) setText(anzeige(wert));
  }, [wert]);
  const nachkomma = (String(schritt).split('.')[1] ?? '').length;
  const neu = (v: number) => {
    const n = Math.min(max, Math.max(min, Number(v.toFixed(Math.max(nachkomma, 2)))));
    props.setze(n);
  };
  return (
    <View style={s.stepper}>
      <Schritt onPress={() => (wert == null ? undefined : wert - schritt < min && props.leerErlaubt ? props.setze(null) : neu(wert - schritt))} />
      <View style={[s.stepperFeld, props.farbe && { borderColor: props.farbe }]}>
        <TextInput
          style={s.stepperText}
          value={text}
          placeholder="–"
          placeholderTextColor={F.grau}
          keyboardType="decimal-pad"
          selectTextOnFocus
          onBlur={() => setText(anzeige(wert))}
          onChangeText={(t) => {
            setText(t);
            const n = parseZahl(t);
            if (n != null) props.setze(Math.min(max, Math.max(min, n)));
            else if (!t.trim() && props.leerErlaubt) props.setze(null);
          }}
        />
        {props.einheit ? <Text style={s.stepperEinheit}>{props.einheit}</Text> : null}
      </View>
      <Schritt plus onPress={() => neu((wert ?? 0) + schritt)} />
    </View>
  );
}

export const s = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepperFeld: { flexDirection: 'row', alignItems: 'center', minWidth: 78, ...KASTEN, backgroundColor: F.karte, paddingHorizontal: 8 },
  stepperText: { flex: 1, fontSize: 16, fontWeight: '800', color: F.tinte, textAlign: 'right', paddingVertical: 6, fontVariant: ['tabular-nums'] },
  stepperEinheit: { fontSize: 14, fontWeight: '700', color: F.grau, marginLeft: 3 },
  kopf: { paddingHorizontal: ABSTAND, paddingBottom: 14, backgroundColor: F.papier, borderBottomWidth: 5 },
  notiz: { fontFamily: 'Caveat_700Bold', fontSize: 22, color: F.hand, lineHeight: 24, transform: [{ rotate: '-2deg' }], alignSelf: 'flex-start' },
  kopfZeile: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  kopfIcon: { width: 36, height: 36, ...KASTEN, alignItems: 'center', justifyContent: 'center' },
  kopfTitel: { flexShrink: 1, fontSize: 28, fontWeight: '800', color: F.tinte, letterSpacing: -0.5 },
  kopfTitelKnopf: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  abschnitt: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22, marginBottom: 8 },
  abschnittIcon: { width: 22, height: 22, borderWidth: 1.5, borderColor: F.tinte, alignItems: 'center', justifyContent: 'center' },
  abschnittText: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2, color: F.tinte },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, ...KASTEN, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8, marginBottom: 8 },
  chipKlein: { paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontSize: 15, fontWeight: '700' },
  chipTextKlein: { fontSize: 13 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, ...KASTEN, paddingHorizontal: 7, paddingVertical: 2, alignSelf: 'flex-start' },
  badgeGross: { paddingHorizontal: 10, paddingVertical: 5, gap: 6 },
  badgeText: { fontWeight: '800', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  badgeTextGross: { fontSize: 15 },
  reihe: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  genre: { flexDirection: 'row', alignItems: 'center', gap: 3, borderLeftWidth: 4, paddingHorizontal: 6, paddingVertical: 1 },
  genreHell: { backgroundColor: 'rgba(255,255,255,0.18)' },
  genreText: { fontSize: 12, color: F.tinte, fontWeight: '600' },
  knopf: { flexDirection: 'row', gap: 8, borderWidth: RAHMEN, borderColor: F.tinte, minHeight: 48, paddingVertical: 12, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  knopfText: { fontSize: 16, fontWeight: '800' },
  schritt: { alignItems: 'center', justifyContent: 'center', ...KASTEN },
});
