// Kleine Aktionsleiste für ein Buch: ISBN kopieren · Teilen · An Haven schicken.
// Steht im Preis-Blatt (beim Scannen) und im Stapel-Detail.
import React, { useState } from 'react';
import { Alert, Share, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Text } from './Schrift';
import { Chip } from './Teile';
import { F } from '../theme';
import { anHavenSenden, BuchFuerHaven, havenBereit, havenPayload, HavenZugang, teilenText } from '../lib/haven';
import { VERSION_TEXT } from '../version';

type Zustand = { art: 'ok' | 'fehler' | 'laeuft'; text: string } | null;

export function BuchAktionen({ buch, haven }: { buch: BuchFuerHaven; haven?: HavenZugang | null }) {
  const [status, setStatus] = useState<Zustand>(null);
  const kurz = (z: Zustand, ms = 2500) => {
    setStatus(z);
    if (z && z.art !== 'laeuft') setTimeout(() => setStatus((s) => (s === z ? null : s)), ms);
  };

  const kopieren = async () => {
    if (!buch.isbn) return;
    try {
      await Clipboard.setStringAsync(buch.isbn);
      kurz({ art: 'ok', text: `ISBN ${buch.isbn} kopiert` });
    } catch {
      kurz({ art: 'fehler', text: 'Kopieren ging nicht' });
    }
  };

  const teilen = () => {
    Share.share({ message: teilenText(buch), title: buch.titel }).catch(() => undefined);
  };

  const anHaven = async () => {
    if (!havenBereit(haven)) {
      Alert.alert(
        'Haven ist noch nicht eingerichtet',
        'Unter Einstellungen → Haven die Haven-Adresse und den Geräte-Schlüssel eintragen. Den Schlüssel gibt Haven für dieses Handy aus.',
      );
      return;
    }
    kurz({ art: 'laeuft', text: 'Schicke an Haven …' });
    try {
      await anHavenSenden(haven, havenPayload(buch, VERSION_TEXT));
      kurz({ art: 'ok', text: 'In Haven angekommen' }, 3000);
    } catch (e) {
      kurz({ art: 'fehler', text: String((e as Error)?.message ?? e) }, 6000);
    }
  };

  return (
    <View style={st.wurzel}>
      <View style={st.reihe}>
        {buch.isbn ? <Chip klein icon="content-copy" label="ISBN kopieren" farbe={F.tinte} onPress={kopieren} /> : null}
        <Chip klein icon="share-variant" label="Teilen" farbe={F.tinte} onPress={teilen} />
        <Chip
          klein
          icon="cellphone-arrow-down"
          label="An Haven"
          farbe={F.blau}
          aktiv={status?.art === 'laeuft'}
          onPress={status?.art === 'laeuft' ? undefined : anHaven}
        />
      </View>
      {status && (
        <Text style={[st.status, { color: status.art === 'fehler' ? F.rot : status.art === 'ok' ? F.gruen : F.grau }]}>{status.text}</Text>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  wurzel: { marginTop: 10 },
  reihe: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  status: { fontSize: 13, fontWeight: '600', marginTop: 6 },
});
