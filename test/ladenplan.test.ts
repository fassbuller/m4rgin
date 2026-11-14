// Ladenplan: dieselben Fälle wie firestream2/ladenplan/test.js (Stand v0.99.128) – sie sind der Maßstab.
// Kommen dort neue Entscheidungen des Kollektivs als Testfall dazu, hier mit übernehmen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LADENPLAN, LadenBuch, pruefe, standort, standortText } from '../src/lib/ladenplan';
import { ausMarc, besterSatz, marcSaetze } from '../src/lib/erschliessung';

const F: [string, LadenBuch, string, string?][] = [
  ['Psychologie', { dnb: '150', sprache: 'ger' }, 'mittelraum'],
  ['Philosophie', { dnb: '100', sprache: 'ger' }, 'durchgang'],
  ['Japan im 19. Jahrhundert', { dnb: '950', sprache: 'ger', geografika: 'Japan' }, 'wintergarten'],
  ['Geschichte Frankreichs', { dnb: '940', sprache: 'ger', geografika: 'Frankreich' }, 'wintergarten'],
  ['Europa im 20. Jahrhundert', { dnb: '940', sprache: 'ger' }, 'flur'],
  ['Shoah', { dnb: '943', sprache: 'ger', schlagwoerter: ['Holocaust', 'Juden'] }, 'flur'],
  ['Berlin im NS', { dnb: '943', sprache: 'ger', schlagwoerter: ['Nationalsozialismus'], geografika: 'Berlin' }, 'mittelraum'],
  ['DDR-Geschichte', { dnb: '943', sprache: 'ger', schlagwoerter: ['DDR'], geografika: 'Deutschland (DDR)' }, 'flur'],
  ['Goethe, Gedichte', { dnb: 'B', sprache: 'ger', form: 'Lyrik' }, 'wintergarten'],
  ['Kant bei Reclam', { dnb: '100', sprache: 'ger', reihen: 'Reclams Universal-Bibliothek ; 1501' }, 'flur'],
  ['Englischer Roman', { dnb: 'B', sprache: 'eng' }, 'mittelraum'],
  ['Französischer Roman im Original', { dnb: 'B', sprache: 'fre' }, 'wintergarten'],
  ['Deutscher Roman', { dnb: 'B', sprache: 'ger' }, 'werkstatt'],
  ['Deutscher Krimi', { dnb: 'B', sprache: 'ger', form: 'Kriminalroman' }, 'wintergarten'],
  ['Bilderbuch', { dnb: 'K', sprache: 'ger', form: 'Bilderbuch' }, 'vorne'],
  ['Jugendroman', { dnb: 'K', sprache: 'ger', form: 'Jugendbuch' }, 'wintergarten'],
  ['Neue Wirtschaftsbuch', { dnb: '330', sprache: 'ger', status: 'neu' }, 'vorne'],
  ['Biografie Hannah Arendt', { dnb: '100', sprache: 'ger', form: 'Biografie' }, 'mittelraum'],
  ['Pädagogik', { dnb: '370', sprache: 'ger' }, 'mittelraum'],
  ['Recht', { dnb: '340', sprache: 'ger' }, 'durchgang'],
  ['Wörterbuch Spanisch', { dnb: '460', sprache: ['ger', 'spa'], form: 'Wörterbuch' }, 'wintergarten'],
  ['Kochbuch', { dnb: '640', sprache: 'ger' }, 'mittelraum'],
  ['Marx, Das Kapital', { dnb: '330', sprache: 'ger', schlagwoerter: 'Marxismus' }, 'durchgang'],
  ['Comic', { dnb: '741.5', sprache: 'ger' }, 'durchgang'],
  ['Judentum', { dnb: '290', sprache: 'ger', schlagwoerter: 'Judentum' }, 'vorne'],
  ['Kunst', { dnb: '750', sprache: 'ger' }, 'vorne'],
  ['Feminismus', { dnb: '300', sprache: 'ger', schlagwoerter: 'Feminismus' }, 'mittelraum'],
  ['Soziologie der Kriminalität', { dnb: '300', sprache: 'ger', schlagwoerter: 'Kriminalität' }, 'durchgang'],
  ['Reiseführer Portugal', { dnb: '914', sprache: 'ger', form: 'Reiseführer', geografika: 'Portugal' }, 'wintergarten'],
  ['Schallplatte', { medium: 'Schallplatte' }, 'mittelraum'],
  ['Roman mit 830 und B', { dnb: ['830', 'B'], sprache: 'ger' }, 'werkstatt'],
  ['Lyrik mit 830 und B', { dnb: ['830', 'B'], sprache: 'ger', form: 'Lyrik' }, 'wintergarten'],
  ['Geschichte Japans bei Reclam', { dnb: '950', sprache: 'ger', geografika: 'Japan', reihen: ['Reclams Universal-Bibliothek', 'Reclam Sachbuch premium'] }, 'flur'],
  ['Neuerscheinung Politik, 5 Monate alt', { dnb: '320', sprache: 'ger', erschienen: '2026-06' }, 'vorne', '2026-11'],
  ['Politik, genau 12 Monate alt', { dnb: '320', sprache: 'ger', erschienen: '2025-11' }, 'vorne', '2026-11'],
  ['Politik, 13 Monate alt', { dnb: '320', sprache: 'ger', erschienen: '2025-10' }, 'durchgang', '2026-11'],
  ['Roman, nur Jahr bekannt, laufendes Jahr', { dnb: ['830', 'B'], sprache: 'ger', erschienen: '2026' }, 'vorne', '2026-11'],
  ['Roman, nur Jahr bekannt, Vorjahr (ab Jahresmitte 16 Monate)', { dnb: ['830', 'B'], sprache: 'ger', erschienen: '2025' }, 'werkstatt', '2026-11'],
  ['Angekündigt, erscheint erst', { dnb: '100', sprache: 'ger', erschienen: '2027-02' }, 'vorne', '2026-11'],
  ['Derselbe Titel ein Jahr später', { dnb: '320', sprache: 'ger', erschienen: '2026-06' }, 'durchgang', '2027-11'],
];

test('Ladenplan: Plan ist formal in Ordnung', () => {
  assert.deepEqual(pruefe(LADENPLAN), []);
});

for (const [titel, buch, soll, heute] of F) {
  test(`Ladenplan: ${titel} → ${soll}`, () => {
    // Ohne „heute“ ist das Ergebnis vom Datum unabhängig, solange kein erschienen-Feld mitspielt
    const r = standort(LADENPLAN, buch, heute ?? '2026-11');
    assert.equal(r.vorschlag.raum, soll, `${r.vorschlag.raumName} (${r.vorschlag.name})`);
  });
}

test('Ladenplan: ohne Daten → geraten, Hinweistext', () => {
  const r = standort(LADENPLAN, {}, '2026-11');
  assert.equal(r.geraten, true);
  assert.match(standortText(LADENPLAN, r), /^Kein klarer Platz, am ehesten /);
});

test('Ladenplan: Alternativen kommen aus anderen Räumen', () => {
  const r = standort(LADENPLAN, { dnb: '320', sprache: 'ger', erschienen: '2026-06' }, '2026-11');
  assert.equal(r.vorschlag.raum, 'vorne');
  assert.ok(r.alternativen.length >= 1 && r.alternativen.every((a) => a.raum !== 'vorne'));
  assert.equal(new Set(r.alternativen.map((a) => a.raum)).size, r.alternativen.length);
});

test('Sacherschließung aus MARC21: Sachgruppe nur aus sdnb-Feldern, 689-Kette, Erscheinungsheft', () => {
  const xml = `<records><record type="Bibliographic">
    <controlfield tag="001">1234567890</controlfield>
    <controlfield tag="008">250101s2026    gw |||||r|||| 00| 0 ger c</controlfield>
    <datafield tag="015" ind1=" " ind2=" "><subfield code="a">26,A30</subfield><subfield code="2">dnb</subfield></datafield>
    <datafield tag="020" ind1=" " ind2=" "><subfield code="a">9783518468807</subfield></datafield>
    <datafield tag="041" ind1=" " ind2=" "><subfield code="a">ger</subfield><subfield code="h">eng</subfield></datafield>
    <datafield tag="082" ind1="0" ind2="4"><subfield code="a">322.4</subfield><subfield code="2">23/ger</subfield></datafield>
    <datafield tag="083" ind1="7" ind2=" "><subfield code="a">320</subfield><subfield code="a">360</subfield><subfield code="2">23sdnb</subfield></datafield>
    <datafield tag="264" ind1=" " ind2="1"><subfield code="c">2026</subfield></datafield>
    <datafield tag="490" ind1="1" ind2=" "><subfield code="a">edition suhrkamp</subfield><subfield code="v">2801</subfield></datafield>
    <datafield tag="653" ind1=" " ind2=" "><subfield code="a">Bestseller-Autor</subfield></datafield>
    <datafield tag="689" ind1="0" ind2="0"><subfield code="D">s</subfield><subfield code="a">Feminismus</subfield></datafield>
    <datafield tag="689" ind1="0" ind2="1"><subfield code="D">g</subfield><subfield code="a">Japan</subfield></datafield>
    <datafield tag="689" ind1="0" ind2="2"><subfield code="A">f</subfield><subfield code="a">Aufsatzsammlung</subfield></datafield>
    <datafield tag="689" ind1="0" ind2="3"><subfield code="A">z</subfield><subfield code="a">Geschichte 1933-1945</subfield></datafield>
    <datafield tag="689" ind1="0" ind2=" "><subfield code="5">DE-101</subfield></datafield>
  </record></records>`;
  const e = ausMarc(marcSaetze(xml)[0]);
  assert.deepEqual(e.dnb, ['320', '360']);
  assert.deepEqual(e.sprache, ['ger']);
  assert.deepEqual(e.schlagwoerter, ['Feminismus']);
  assert.deepEqual(e.geografika, ['Japan']);
  assert.deepEqual(e.form, ['Aufsatzsammlung']);
  assert.deepEqual(e.reihen, ['edition suhrkamp']);
  assert.equal(e.erschienen, '2026-07');
  assert.equal(besterSatz(xml, '978-3-518-46880-7').idn, '1234567890');
});

test('Stapel nach Raum: Grabbelkiste, Räume in Plan-Reihenfolge (nach Abteilung), Raum unbekannt, Lager', async () => {
  const { stapelGruppen } = await import('../src/lib/stapelwert');
  const e = (id: number, kategorie: 'grabbel' | 'regal' | 'lager', raum?: string, abt?: string) => ({
    id, kategorie, endpreis: id, standort_raum: raum ?? null, standort_abteilung: abt ?? null,
  });
  const g = stapelGruppen(
    [
      e(1, 'regal', 'werkstatt', 'Belletristik'),
      e(2, 'regal', 'vorne', 'Kunst'),
      e(3, 'grabbel'),
      e(4, 'regal', 'werkstatt', 'Belletristik'),
      e(5, 'regal', 'wintergarten', 'Lyrik'),
      e(6, 'regal'),
      e(7, 'lager', 'flur', 'Reclam-Hefte'),
      e(8, 'regal', 'wintergarten', 'Krimi'),
    ],
    'raum',
    LADENPLAN.raeume,
  );
  assert.deepEqual(
    g.map((x) => [x.kategorie ?? x.titel, x.data.map((d) => d.id)]),
    [
      ['grabbel', [3]],
      ['Vorderraum', [2]],
      ['Wintergarten', [8, 5]],
      ['Werkstatt', [4, 1]],
      ['Raum unbekannt', [6]],
      ['lager', [7]],
    ],
  );
  assert.equal(g[1].farbe, LADENPLAN.raeume.find((r) => r.id === 'vorne')!.farbe);
});
