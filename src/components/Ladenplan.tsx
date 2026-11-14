// „Wo steht es?“ – Raum und Abteilung nach dem Ladenplan, mit kleiner Grundriss-Skizze wie im Haven-Popup:
// alle Räume blass in ihrer Farbe, der Raum des Vorschlags kräftig, Alternativen gestrichelt. Bei „geraten“
// ist kein Raum kräftig, der Rückfall-Raum gestrichelt und der Hinweistext steht da.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Polygon, Text as SvgText } from 'react-native-svg';
import { Text } from './Schrift';
import { F, hell } from '../theme';
import { LADENPLAN, Ladenplan, raumVon, Standort, standortText } from '../lib/ladenplan';

const punkte = (p: [number, number][]) => p.map(([x, y]) => `${x},${y}`).join(' ');

export function LadenplanSkizze({ s, plan = LADENPLAN, breite = 150 }: { s: Standort; plan?: Ladenplan; breite?: number }) {
  const vb = plan.grundriss?.viewBox ?? [0, 0, 1000, 1000];
  const hoehe = Math.round((breite * vb[3]) / vb[2]);
  const alt = new Set(s.alternativen.map((a) => a.raum));
  return (
    <Svg width={breite} height={hoehe} viewBox={vb.join(' ')} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {plan.raeume
        .filter((r) => r.punkte && r.punkte.length >= 3)
        .map((r) => {
          const vorschlag = !s.geraten && r.id === s.vorschlag.raum;
          const gestrichelt = alt.has(r.id) || (s.geraten && r.id === s.vorschlag.raum);
          return (
            <Polygon
              key={r.id}
              points={punkte(r.punkte!)}
              fill={vorschlag ? r.farbe : hell(r.farbe, 0.18)}
              stroke={vorschlag || gestrichelt ? r.farbe : hell(r.farbe, 0.45)}
              strokeWidth={vorschlag ? 10 : gestrichelt ? 12 : 4}
              strokeDasharray={gestrichelt ? '28 18' : undefined}
            />
          );
        })}
      {plan.grundriss?.eingang && (
        <>
          <Circle cx={plan.grundriss.eingang[0]} cy={plan.grundriss.eingang[1] - 18} r={16} fill={F.tinte} />
          <SvgText x={plan.grundriss.eingang[0] + 28} y={plan.grundriss.eingang[1] - 6} fontSize={44} fill={F.tinte}>
            Eingang
          </SvgText>
        </>
      )}
    </Svg>
  );
}

/** Kompakt für Karten: farbiger Punkt + „Wintergarten · Lyrik“ */
export function StandortZeile({ s, plan = LADENPLAN }: { s: Standort; plan?: Ladenplan }) {
  const farbe = raumVon(plan, s.vorschlag.raum)?.farbe ?? F.grau;
  return (
    <View style={st.zeile} accessible accessibilityLabel={satz(plan, s)}>
      <View style={[st.punkt, { backgroundColor: s.geraten ? 'transparent' : farbe, borderColor: farbe }]} />
      <Text style={st.zeilenText} numberOfLines={1}>
        {s.geraten ? standortText(plan, s) : `Steht vermutlich: ${standortText(plan, s)}`}
      </Text>
    </View>
  );
}

/** Ausführlich fürs Preis-Blatt: Text, Alternativen und Skizze */
export function StandortBlock({ s, plan = LADENPLAN }: { s: Standort; plan?: Ladenplan }) {
  const raum = raumVon(plan, s.vorschlag.raum);
  return (
    <View style={st.block} accessible accessibilityLabel={satz(plan, s)}>
      <View style={{ flex: 1 }}>
        <Text style={[st.haupt, { color: s.geraten ? F.grau : raum?.farbe ?? F.tinte }]}>
          {s.geraten ? standortText(plan, s) : s.vorschlag.raumName}
        </Text>
        {!s.geraten && <Text style={st.abteilung}>{s.vorschlag.name}</Text>}
        {s.alternativen.length > 0 && (
          <Text style={st.oder}>oder: {s.alternativen.map((a) => `${a.raumName} (${a.name})`).join(', ')}</Text>
        )}
        <Text style={st.klein}>Nach dem Ladenplan aus Haven (Stand {plan.stand}), aus den DNB-Angaben.</Text>
      </View>
      <LadenplanSkizze s={s} plan={plan} breite={120} />
    </View>
  );
}

function satz(plan: Ladenplan, s: Standort): string {
  const oder = s.alternativen.length ? ` Oder: ${s.alternativen.map((a) => a.raumName).join(', ')}.` : '';
  return s.geraten ? `${standortText(plan, s)}.` : `Steht vermutlich im Raum ${s.vorschlag.raumName}, Abteilung ${s.vorschlag.name}.${oder}`;
}

const st = StyleSheet.create({
  zeile: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  punkt: { width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  zeilenText: { fontSize: 13, fontWeight: '700', color: F.tinte, flexShrink: 1 },
  block: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: F.karte, borderRadius: 14, padding: 12, marginTop: 8 },
  haupt: { fontSize: 20, fontWeight: '800' },
  abteilung: { fontSize: 15, fontWeight: '700', color: F.tinte, marginTop: 2 },
  oder: { fontSize: 13, color: F.tinte, marginTop: 6 },
  klein: { fontSize: 11, color: F.grau, marginTop: 6 },
});
