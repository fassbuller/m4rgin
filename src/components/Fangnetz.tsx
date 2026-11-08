// Fängt Renderfehler ab: statt weißem Bildschirm eine Erklärung und „Neu laden“.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './Schrift';
import { Knopf } from './Teile';
import { ABSTAND, F, KASTEN, SCHRIFT } from '../theme';
import { fehlerText } from '../lib/fehler';

interface Zustand {
  fehler: Error | null;
}

export class Fangnetz extends React.Component<{ children: React.ReactNode }, Zustand> {
  state: Zustand = { fehler: null };

  static getDerivedStateFromError(fehler: Error): Zustand {
    return { fehler };
  }

  render() {
    if (!this.state.fehler) return this.props.children;
    return (
      <View style={st.wurzel}>
        <View style={st.zettel}>
          <Text style={st.hand}>hoppla</Text>
          <Text style={st.titel}>Da ist etwas schiefgelaufen.</Text>
          <Text style={st.text}>{fehlerText(this.state.fehler, 'Diese Ansicht')}</Text>
          <Text style={st.text}>Deine Stapel und der Verlauf sind gespeichert.</Text>
          <Knopf label="Neu laden" icon="refresh" farbe={F.tinte} onPress={() => this.setState({ fehler: null })} stil={{ marginTop: 16 }} />
        </View>
      </View>
    );
  }
}

const st = StyleSheet.create({
  wurzel: { flex: 1, backgroundColor: F.papier, justifyContent: 'center', padding: ABSTAND * 1.5 },
  zettel: { backgroundColor: F.karte, ...KASTEN, padding: ABSTAND, boxShadow: `6px 6px 0px ${F.tinte}`, gap: 6 },
  hand: { fontFamily: SCHRIFT.hand, fontSize: 30, color: F.hand },
  titel: { fontSize: 22, fontWeight: '800', color: F.tinte },
  text: { fontSize: 15, color: F.grau },
});
