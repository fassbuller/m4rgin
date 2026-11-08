// Buchcover: probiert die Quellen der Reihe nach durch, bis eine ein Bild liefert; sonst ein Platzhalter.
import React, { useEffect, useState } from 'react';
import { Image, ImageStyle, StyleProp, View } from 'react-native';
import { coverKette, coverTreffer, GOOGLE, googleCover } from '../lib/cover';
import { F } from '../theme';
import { Icon } from './Teile';

type Props = { isbn?: string; url?: string; style: StyleProp<ImageStyle>; iconGroesse?: number; iconFarbe?: string };

export function Cover(props: Props) {
  const kette = coverKette(props.isbn, props.url);
  // Neues Buch → frischer Zustand, statt die Stufe vom vorigen mitzuschleppen
  return <Kette key={kette.join('|')} kette={kette} {...props} />;
}

function Kette(props: Props & { kette: string[] }) {
  const { kette } = props;
  const schluessel = kette.join('|');
  const bekannt = coverTreffer.get(schluessel);
  const [stufe, setStufe] = useState(coverTreffer.has(schluessel) ? kette.length : 0);
  const [uri, setUri] = useState<string | null>(bekannt ?? null);
  const weiter = () => {
    setUri(null);
    setStufe((s) => s + 1);
  };

  useEffect(() => {
    if (stufe >= kette.length) {
      if (!coverTreffer.has(schluessel)) coverTreffer.set(schluessel, null);
      return;
    }
    const quelle = kette[stufe];
    if (!quelle.startsWith(GOOGLE)) {
      setUri(quelle);
      return;
    }
    let aktuell = true;
    googleCover(quelle.slice(GOOGLE.length)).then((url) => {
      if (!aktuell) return;
      if (url) setUri(url);
      else weiter();
    });
    return () => {
      aktuell = false;
    };
  }, [stufe]);

  if (!uri) {
    return (
      <View style={[props.style, { alignItems: 'center', justifyContent: 'center' }]}>
        <Icon name="book-open-blank-variant" size={props.iconGroesse ?? 22} farbe={props.iconFarbe ?? F.grau} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={props.style}
      onLoad={() => coverTreffer.set(schluessel, uri)}
      onError={() => {
        // Gemerkter Treffer geht nicht mehr (z. B. offline) → Kette von vorn
        if (stufe >= kette.length) {
          coverTreffer.delete(schluessel);
          setUri(null);
          setStufe(0);
        } else weiter();
      }}
    />
  );
}
