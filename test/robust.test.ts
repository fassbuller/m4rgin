// Tests: Angebote prüfen, robuster Vergleich, Konfidenz, Korrekturen
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Angebot, entdoppeln, marktAbfragen, marktlage, marktMitAuswahl, MarktErgebnis } from '../src/lib/markt';
import { pruefeAngebote, titelPasst, ausreisserUnten, angebotSchluessel, relativeStreuung } from '../src/lib/pruefung';
import { berechnePreis, STANDARD_REGELN, waehleAnker } from '../src/lib/preis';
import { isbn13zu10 } from '../src/lib/isbn';
import { bewerteKonfidenz } from '../src/lib/konfidenz';
import { werteKorrekturenAus, Korrektur } from '../src/lib/korrektur';
import { bewerteSeltenheit } from '../src/lib/seltenheit';

const an = (gesamt: number, x: Partial<Angebot> = {}): Angebot => ({
  quelle: 'booklooker', plattform: 'booklooker', haendler: `h${gesamt}`, preis: gesamt - 2, versand: 2, versandGeschaetzt: false, gesamt, ...x,
});

test('Prüfung: Mängelexemplar, Hörbuch, Set, nur Umschlag, Ausland, ignorierter Händler fliegen raus', () => {
  const p = pruefeAngebote(
    [
      an(3, { zustandText: 'Mängelexemplar, Stempel auf Schnitt' }),
      an(4, { titel: 'Kafka: Der Process (Hörbuch, 4 CDs)' }),
      an(5, { titel: 'Kafka: Werke in 3 Bänden' }),
      an(6, { zustandText: 'Nur Schutzumschlag, ohne Buch' }),
      an(18, { land: 'USA', versand: 16 }),
      an(7, { haendler: 'Billig-Bücher' }),
      an(9, { zustandText: 'gut erhalten' }),
      an(11, { land: 'AT', versand: 9.5 }),
    ],
    { ueberIsbn: true, ignorierteHaendler: ['billig-bücher'] },
  );
  assert.deepEqual(p.gueltig.map((a) => a.gesamt), [9, 11]);
  assert.equal(p.aussortiert.length, 6);
  assert.ok(p.aussortiert.some((a) => a.grund.startsWith('Mängelexemplar')));
  assert.ok(p.aussortiert.some((a) => a.grund.includes('Auslandsversand')));
});

test('Prüfung: Titelabgleich nur bei Titelsuche, und nie so, dass nichts übrig bleibt', () => {
  const angebote = [
    an(4, { titel: 'Schöne: Faust II. Kommentar', autor: 'Schöne, Albrecht' }),
    an(6, { titel: 'Goethe: Faust. Eine Tragödie', autor: 'Goethe, Johann Wolfgang' }),
    an(8, { titel: 'Faust – Eine Tragödie, erster Teil' }),
  ];
  const t = pruefeAngebote(angebote, { ueberIsbn: false, titel: 'Faust: Eine Tragödie', autor: 'Goethe, Johann Wolfgang von' });
  assert.deepEqual(t.gueltig.map((a) => a.gesamt), [6, 8]);
  assert.equal(t.aussortiert[0].grund, 'anderes Buch (Titel passt nicht)');
  // per ISBN: kein Abgleich
  assert.equal(pruefeAngebote(angebote, { ueberIsbn: true, titel: 'Faust', autor: 'Goethe' }).gueltig.length, 3);
  // Hätte der Abgleich alles entfernt → nicht angewendet, mit Hinweis
  const alle = pruefeAngebote([an(5, { titel: 'Ganz anderes Buch' })], { ueberIsbn: false, titel: 'Aufzeichnungen aus dem Kellerloch' });
  assert.equal(alle.gueltig.length, 1);
  assert.ok(alle.hinweise[0].includes('nicht angewendet'));
});

test('Titelabgleich verträgt Umschrift, Untertitel und Beugung', () => {
  assert.ok(
    titelPasst('Dostojewski: Aufzeichnungen aus dem Kellerloch. Roman', 'Aufzeichnungen aus dem Kellerloch: Neu übersetzt', 'Dostoevskij, Fëdor', 'Dostojewski, Fjodor'),
  );
  assert.ok(!titelPasst('Der Spieler', 'Aufzeichnungen aus dem Kellerloch', 'Dostoevskij, Fëdor'));
  assert.ok(!titelPasst('Homo faber', 'Homo faber', 'Frisch, Max', 'Hesse, Hermann'));
  assert.ok(titelPasst('Homo faber. Ein Bericht', 'Homo faber', 'Frisch, Max'));
});

test('Prüfung: anderer Einband nur, wenn die Ausgabe ihn kennt', () => {
  const p = pruefeAngebote([an(5, { gebunden: false }), an(9, { gebunden: true }), an(7)], { ueberIsbn: true, bindung: 'hc' });
  assert.deepEqual(p.gueltig.map((a) => a.gesamt), [9, 7]);
});

test('Ausreißer nach unten (robust, erst ab 4 Angeboten)', () => {
  assert.deepEqual([...ausreisserUnten([1.5, 18, 20, 21, 24])], [0]);
  assert.equal(ausreisserUnten([1.5, 18, 20]).size, 0);
  assert.equal(ausreisserUnten([8, 9, 10, 11, 12]).size, 0); // normale Streuung
  assert.equal(relativeStreuung([10, 10, 10, 10]), 0);
});

test('Vergleich: Ausreißer und Großhändler übergangen, Mittel der zwei günstigsten', () => {
  const robust = { ausreisserUebergehen: true, grosshaendlerUebergehen: true, mittelAusZweiAb: 4 };
  const laden = STANDARD_REGELN.laden;
  const w = waehleAnker([an(1.5), an(18), an(20), an(21), an(24)], { ...laden, nurGleicheAusgabe: false }, { zustand: 'gut', robust });
  assert.equal(w.uebergangen[0].angebot.gesamt, 1.5);
  assert.equal(w.wert, 19); // (18 + 20) / 2
  assert.equal(w.angebote.length, 2);
  assert.ok(w.bezeichnung.startsWith('Mittel der 2 günstigsten'));
  const g = waehleAnker([an(4, { haendler: 'momox' }), an(7), an(8)], laden, { zustand: 'gut', robust });
  assert.equal(g.wert, 7); // nur 2 übrig → kein Mittel
  assert.ok(g.hinweise.some((h) => h.startsWith('Großhändler übergangen')));
  // Ist der Großhändler das einzige Angebot, bleibt er
  assert.equal(waehleAnker([an(4, { haendler: 'momox' })], laden, { zustand: 'gut', robust }).wert, 4);
  // Ohne robuste Regeln wie bisher: das günstigste
  assert.equal(waehleAnker([an(1.5), an(18), an(20), an(21)], laden, { zustand: 'gut' }).wert, 1.5);
});

test('Preis: Ausreißer bestimmt nicht mehr den Ladenpreis', () => {
  const r = berechnePreis({ angebote: [an(0.5), an(8), an(9), an(10), an(12)], zustand: 'sehr_gut', merkmale: [] }); // bleibt unter der Lagergrenze
  assert.ok(r);
  assert.equal(r.vergleichspreis, 8.5); // (8 + 9) / 2, die 0,50 € zählen nicht
  assert.ok(r.notizen.some((n) => n.startsWith('Ausreißer übergangen')));
});

test('Entdoppeln: gleiches Exemplar eines Händlers auf ZVAB und AbeBooks zählt einmal', () => {
  const d = entdoppeln([
    an(10, { plattform: 'ZVAB', haendler: 'Antiquariat Kühn', preis: 8 }),
    an(10, { plattform: 'AbeBooks', haendler: 'Antiquariat Kühn', preis: 8 }),
    an(10, { plattform: 'booklooker', haendler: 'privat', preis: 8 }),
  ]);
  assert.equal(d.length, 2);
});

test('Markt: zweiter Versuch bei Netzfehler, keiner bei 401; ISBN-10 als Ausweichsuche', async () => {
  let n = 0;
  const anfragen: string[] = [];
  const m = await marktAbfragen(
    [
      {
        id: 'booklooker', aktiv: true,
        suche: async () => {
          n++;
          if (n === 1) throw new Error('Network request failed');
          return [an(9)];
        },
      },
      { id: 'eurobuch', aktiv: true, suche: async () => { throw new Error('eurobuch antwortet mit 401'); } },
      {
        id: 'ebay', aktiv: true,
        suche: async (a) => {
          anfragen.push(a.isbn ?? '');
          return a.isbn?.length === 10 ? [an(12, { zustandText: 'Mängelexemplar' }), an(14)] : [];
        },
      },
    ],
    { isbn: '9783518468807' },
    { wiederholenNachMs: 1 },
  );
  assert.equal(n, 2);
  assert.deepEqual(m.status.map((s) => [s.quelle, s.ok, s.versuche]), [['booklooker', true, 2], ['eurobuch', false, 1], ['ebay', true, 1]]);
  assert.deepEqual(anfragen, ['9783518468807', '3518468804']);
  assert.deepEqual(m.angebote.map((a) => a.gesamt), [9, 14]);
  assert.equal(m.aussortiert?.length, 1);
  assert.equal(m.ueberIsbn, true);
});

test('ISBN-13 → ISBN-10', () => {
  assert.equal(isbn13zu10('9783518468807'), '3518468804');
  assert.equal(isbn13zu10('9780306406157'), '0306406152');
  assert.equal(isbn13zu10('9798886451740'), null); // 979 hat keine ISBN-10
});

test('Von Hand aussortieren und zurückholen', () => {
  const m: MarktErgebnis = {
    angebote: [an(5), an(8)],
    aussortiert: [{ ...an(3), grund: 'Mängelexemplar/Remittende' }],
    status: [],
    lage: marktlage([an(5), an(8)]),
    zeit: '',
  };
  const x = marktMitAuswahl(m, [angebotSchluessel(m.angebote[0])], [angebotSchluessel(m.aussortiert![0])]);
  assert.deepEqual(x.angebote.map((a) => a.gesamt), [3, 8]);
  assert.equal(x.aussortiert?.[0].grund, 'von Hand aussortiert');
  assert.equal(x.lage.anzahl, 2);
});

test('Konfidenz-Ampel', () => {
  const markt = (angebote: Angebot[], extra: Partial<MarktErgebnis> = {}): MarktErgebnis => ({
    angebote, status: [{ quelle: 'booklooker', ok: true, anzahl: angebote.length, ms: 1 }], lage: marktlage(angebote), zeit: '', ueberIsbn: true, ...extra,
  });
  const preis = (angebote: Angebot[]) => berechnePreis({ angebote, zustand: 'gut', merkmale: [] });
  const viele = [an(10), an(11), an(11.5), an(12), an(13)];
  assert.equal(bewerteKonfidenz({ markt: markt(viele), preis: preis(viele) }).ampel, 'gruen');
  const eins = [an(30)];
  const m1 = markt(eins, {
    ueberIsbn: false,
    status: [{ quelle: 'booklooker', ok: true, anzahl: 1, ms: 1 }, { quelle: 'eurobuch', ok: false, anzahl: 0, ms: 1 }],
  });
  const rot = bewerteKonfidenz({ markt: m1, preis: preis(eins) });
  assert.equal(rot.ampel, 'rot');
  assert.ok(rot.gruende.includes('Nur 1 von 2 Preisquellen erreicht'));
  // Von Hand gewählt → nie rot
  assert.equal(bewerteKonfidenz({ markt: m1, preis: preis(eins), vonHandGewaehlt: true }).ampel, 'gelb');
  const streuen = [an(3), an(10), an(25), an(40), an(60)];
  assert.notEqual(bewerteKonfidenz({ markt: markt(streuen), preis: preis(streuen) }).ampel, 'gruen');
  const schaetz = berechnePreis({ angebote: [], schaetzpreis: 5, zustand: 'gut', merkmale: [] });
  assert.equal(bewerteKonfidenz({ markt: markt([]), preis: schaetz }).ampel, 'rot');
});

test('Seltenheit: rote Ampel verhindert die bestätigte Enthüllung', () => {
  const e = { anzahl: 2, preis: 60, vergleich: 60, merkmale: [], ueberIsbn: true, angebote: [{ gesamt: 60 }, { gesamt: 65 }] };
  assert.equal(bewerteSeltenheit(e).bestaetigt, true);
  const r = bewerteSeltenheit({ ...e, konfidenz: 'rot' });
  assert.equal(r.bestaetigt, false);
  assert.equal(r.effekt, 'gedaempft');
  assert.ok(r.vorbehalte.some((v) => v.includes('Ampel rot')));
});

test('Korrektur-Auswertung findet systematische Abweichungen', () => {
  const k = (vorschlag: number, endpreis: number, kategorie: string): Korrektur => ({
    zeit: '', log_id: 1, isbn: null, titel: null, vorschlag, endpreis, zweig: 'laden', kategorie, zustand: 'gut', anzahl: 5, ampel: 'gruen',
    vergleich_von_hand: 0, aussortiert_von_hand: 0, art: 'preis',
  });
  const a = werteKorrekturenAus([...Array(5)].map(() => k(10, 12, 'regal')).concat([k(20, 20, 'lager')]));
  assert.equal(a.n, 6);
  assert.equal(a.mitPreis, 5);
  assert.ok(Math.abs((a.mittel ?? 0) - 0.2) < 1e-9);
  assert.ok(a.auffaellig[0].startsWith('Bei Regal ändert ihr den Preis im Schnitt um +20 %'));
});

// --- Fehler, die bei Pegel aufgefallen sind ---
import { vollstaendig } from '../src/lib/markt';
import { parseEurobuch, zweifachDekodiert } from '../src/lib/quellen/eurobuch';

test('Zeitüberschreitung: kein zweiter Versuch, keine ISBN-10-Nachfrage', async () => {
  let n = 0;
  const m = await marktAbfragen(
    [{ id: 'eurobuch', aktiv: true, suche: () => { n++; return new Promise<Angebot[]>(() => undefined); } }],
    { isbn: '9783518468807' },
    { timeoutMs: 20, wiederholenNachMs: 1 },
  );
  assert.equal(n, 1);
  assert.deepEqual(m.status.map((s) => [s.ok, s.versuche, s.fehler]), [[false, 1, 'Zeitüberschreitung']]);
});

test('Verlauf nur, wenn alle eingeschalteten Quellen geantwortet haben', async () => {
  const ok = { id: 'booklooker' as const, aktiv: true, suche: async () => [an(9)] };
  const kaputt = { id: 'eurobuch' as const, aktiv: true, suche: async () => { throw new Error('eurobuch antwortet mit 401'); } };
  const aus = { id: 'ebay' as const, aktiv: false, suche: async () => { throw new Error('darf nicht gefragt werden'); } };
  assert.equal(vollstaendig(await marktAbfragen([ok, aus], { isbn: '9783518468807' })), true);
  assert.equal(vollstaendig(await marktAbfragen([ok, kaputt], { isbn: '9783518468807' })), false);
  assert.equal(vollstaendig(await marktAbfragen([aus], { isbn: '9783518468807' })), false);
});

test('eurobuch: doppelt kodierte Titel werden lesbar', () => {
  assert.equal(zweifachDekodiert('Das Tor zum Glück &amp;#8211; Inspirationen'), 'Das Tor zum Glück – Inspirationen');
  assert.equal(zweifachDekodiert('Krieg &amp; Frieden'), 'Krieg & Frieden');
  assert.equal(zweifachDekodiert('Tom &amp;amp; Jerry'), 'Tom & Jerry');
  const xml = `<ResultList><Book title="Das Tor zum Gl&amp;#252;ck &amp;#8211; Inspirationen zur Lebenskunst" author="Kruppa, Hans" price="3.00" currency="EUR" platform="ZVAB" /></ResultList>`;
  assert.equal(parseEurobuch(xml, 3)[0].titel, 'Kruppa, Hans: Das Tor zum Glück – Inspirationen zur Lebenskunst');
});

test('eBay: ohne gtin-Treffer wird die ISBN als Suchbegriff gesucht', async () => {
  const { ebayQuelle } = await import('../src/lib/quellen/ebay');
  const alt = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (u: string) => {
    urls.push(String(u));
    if (String(u).includes('oauth2/token')) return new Response(JSON.stringify({ access_token: 't', expires_in: 7200 }));
    const treffer = String(u).includes('q=9783426662182')
      ? [{ title: 'Das Tor zum Glück von Kruppa, Hans', price: { value: '4.00', currency: 'EUR' }, shippingOptions: [{ shippingCost: { value: '2.00', currency: 'EUR' } }] }]
      : [];
    return new Response(JSON.stringify({ itemSummaries: treffer }));
  }) as typeof fetch;
  try {
    const a = await ebayQuelle({ aktiv: true, clientId: 'id-test', clientSecret: 'geheim-test' }, 3).suche({ isbn: '9783426662182' });
    assert.deepEqual(a.map((x) => x.gesamt), [6]);
    const suchen = urls.filter((u) => u.includes('item_summary'));
    assert.equal(suchen.length, 2);
    assert.ok(suchen[0].includes('gtin=9783426662182'));
    assert.ok(suchen[1].includes('q=9783426662182'));
  } finally {
    globalThis.fetch = alt;
  }
});

test('eurobuch: „no service“ ist ein Ausfall, kein „0 Angebote“', async () => {
  const { eurobuchAbgelehnt, eurobuchQuelle } = await import('../src/lib/quellen/eurobuch');
  assert.equal(eurobuchAbgelehnt('no service 3-8'), 'no service 3-8');
  assert.equal(eurobuchAbgelehnt('<?xml version="1.0"?><Error>No Service 3-8</Error>'), 'No Service 3-8');
  assert.equal(eurobuchAbgelehnt('<Error>Wartung</Error>'), 'Wartung');
  assert.equal(eurobuchAbgelehnt('<?xml version="1.0"?><ResultList id="1"></ResultList>'), null);
  const alt = globalThis.fetch;
  globalThis.fetch = (async () => new Response('no service 3-8')) as typeof fetch;
  try {
    const m = await marktAbfragen([eurobuchQuelle({ aktiv: true, benutzer: 'x', passwort: 'y' }, 3)], { isbn: '9783426662182' }, { wiederholenNachMs: 1 });
    assert.equal(m.status[0].ok, false);
    assert.equal(m.status[0].versuche, 1);
    assert.match(m.status[0].fehler ?? '', /verweigert/);
    assert.equal(vollstaendig(m), false);
  } finally {
    globalThis.fetch = alt;
  }
});

test('Quellen-Status: kurze Fehler und ausgeschaltete Quellen', async () => {
  const { kurzerFehler } = await import('../src/lib/markt');
  assert.equal(kurzerFehler('eurobuch verweigert die Abfrage („No Service 3-8“)'), 'gesperrt');
  assert.equal(kurzerFehler('Zeitüberschreitung'), 'antwortet nicht');
  assert.equal(kurzerFehler('eBay-Anmeldung fehlgeschlagen (401: invalid_client)'), 'Zugang falsch');
  const m = await marktAbfragen(
    [{ id: 'booklooker', aktiv: true, suche: async () => [an(9)] }, { id: 'ebay', aktiv: false, suche: async () => [] }],
    { isbn: '9783518468807' },
  );
  assert.deepEqual(m.aus, ['ebay']);
});

test('eBay: zuletzt per Titel, nur passende Titel', async () => {
  const { ebayQuelle } = await import('../src/lib/quellen/ebay');
  const alt = globalThis.fetch;
  const urls: string[] = [];
  const item = (title: string, value: string) => ({ title, price: { value, currency: 'EUR' }, shippingOptions: [{ shippingCost: { value: '2.00', currency: 'EUR' } }] });
  globalThis.fetch = (async (u: string) => {
    urls.push(String(u));
    if (String(u).includes('oauth2/token')) return new Response(JSON.stringify({ access_token: 't', expires_in: 7200 }));
    const treffer = String(u).includes('category_ids=267')
      ? [item('Das Tor zum Glück: Inspirationen zur Lebenskunst – Hans Kruppa', '3.00'), item('Kruppa: Glücksmomente', '1.00')]
      : [];
    return new Response(JSON.stringify({ itemSummaries: treffer }));
  }) as typeof fetch;
  try {
    const a = await ebayQuelle({ aktiv: true, clientId: 'id-titel', clientSecret: 'geheim-titel' }, 3)
      .suche({ isbn: '9783426662182', titel: 'Das Tor zum Glück', autor: 'Kruppa' });
    assert.deepEqual(a.map((x) => x.gesamt), [5]);
    assert.equal(urls.filter((u) => u.includes('item_summary')).length, 3);
  } finally {
    globalThis.fetch = alt;
  }
});
