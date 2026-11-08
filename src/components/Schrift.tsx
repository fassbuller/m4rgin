// Text und Eingabefelder in Bricolage Grotesque. React Native kennt keine globale Schrift, und eigene
// Schriften haben je Stärke eine eigene Datei – deshalb wählt dieser Baustein die Datei anhand von fontWeight.
// Ein gesetztes fontFamily (z. B. Caveat für Handschrift) bleibt unangetastet.
// Seit React 19 ist ref ein normales Prop und wird mit den übrigen Props durchgereicht.
import React from 'react';
import { StyleProp, StyleSheet, Text as RNText, TextInput as RNTextInput, TextStyle } from 'react-native';
import { SCHRIFT } from '../theme';

export function schriftFuer(style: StyleProp<TextStyle>): StyleProp<TextStyle> {
  const s = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  if (s.fontFamily) return style;
  const w = s.fontWeight;
  const zahl = w === 'bold' ? 700 : w === 'normal' || w == null ? 400 : Number(w);
  const familie = zahl >= 700 ? SCHRIFT.fett : zahl >= 500 ? SCHRIFT.halb : SCHRIFT.normal;
  // fontWeight zurücksetzen: Android sucht sonst eine passende Variante und fällt auf die Systemschrift zurück
  return [style, { fontFamily: familie, fontWeight: 'normal' }];
}

export function Text(props: React.ComponentProps<typeof RNText>) {
  return <RNText {...props} style={schriftFuer(props.style)} />;
}

export function TextInput(props: React.ComponentProps<typeof RNTextInput>) {
  return <RNTextInput {...props} style={schriftFuer(props.style)} />;
}
