/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { berechnePreis, aufRaster, PreisErgebnis, STANDARD_REGELN, zustandAusText } from '../src/lib/preis';
import { regelnMitStandards } from '../src/einstellungen';
import { bereichAusSachgruppe, bereichFuerBuch, erstesFach, sachgruppeOhneCode, BEREICHE } from '../src/lib/bereiche';

/** Rechnung als Text, damit Tests die Zeilen prüfen können. */
const schrittText = (r: PreisErgebnis) => r.schritte.map((s) => `${s.label} ${s.wert ?? ''}`).join(' | ');
const notizText = (r: PreisErgebnis) => r.notizen.join(' | ');
import { normalisiereIsbn, istIsbn13, findeIsbnInText } from '../src/lib/isbn';
import { parseDnb, isbnZusatz } from '../src/lib/dnb';
import { baueCql, schaetzeRollen, felderAusRollen, OcrZeile } from '../src/lib/suche';
import { zuCsv } from '../src/lib/csv';
import { parseKiAntwort } from '../src/lib/ki';
import { vergleichsLink, STANDARD_LINKS } from '../src/lib/links';
import { coverKette, dnbCoverUrl, GOOGLE, parseGoogleCover } from '../src/lib/cover';
import { bindungAus, facetten, filtere, verlagSchluessel } from '../src/lib/ausgaben';
import { autorTeile, kernTitel, werkKandidaten } from '../src/lib/wiki';
import { zuletzt } from '../src/lib/zuletzt';
import { bereinigeAntwort, beschreibungsPrompt } from '../src/lib/beschreibung';
import { bewerteSeltenheit, STANDARD_SELTENHEIT } from '../src/lib/seltenheit';
import { stapelGruppen, stapelWert } from '../src/lib/stapelwert';
import { coverUrl as olCoverUrl } from '../src/lib/openlibrary';

// ---------- Preis ----------

test('Raster: 50-Cent-Schritte, kaufmännisch', () => {
  assert.equal(aufRaster(3.24, 0.5, 'naechst'), 3.0);
  assert.equal(aufRaster(3.25, 0.5, 'naechst'), 3.5);
  assert.equal(aufRaster(2.75, 0.5, 'naechst'), 3.0);
  assert.equal(aufRaster(3.49, 0.5, 'ab'), 3.0);
});

test('Regal: 12 € online, Zustand gut → −10 % Markt −10 % Zustand = 9,60 → 9,50 €', () => {
  const r = berechnePreis({ vergleichspreis: 12, zustand: 'gut', merkmale: [] })!;
  assert.equal(r.kategorie, 'regal');
  assert.equal(r.prozent, -0.2);
  assert.equal(r.rohwert, 9.6);
  assert.equal(r.vorschlag, 9.5);
});

test('Zustand wirkt positiv (wie neu) und negativ (ab gut)', () => {
  assert.equal(berechnePreis({ vergleichspreis: 10, zustand: 'wie_neu', merkmale: [] })!.prozent, 0); // −10 Markt +10 Zustand
  assert.equal(berechnePreis({ vergleichspreis: 10, zustand: 'sehr_gut', merkmale: [] })!.prozent, -0.1);
  assert.ok(Math.abs(berechnePreis({ vergleichspreis: 10, zustand: 'maengel', merkmale: [] })!.prozent + 0.4) < 1e-9);
});

test('Merkmale wirken nur als Zuschlag, in % oder €', () => {
  const r = berechnePreis({ vergleichspreis: 10, zustand: 'gut', merkmale: ['schutzumschlag'] })!;
  assert.ok(Math.abs(r.prozent + 0.1) < 1e-9);
  const r2 = berechnePreis({ vergleichspreis: 10, zustand: 'sehr_gut', merkmale: ['schutzumschlag', 'selten', 'erstausgabe'] })!;
  assert.ok(Math.abs(r2.prozent - 0.45) < 1e-9);
  const r3 = berechnePreis({ vergleichspreis: 4, zustand: 'sehr_gut', merkmale: ['signiert'] })!;
  assert.equal(r3.euroZuschlag, 20);
  // Laden 4 − 10 % + 20 € = 23,60 ≥ 15 → Lager ohne Unterbieten: 4 + 20 € = 24
  assert.equal(r3.vorschlag, 24);
});

test('Rechnung zeigt jeden Posten mit Vorzeichen', () => {
  const regeln = { ...STANDARD_REGELN, merkmale: { ...STANDARD_REGELN.merkmale, signiert: { art: 'euro' as const, wert: 100 } } };
  const r = berechnePreis({ vergleichspreis: 10, zustand: 'gut', merkmale: ['schutzumschlag', 'signiert'] }, regeln)!;
  const t = schrittText(r);
  assert.ok(t.includes('Zustand Gut − 10 %'), t);
  assert.ok(t.includes('Schutzumschlag/Top + 10 %'), t);
  assert.ok(t.includes('Signiert/Widmung + 100,00 €'), t);
  // Laden: 10 − 1 − 1 + 1 + 100 = 109 ≥ 15 → Lager (kein Unterbieten): 10 − 1 + 1 + 100 = 110
  assert.equal(r.vorschlag, 110);
});

test('Knappheit: wenige Angebote → Zuschlag, ganz wenige → nicht unterbieten + Prüfhinweis', () => {
  const zwei = berechnePreis({ vergleichspreis: 10, anzahlAngebote: 2, zustand: 'gut', merkmale: [] })!;
  assert.ok(Math.abs(zwei.prozent - 0.1) < 1e-9); // kein Unterbieten, −10 Zustand, +20 Knappheit
  assert.ok(schrittText(zwei).includes('nicht unterboten'));
  assert.ok(zwei.hinweise.some((h) => h.includes('Preis selbst prüfen')));
  const eins = berechnePreis({ vergleichspreis: 10, anzahlAngebote: 1, zustand: 'gut', merkmale: [] })!;
  assert.ok(Math.abs(eins.prozent - 0.2) < 1e-9); // −10 +30
  const fuenf = berechnePreis({ vergleichspreis: 10, anzahlAngebote: 5, zustand: 'gut', merkmale: [] })!;
  assert.ok(Math.abs(fuenf.prozent + 0.1) < 1e-9); // −10 −10 +10
  const masse = berechnePreis({ vergleichspreis: 10, anzahlAngebote: 80, zustand: 'gut', merkmale: [] })!;
  assert.ok(Math.abs(masse.prozent + 0.25) < 1e-9); // −10 −10 −5
  assert.ok(schrittText(masse).includes('Massenware'));
});

test('Knappheit zählt nicht, wenn eine Preisquelle ausgefallen ist', () => {
  const r = berechnePreis({ vergleichspreis: 10, anzahlAngebote: 2, zustand: 'gut', merkmale: [], marktUnvollstaendig: true })!;
  assert.ok(Math.abs(r.prozent + 0.1) < 1e-9);
  assert.ok(schrittText(r).includes('Knappheit nicht gewertet'));
});

test('Knappheit ist einstellbar', () => {
  const regeln = { ...STANDARD_REGELN, knappheit: { ...STANDARD_REGELN.knappheit, einAngebot: 0.5 } };
  const r = berechnePreis({ vergleichspreis: 10, anzahlAngebote: 1, zustand: 'sehr_gut', merkmale: [] }, regeln)!;
  assert.equal(r.rohwert, 15); // 10 + 50 %
});

test('Grabbelkiste: 1 € bzw. 2 €, Regal ab 2,50 €', () => {
  const g1 = berechnePreis({ vergleichspreis: 1.2, zustand: 'gut', merkmale: [] })!;
  assert.deepEqual([g1.kategorie, g1.vorschlag], ['grabbel', 1]);
  const g2 = berechnePreis({ vergleichspreis: 2.4, zustand: 'gut', merkmale: [] })!; // 1,92
  assert.deepEqual([g2.kategorie, g2.vorschlag], ['grabbel', 2]);
  const r = berechnePreis({ vergleichspreis: 2.95, zustand: 'gut', merkmale: [] })!; // 2,36 → 2,50
  assert.deepEqual([r.kategorie, r.vorschlag], ['regal', 2.5]);
});

test('Ab 15 € → Lager, gerechnet mit den Lager-Regeln', () => {
  const r = berechnePreis({ vergleichspreis: 19.9, zustand: 'sehr_gut', merkmale: [] })!; // Laden: 17,91
  assert.equal(r.kategorie, 'lager');
  assert.equal(r.zweig, 'lager');
  // Lager-Regeln: kein Unterbieten → 19,90 → 20,00
  assert.equal(r.vorschlag, 20);
});

test('Signiert/Erstausgabe → Prüfhinweis', () => {
  const r = berechnePreis({ vergleichspreis: 8, zustand: 'gut', merkmale: ['signiert'] })!;
  assert.equal(r.hinweise.length, 1);
});

test('Schätzpreis ohne Vergleich, kein Abschlag', () => {
  const r = berechnePreis({ schaetzpreis: 4.2, zustand: 'gut', merkmale: [] })!;
  assert.deepEqual([r.quelle, r.vorschlag, r.prozent], ['schaetzung', 4, 0]);
});

test('Ohne Preisangabe → null', () => {
  assert.equal(berechnePreis({ zustand: 'gut', merkmale: [] }), null);
});

test('Über Neupreis → Neupreis ist die Referenz', () => {
  const r = berechnePreis({ vergleichspreis: 20, neupreis: 12, zustand: 'gut', merkmale: [] })!;
  // Neupreis 12 € ist niedriger als der Markt (20 €) → 12 − 20 % = 9,60 → abgerundet 9,50
  assert.equal(r.kategorie, 'regal');
  assert.equal(r.vorschlag, 9.5);
  assert.ok(schrittText(r).includes('Neupreis'));
});

test('Reclam für 6,40 € neu: Gebrauchtpreis bleibt darunter', () => {
  const r = berechnePreis({ vergleichspreis: 8, neupreis: 6.4, zustand: 'gut', merkmale: [] })!;
  // Neupreis 6,40 ist Referenz → 6,40 − 20 % = 5,12 → abgerundet auf 0,50-Raster: 5,00
  assert.equal(r.kategorie, 'regal');
  assert.equal(r.vorschlag, 5);
  assert.ok(schrittText(r).includes('Neupreis'));
});

test('Zustand wirkt bei Neupreis-Referenz, soweit das 0,50-Raster es zulässt', () => {
  const preis = (zustand: 'wie_neu' | 'gut' | 'maengel') =>
    berechnePreis({ vergleichspreis: 8, neupreis: 6.4, zustand, merkmale: [] })!.vorschlag;
  // wie neu ±0 = 6,40 → 6,00; gut −20 % = 5,12 → 5,00; Mängel −40 % = 3,84 → 3,50
  assert.deepEqual([preis('wie_neu'), preis('gut'), preis('maengel')], [6, 5, 3.5]);
});

test('Neupreis-Referenz drückt den Lagerpreis unter die Grenze → Regal', () => {
  const r = berechnePreis({ vergleichspreis: 19.9, neupreis: 15, zustand: 'gut', merkmale: [] })!;
  // Neupreis 15 − 20 % = 12,00 < 15 → bleibt im Laden
  assert.equal(r.kategorie, 'regal');
  assert.equal(r.vorschlag, 12);
});

test('Neupreis-Referenz gilt auch im Lager', () => {
  const r = berechnePreis({ vergleichspreis: 30, neupreis: 20, zustand: 'gut', merkmale: [] })!;
  // Neupreis 20 als Referenz: Laden 16 ≥ 15 → Lager nur Zustand −10 % → 18,00
  assert.equal(r.kategorie, 'lager');
  assert.equal(r.vorschlag, 18);
});

test('Zustand wirkt auch, wenn der Neupreis die Referenz ist', () => {
  const preis = (zustand: 'wie_neu' | 'gut' | 'maengel') =>
    berechnePreis({ vergleichspreis: 12, neupreis: 10, zustand, merkmale: [] })!.vorschlag;
  // Alle drei Zustände müssen sich unterscheiden, obwohl der Neupreis deckelt
  assert.deepEqual([preis('wie_neu'), preis('gut'), preis('maengel')], [10, 8, 6]);
});

test('Regeln sind austauschbar (z. B. Lager ab 20 €)', () => {
  const r = berechnePreis(
    { vergleichspreis: 19.9, zustand: 'sehr_gut', merkmale: [] },
    { ...STANDARD_REGELN, lagerAb: 20 },
  )!;
  assert.equal(r.kategorie, 'regal');
});

// ---------- Ladenbereiche ----------

test('Bereich aus DNB-Sachgruppe', () => {
  assert.equal(bereichAusSachgruppe('100 Philosophie'), 'geist');
  assert.equal(bereichAusSachgruppe('830 Deutsche Literatur'), 'belletristik');
  assert.equal(bereichAusSachgruppe('B Belletristik'), 'belletristik');
  assert.equal(bereichAusSachgruppe('K Kinder- und Jugendliteratur'), 'vorderraum');
  assert.equal(bereichAusSachgruppe('900 Geschichte'), 'geschichte');
  assert.equal(bereichAusSachgruppe('150 Psychologie'), 'sachbuch');
  assert.equal(bereichAusSachgruppe('720 Architektur'), 'vorderraum');
  assert.equal(bereichAusSachgruppe('380 Kommunikation'), 'sachbuch');
  assert.equal(bereichAusSachgruppe('Xyz'), null);
});

test('Etikett zeigt das konkrete Fach, nicht den Bereich', () => {
  assert.equal(sachgruppeOhneCode('100 Philosophie'), 'Philosophie');
  assert.equal(sachgruppeOhneCode('830 Deutsche Literatur'), 'Deutsche Literatur');
  assert.equal(sachgruppeOhneCode('B Belletristik'), 'Belletristik');
  assert.equal(erstesFach('150 Psychologie; 100 Philosophie'), 'Psychologie');
  assert.equal(erstesFach('100 Philosophie; 150 Psychologie'), 'Philosophie');
  assert.equal(erstesFach(null), null);
});

test('Erstes Fach gewinnt, Grabbelkiste schlägt alles', () => {
  assert.equal(bereichFuerBuch({ sachgruppen: '150 Psychologie; 100 Philosophie' }), 'sachbuch');
  assert.equal(bereichFuerBuch({ sachgruppen: '100 Philosophie; 150 Psychologie' }), 'geist');
  assert.equal(bereichFuerBuch({ sachgruppen: '100 Philosophie', kategorie: 'grabbel' }), 'grabbel');
  assert.equal(bereichFuerBuch({ sachgruppen: null }), null);
  // Grabbelkisten-Farbe ist bewusst nicht aus dem Plan
  assert.equal(BEREICHE.grabbel.farbe, '#7B4FD6');
});

// ---------- ISBN ----------

test('ISBN: Barcode, ISBN-10 und Prüfziffer', () => {
  assert.ok(istIsbn13('9783518468807'));
  assert.equal(normalisiereIsbn('3-518-46880-4'), '9783518468807');
  assert.equal(normalisiereIsbn('9783518468808'), null);
  assert.equal(normalisiereIsbn('4006381333931'), null); // normaler EAN, kein Buch
  assert.equal(findeIsbnInText('Copyright 1984 ISBN 3-518-46880-4 Printed'), '9783518468807');
});

// ---------- DNB ----------

const DNB_XML = `<?xml version="1.0" encoding="UTF-8"?>
<searchRetrieveResponse xmlns="http://www.loc.gov/zing/srw/"><version>1.1</version><numberOfRecords>1</numberOfRecords><records><record><recordSchema>oai_dc</recordSchema><recordPacking>xml</recordPacking><recordData><dc xmlns:dnb="http://d-nb.de/standards/dnbterms" xmlns="http://www.openarchives.org/OAI/2.0/oai_dc/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>[Venetië - de leeuw, de stad en het water] ; Venedig - der Löwe, die Stadt und das Wasser / Cees Nooteboom ; mit Fotografien von Simone Sassen</dc:title>
<dc:creator>Nooteboom, Cees [Verfasser]</dc:creator>
<dc:creator>Sassen, Simone [Fotograf]</dc:creator>
<dc:creator>Beuningen, Helga van [Übersetzer]</dc:creator>
<dc:publisher>Berlin : Suhrkamp</dc:publisher>
<dc:date>2021</dc:date>
<dc:language>ger</dc:language>
<dc:identifier xmlns:tel="tel" xsi:type="tel:ISBN">978-3-518-46880-7 Broschur : EUR 12.00 (DE), EUR 12.40 (AT), CHF 17.90 (freier Preis)</dc:identifier>
<dc:identifier xmlns:tel="tel" xsi:type="tel:ISBN">3-518-46880-4</dc:identifier>
<dc:identifier xsi:type="dnb:IDN">1207486337</dc:identifier>
<dc:format>238 Seiten</dc:format>
</dc></recordData><recordPosition>1</recordPosition></record></records></searchRetrieveResponse>`;

test('DNB oai_dc parsen (echte Struktur vom 07.11.2026)', () => {
  const { gesamt, titel } = parseDnb(DNB_XML);
  assert.equal(gesamt, 1);
  const t = titel[0];
  assert.equal(t.titel, 'Venedig - der Löwe, die Stadt und das Wasser');
  assert.deepEqual(t.autoren, ['Nooteboom, Cees']);
  assert.equal(t.verlag, 'Suhrkamp');
  assert.equal(t.ort, 'Berlin');
  assert.equal(t.jahr, '2021');
  assert.equal(t.isbn, '9783518468807');
  assert.equal(t.einband, 'Broschur');
  assert.equal(t.neupreis, 12);
  assert.equal(t.id, '1207486337');
});

test('ISBN-Zusatzfeld ohne Preis', () => {
  assert.deepEqual(isbnZusatz('3-518-46880-4'), { einband: undefined, neupreis: undefined });
});

test('ISBN-Zusatzfeld: Preis auch ohne „(DE)“', () => {
  // so steht es bei vielen Reclam-Bänden in der DNB
  assert.deepEqual(isbnZusatz('978-3-15-007114-4 kart. : EUR 5.80'), { einband: 'kart.', neupreis: 5.8 });
  assert.equal(isbnZusatz('978-3-518-46880-7 Broschur : EUR 12.00 (DE), EUR 12.40 (AT)').neupreis, 12);
});

// ---------- Suche ----------

test('CQL aus Feldern', () => {
  assert.equal(baueCql({ titel: 'Der Zauberberg', autor: 'Thomas Mann' }), 'tit=zauberberg and per=mann');
  assert.equal(baueCql({ autor: 'Mann, Thomas' }), 'per=mann');
  assert.equal(baueCql({ autor: 'Ingeborg Bachmann', titel: 'Malina' }), 'tit=malina and per=bachmann');
  assert.equal(baueCql({ frei: 'und der die' }), null);
  assert.equal(baueCql({ titel: 'Ulysses', jahr: '1927' }), 'tit=ulysses and jhr=1927');
});

test('OCR-Rollen: größte Schrift = Titel, Jahr, Verlag unten', () => {
  const zeilen: OcrZeile[] = [
    { text: 'THOMAS MANN', hoehe: 30, oben: 100 },
    { text: 'DER ZAUBERBERG', hoehe: 70, oben: 300 },
    { text: 'ROMAN', hoehe: 25, oben: 420 },
    { text: 'S. FISCHER VERLAG', hoehe: 20, oben: 900 },
    { text: 'BERLIN 1926', hoehe: 18, oben: 940 },
  ];
  const rollen = schaetzeRollen(zeilen);
  assert.deepEqual(rollen, ['autor', 'titel', 'ignorieren', 'ignorieren', 'jahr']);
  const f = felderAusRollen(zeilen, rollen);
  assert.equal(f.titel, 'DER ZAUBERBERG');
  assert.equal(f.jahr, '1926');
});

// ---------- CSV / KI / Links ----------

test('CSV deutsch', () => {
  const csv = zuCsv(['a', 'b'], [['x;y', 2.5]]);
  assert.equal(csv, '﻿a;b\r\n"x;y";2,5\r\n');
});

test('KI-Antwort mit Codezaun parsen', () => {
  const a = parseKiAntwort('```json\n{"autor":"Kafka, Franz","titel":"Der Proceß","jahr":"Berlin 1925","isbn":""}\n```');
  assert.deepEqual([a.autor, a.titel, a.jahr, a.isbn], ['Kafka, Franz', 'Der Proceß', '1925', undefined]);
});

test('Vergleichslink mit ISBN und mit Text', () => {
  const bl = STANDARD_LINKS[1];
  assert.equal(
    vergleichsLink(bl, { quelle: 'dnb', titel: 'X', autoren: [], isbn: '9783518468807' }),
    'https://www.booklooker.de/B%C3%BCcher/Angebote/isbn=9783518468807',
  );
  assert.ok(vergleichsLink(bl, { quelle: 'dnb', titel: 'Der Proceß', autoren: ['Kafka, Franz'] }).includes('Kafka%20Der%20Proce'));
});

// ---------- Preisquellen / Markt / Trend ----------
import { parseEurobuch } from '../src/lib/quellen/eurobuch';
import { parseBooklooker } from '../src/lib/quellen/booklooker';
import { parseEbay } from '../src/lib/quellen/ebay';
import { marktlage, entdoppeln, ankerAngebot, marktAbfragen, Angebot } from '../src/lib/markt';
import { angebotsSignal, interesseVerhaeltnis, neuauflageAus } from '../src/lib/trend';

test('eurobuch-XML laut Doku (Attribute, Groß-/Kleinschreibung egal)', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8" ?><ResultList id="77">
  <Book id="1" author="Holl, Adolf" title="Jesus in schlechter Gesellschaft" comment="Erstausgabe, OLn. mit OU, gut erhalten" year="1971" price="8.50" currency="EUR" priceeur="8.50" country="DE" dealer="Antiquariat Muster" url="https://x/1" picurl="" paperback="0" hardcover="1" signed="0" firstedition="1" platform="ZVAB" />
  <BOOK ID="2" AUTHOR="Holl" TITLE="Jesus" PRICE="12" CURRENCY="CHF" PRICEEUR="12,70" PLATFORM="AbeBooks" />
  </ResultList>`;
  const a = parseEurobuch(xml, 3);
  assert.equal(a.length, 2);
  assert.deepEqual([a[0].plattform, a[0].preis, a[0].gesamt, a[0].erstausgabe, a[0].gebunden, a[0].versandGeschaetzt], ['ZVAB', 8.5, 11.5, true, true, true]);
  assert.equal(a[1].preis, 12.7); // Fremdwährung → priceeur
});

test('booklooker-XML generisch (Elementnamen geraten, DetailLinkUrl laut Doku)', () => {
  const xml = `<?xml version="1.0"?><Result><Count>2</Count>
  <Item><Title>Der Zauberberg</Title><Author>Mann, Thomas</Author><Price>4,50</Price><ShippingPrice>2,80</ShippingPrice><Condition>gut</Condition><SellerType>1</SellerType><DetailLinkUrl>https://www.booklooker.de/a/1</DetailLinkUrl></Item>
  <Item><Title>Der Zauberberg</Title><Price>3.00</Price><DetailLinkUrl>https://www.booklooker.de/a/2</DetailLinkUrl></Item>
  </Result>`;
  const a = parseBooklooker(xml, 3);
  assert.equal(a.length, 2);
  assert.deepEqual([a[0].preis, a[0].versand, a[0].gesamt, a[0].versandGeschaetzt, a[0].url], [4.5, 2.8, 7.3, false, 'https://www.booklooker.de/a/1']);
  assert.deepEqual([a[1].gesamt, a[1].versandGeschaetzt], [6, true]);
});

test('eBay-JSON', () => {
  const a = parseEbay({ itemSummaries: [
    { title: 'Zauberberg', price: { value: '5.00', currency: 'EUR' }, shippingOptions: [{ shippingCost: { value: '1.95', currency: 'EUR' } }], itemWebUrl: 'https://ebay/1', condition: 'Gebraucht' },
    { title: 'x', price: { value: '9', currency: 'USD' } },
  ] }, 3);
  assert.equal(a.length, 1);
  assert.equal(a[0].gesamt, 6.95);
});

const ang = (plattform: string, preis: number, versandGeschaetzt = true, haendler = 'h'): Angebot => ({
  quelle: 'eurobuch', plattform, haendler, preis, versand: 3, versandGeschaetzt, gesamt: preis + 3,
});

// ---------- Ankerwahl Laden/Lager ----------

test('Im Laden ankert das günstigste Angebot', () => {
  const angebote = [ang('A', 5), ang('B', 9), ang('C', 20)]; // gesamt 8 / 12 / 23
  const r = berechnePreis({ angebote, zustand: 'gut', merkmale: [] })!;
  assert.equal(r.kategorie, 'regal');
  assert.equal(r.zweig, 'laden');
  assert.equal(r.vergleichspreis, 8);
  assert.equal(r.vorschlag, 8); // 8 − 10 % Markt − 10 % Zustand + 20 % Knappheit (3 Angebote) = 8,00
});

test('Über der Lagergrenze: Anker ist das zweitgünstigste Angebot', () => {
  const angebote = [ang('A', 20), ang('B', 24), ang('C', 32)]; // gesamt 23 / 27 / 35
  const r = berechnePreis({ angebote, zustand: 'gut', merkmale: [] })!; // Laden: 23 ± 0 % = 23 ≥ 15
  assert.equal(r.kategorie, 'lager');
  assert.equal(r.zweig, 'lager');
  assert.equal(r.vergleichspreis, 27); // zweitgünstigstes
  assert.equal(r.vorschlag, 29.5); // 27 − 10 % Zustand + 20 % Knappheit = 29,70 → 29,50
  assert.ok(schrittText(r).includes('zweitgünstigstes'));
});

test('Lager-Anker lässt sich auf „günstigstes“ umstellen', () => {
  const angebote = [ang('A', 20), ang('B', 24), ang('C', 32)];
  const regeln = { ...STANDARD_REGELN, lager: { ...STANDARD_REGELN.lager, anker: 'guenstigstes' as const } };
  const r = berechnePreis({ angebote, zustand: 'gut', merkmale: [] }, regeln)!;
  assert.equal(r.vergleichspreis, 23);
  assert.equal(r.vorschlag, 25.5); // 23 − 10 % + 20 % = 25,30 → 25,50
});

test('Nur gleiche Ausgabe zählt, wenn genug Angebote da sind', () => {
  const angebote = [
    { ...ang('A', 15), jahr: '1990' },
    { ...ang('B', 19), jahr: '2013' },
    { ...ang('C', 27), jahr: '2013' },
  ];
  const r = berechnePreis({ angebote, zustand: 'gut', merkmale: [], jahr: '2013' })!;
  assert.equal(r.vergleichspreis, 30); // zweitgünstigstes von 2013 (22 / 30)
  assert.ok(schrittText(r).includes('gleiche Ausgabe 2013'));
});

test('Zu wenige vergleichbare Angebote → Filter wird gelockert', () => {
  const angebote = [{ ...ang('A', 15), jahr: '1990' }, { ...ang('B', 19), jahr: '2013' }];
  const r = berechnePreis({ angebote, zustand: 'gut', merkmale: [], jahr: '2013' })!;
  assert.equal(r.vergleichspreis, 22); // nur eines mit 2013 → alle Ausgaben, zweitgünstigstes = 22
  assert.ok(notizText(r).includes('alle Ausgaben verglichen'));
});

test('Lager bevorzugt Angebote im selben Zustand', () => {
  const angebote = [
    { ...ang('A', 20), zustandText: 'sehr gut erhalten' },
    { ...ang('B', 24), zustandText: 'gebraucht, gut' },
    { ...ang('C', 26), zustandText: 'gut, leichte Spuren' },
  ];
  const r = berechnePreis({ angebote, zustand: 'gut', merkmale: [] })!;
  assert.equal(r.vergleichspreis, 29); // zweitgünstigstes der „gut“-Angebote (27 / 29)
  assert.ok(schrittText(r).includes('Zustand Gut'));
  // Zustand steckt schon im Vergleich → kein zweiter Abschlag; 3 Angebote → +20 % Knappheit
  assert.equal(r.vorschlag, 35);
});

test('Zustand aus Händlertext lesen', () => {
  assert.equal(zustandAusText('sehr gut erhalten'), 'sehr_gut');
  assert.equal(zustandAusText('Mängelexemplar, bestoßen'), 'maengel');
  assert.equal(zustandAusText('gebraucht, gut'), 'gut');
  assert.equal(zustandAusText('wie neu, ungelesen'), 'wie_neu');
  assert.equal(zustandAusText(undefined), null);
});

test('Nur ein vergleichbares Angebot → Erklärung sagt es', () => {
  const r = berechnePreis({ angebote: [ang('A', 30)], zustand: 'gut', merkmale: [] })!;
  assert.equal(r.kategorie, 'lager');
  assert.ok(notizText(r).includes('Nur ein vergleichbares Angebot'));
});

test('Alte flache Regeln werden als Laden-Regeln übernommen', () => {
  const r = regelnMitStandards({
    abschlagNachZustand: { gut: 0.2 },
    abschlagMin: 0.15,
    lagerAb: 20,
  } as unknown as Parameters<typeof regelnMitStandards>[0]);
  assert.equal(r.laden.marktAbschlag, 0.15); // alter Mindestabschlag = Unterbieten
  assert.equal(r.zustand.gut, -0.1); // alte Zustands-Abschläge passen nicht → Standard
  assert.equal(r.lager.anker, 'zweitguenstigstes');
  assert.equal(r.lagerAb, 20);
});

test('Marktlage, Entdoppeln, Anker mit Ausreißer', () => {
  assert.deepEqual(marktlage([ang('A', 1), ang('B', 5), ang('C', 9)]), { anzahl: 3, min: 4, median: 8, max: 12 });
  const d = entdoppeln([ang('booklooker', 5, true), { ...ang('booklooker', 5, false), quelle: 'booklooker' }]);
  assert.equal(d.length, 1);
  assert.equal(d[0].versandGeschaetzt, false);
  const { ausreisser } = ankerAngebot([ang('A', 0.5), ang('B', 20), ang('C', 22), ang('D', 25)].map((x) => x));
  assert.equal(ausreisser, true);
});

test('Markt: eine Quelle fällt aus, die andere liefert', async () => {
  const m = await marktAbfragen(
    [
      { id: 'booklooker', aktiv: true, suche: async () => { throw new Error('kaputt'); } },
      { id: 'eurobuch', aktiv: true, suche: async () => [ang('ZVAB', 7), ang('AbeBooks', 4)] },
      { id: 'ebay', aktiv: false, suche: async () => [ang('eBay', 1)] },
    ],
    { isbn: '9783518468807' },
  );
  assert.equal(m.angebote[0].plattform, 'AbeBooks');
  assert.deepEqual(m.status.map((s) => [s.quelle, s.ok]), [['booklooker', false], ['eurobuch', true]]);
});

test('Trend-Signale', () => {
  assert.equal(angebotsSignal([{ zeit: '2026-01-01T00:00:00Z', anzahl: 12, min: 5 }]).richtung, 'unbekannt');
  const s = angebotsSignal([
    { zeit: '2026-08-01T00:00:00Z', anzahl: 12, min: 5 },
    { zeit: '2026-11-01T00:00:00Z', anzahl: 4, min: 8 },
  ]);
  assert.equal(s.richtung, 'hoch');
  const werte = [...Array(335).fill(100), ...Array(30).fill(250)];
  assert.equal(interesseVerhaeltnis(werte), 2.5);
  const jetzt = new Date('2026-11-07');
  assert.equal(neuauflageAus(['1952', '2026'], '1952', jetzt).richtung, 'runter');
  assert.equal(neuauflageAus(['1952', '1990'], '1952', jetzt).richtung, 'gleich');
});

test('Cover-Kette: DNB → Google → Open Library, ohne doppelte Adressen', () => {
  const isbn = '9783446205628';
  assert.deepEqual(coverKette(isbn), [dnbCoverUrl(isbn), GOOGLE + isbn, olCoverUrl(isbn)]);
  assert.deepEqual(coverKette(isbn, olCoverUrl(isbn)), [dnbCoverUrl(isbn), GOOGLE + isbn, olCoverUrl(isbn)]);
  assert.deepEqual(coverKette(undefined, 'https://x/c.jpg'), ['https://x/c.jpg']);
  assert.deepEqual(coverKette(), []);
});

test('Google-Cover: https, ohne Eselsohr, leer → null', () => {
  const url = parseGoogleCover({
    items: [{}, { volumeInfo: { imageLinks: { thumbnail: 'http://books.google.com/books/content?id=a&img=1&zoom=1&edge=curl&source=gbs_api' } } }],
  });
  assert.equal(url, 'https://books.google.com/books/content?id=a&img=1&zoom=1&source=gbs_api');
  assert.equal(parseGoogleCover({}), null);
});

test('Ausgaben-Filter: Bindung aus DNB-Kürzeln, Verlage zusammengefasst', () => {
  assert.equal(bindungAus('kart.'), 'tb');
  assert.equal(bindungAus('Broschur'), 'tb');
  assert.equal(bindungAus('Pp.'), 'hc');
  assert.equal(bindungAus('Gb.'), 'hc');
  assert.equal(bindungAus('Lw.'), 'hc');
  assert.equal(bindungAus(undefined), undefined);
  assert.equal(verlagSchluessel('Suhrkamp Verlag GmbH'), verlagSchluessel('Suhrkamp'));
});

test('Ausgaben-Filter: Chips nur bei Auswahl, Zählung unter den anderen Filtern', () => {
  const t = (verlag: string, jahr: string, einband?: string) => ({ quelle: 'dnb' as const, titel: 'Homo faber', autoren: [], verlag, jahr, einband });
  const treffer = [t('Suhrkamp', '1977', 'kart.'), t('Suhrkamp Verlag', '1998', 'Pp.'), t('Bibliothek Suhrkamp', '1998', 'Pp.'), t('Suhrkamp', '2011', 'Broschur')];
  const f0 = facetten(treffer, {});
  assert.deepEqual(f0.bindung.map((c) => [c.label, c.anzahl]), [['Gebunden', 2], ['Taschenbuch', 2]]);
  assert.deepEqual(f0.verlag.map((c) => c.anzahl), [3, 1]);
  assert.deepEqual(f0.jahr.map((c) => c.wert), ['2011', '1998', '1977']);
  const f = { bindung: 'hc' as const };
  assert.equal(filtere(treffer, f).length, 2);
  // Unter „Gebunden“: Jahr 1998 zweimal, 1977/2011 gar nicht
  assert.deepEqual(facetten(treffer, f).jahr.map((c) => [c.wert, c.anzahl]), [['1998', 2]]);
  // Nur ein Verlag → keine Verlags-Zeile
  assert.deepEqual(facetten([treffer[0], treffer[3]], {}).verlag, []);
});

test('eurobuch: echte Versandkosten aus versandkosten_eur, 0,00 = versandkostenfrei', () => {
  const xml = `<ResultList>
  <Book id="1" title="Aufzeichnungen aus dem Kellerloch" price="11.75" currency="EUR" priceeur="11.75" platform="Buecher.de" versandkosten_eur="0.00" firstedtion="1" />
  <Book id="2" title="Aufzeichnungen aus dem Kellerloch" price="4.95" currency="EUR" priceeur="4.95" platform="ebay.de" versandkosten_eur="3.20" />
  <Book id="3" title="Aufzeichnungen aus dem Kellerloch" price="5" currency="EUR" priceeur="5" platform="ZVAB" />
  </ResultList>`;
  const a = parseEurobuch(xml, 3);
  assert.deepEqual(a.map((x) => [x.gesamt, x.versandGeschaetzt]), [[11.75, false], [8.15, false], [8, true]]);
  assert.equal(a[0].erstausgabe, true);
});

test('Wikipedia: Untertitel weg, Umschrift-Namen wiedererkennen, Werk vor Oper', () => {
  assert.equal(kernTitel('Aufzeichnungen aus dem Kellerloch: Erster und Zweiter Teil'), 'Aufzeichnungen aus dem Kellerloch');
  assert.equal(kernTitel('Homo faber - ein Bericht'), 'Homo faber');
  // DNB liefert teils zerlegte Umlaute (e + ¨)
  assert.deepEqual(autorTeile('Dostoevskij, Fe\u0308dor Michajlovic\u030c'), { suche: 'fedor michajlovic dostoevskij', stamm: 'dost' });
  const treffer = ['Kulturzentrum Faust', 'Faust', 'Faust. Eine Tragödie', 'Faust (Gounod)', 'Faust (Goethe)'];
  assert.deepEqual(werkKandidaten(treffer, 'Faust. Eine Tragödie', 'goet')[0], 'Faust. Eine Tragödie');
  // Genau gleicher Titel zuerst; ob er von der Person ist, prüft danach die Wikidata-Beschreibung
  assert.deepEqual(werkKandidaten(treffer, 'Faust', 'goet').slice(0, 2), ['Faust', 'Faust (Goethe)']);
  assert.ok(!werkKandidaten(treffer, 'Faust', 'goet').includes('Kulturzentrum Faust'));
});

test('Zuletzt angesehen: neueste zuerst, jedes Buch einmal, reine Suchen nicht', () => {
  const e = (id: number, titel: string | null, isbn: string | null = null) => ({
    id, zeit: '2026-11-07T10:00:00Z', suchbegriff: 'tit=x', isbn, titel, autor: null, endpreis: null, aktion: 'gesucht' as const,
  });
  const l = zuletzt([e(1, 'Homo faber'), e(2, null), e(3, 'Homo Faber'), e(4, 'Effi Briest', '9783150061127'), e(5, 'Effi Briest (andere)', '9783150061127')]);
  assert.deepEqual(l.map((x) => x.id), [5, 3]);
});

test('KI-Beschreibung: Prompt enthält Wikipedia-Auszug, <think> wird entfernt', () => {
  const t = { quelle: 'dnb' as const, titel: 'Aufzeichnungen aus dem Kellerloch', autoren: ['Dostoevskij, Fëdor'], jahr: '2006' };
  const p = beschreibungsPrompt(t, { titel: 'Aufzeichnungen aus dem Kellerloch', art: 'werk', auszug: 'Kurzroman von 1864.', url: 'u' });
  assert.ok(p.includes('Kurzroman von 1864.'));
  assert.ok(p.includes('Erscheinungsjahr dieser Ausgabe: 2006'));
  assert.equal(bereinigeAntwort('<think>hmm</think>\n  Ein Roman.  '), 'Ein Roman.');
});

// ---------- Seltenheit & Fehlalarm-Schutz ----------

const viele = (n: number, preis: number) => Array.from({ length: n }, (_, i) => ({ gesamt: preis + i * 0.5 }));

test('Seltenheit: gewöhnlich, gefragt, selten nach Angebotszahl', () => {
  const s = (anzahl: number) => bewerteSeltenheit({ anzahl, preis: 8, vergleich: 8, merkmale: [], angebote: viele(anzahl, 8), ueberIsbn: true }).stufe;
  assert.deepEqual([s(40), s(8), s(3)], ['gewoehnlich', 'gefragt', 'selten']);
});

test('Rarität: 1 Angebot und alt → volle Effekte', () => {
  const r = bewerteSeltenheit({ anzahl: 1, preis: 30, vergleich: 30, jahr: '1923', merkmale: [], angebote: [{ gesamt: 30 }], ueberIsbn: true });
  assert.deepEqual([r.stufe, r.bestaetigt, r.effekt], ['raritaet', true, 'voll']);
});

test('Fehlalarm: 0 Angebote → nie Glitzer, bei altem Buch nur „mögliche Rarität – prüfen“', () => {
  const alt = bewerteSeltenheit({ anzahl: 0, preis: null, jahr: '1890', merkmale: [] });
  assert.deepEqual([alt.moeglich, alt.bestaetigt, alt.effekt], [true, false, 'gedaempft']);
  const neu = bewerteSeltenheit({ anzahl: 0, preis: null, jahr: '2015', merkmale: [] });
  assert.equal(neu.stufe, 'gewoehnlich');
});

test('Fehlalarm: teures Einzelangebot ohne Bestätigung → gedämpft', () => {
  const angebote = [{ gesamt: 120 }, ...viele(30, 300)]; // nur eines in der Nähe von 120
  const r = bewerteSeltenheit({ anzahl: 31, preis: 110, vergleich: 120, merkmale: [], angebote, ueberIsbn: true });
  assert.equal(r.stufe, 'raritaet');
  assert.equal(r.effekt, 'gedaempft');
  assert.ok(r.vorbehalte.some((v) => v.includes('einzelnes Angebot')));
  // Zwei Angebote nahe beieinander bestätigen den Preis
  const ok = bewerteSeltenheit({ anzahl: 31, preis: 110, vergleich: 120, merkmale: [], angebote: [{ gesamt: 120 }, { gesamt: 130 }, ...viele(29, 300)], ueberIsbn: true });
  assert.deepEqual([ok.stufe, ok.effekt], ['raritaet', 'voll']);
});

test('Fehlalarm: Set/Konvolut als Vergleich zählt nicht', () => {
  const angebote = [{ gesamt: 150, titel: 'Werke in 12 Bänden' }, { gesamt: 160, titel: 'Gesamtausgabe' }, ...viele(30, 300)];
  const r = bewerteSeltenheit({ anzahl: 32, preis: 140, vergleich: 150, merkmale: [], angebote, ueberIsbn: true });
  assert.equal(r.effekt, 'gedaempft');
  assert.ok(r.vorbehalte.some((v) => v.includes('Set/Konvolut')));
});

test('Fehlalarm: ausgefallene Quelle oder Titelsuche → Angebotszahl unsicher', () => {
  const quelle = bewerteSeltenheit({ anzahl: 2, preis: 8, vergleich: 8, merkmale: [], angebote: viele(2, 8), ueberIsbn: true, marktUnvollstaendig: true });
  assert.deepEqual([quelle.stufe, quelle.effekt], ['selten', 'gedaempft']);
  const titel = bewerteSeltenheit({ anzahl: 2, preis: 8, vergleich: 8, merkmale: [], angebote: viele(2, 8), ueberIsbn: false });
  assert.ok(titel.vorbehalte.some((v) => v.includes('Per Titel gesucht')));
});

test('Teilweise belegt: belegte Stufe gilt, höhere als Vorbehalt', () => {
  // 3 Angebote (belegt: selten), Preis 120 € nur durch ein Angebot (unbelegt: Rarität)
  const r = bewerteSeltenheit({ anzahl: 3, preis: 110, vergleich: 120, merkmale: [], angebote: [{ gesamt: 120 }, { gesamt: 300 }, { gesamt: 400 }], ueberIsbn: true });
  assert.deepEqual([r.stufe, r.effekt], ['selten', 'voll']);
  assert.ok(r.vorbehalte[0].startsWith('Evtl. sogar Rarität'));
});

test('Von Hand gesetzte Merkmale gelten als belegt; Interesse hebt eine Stufe', () => {
  const sig = bewerteSeltenheit({ anzahl: 40, preis: 60, vergleich: 15, merkmale: ['signiert'], angebote: viele(40, 15), ueberIsbn: true });
  assert.deepEqual([sig.stufe, sig.effekt], ['selten', 'voll']);
  const hoch = bewerteSeltenheit({ anzahl: 8, preis: 8, vergleich: 8, merkmale: [], angebote: viele(8, 8), ueberIsbn: true, interesseHoch: true });
  assert.deepEqual([hoch.stufe, hoch.effekt], ['selten', 'voll']);
  assert.equal(STANDARD_SELTENHEIT.seltenBisAngebote, 3);
});

test('Neuerscheinungen sind nicht selten: wenige Angebote heißen nur „noch neu“', () => {
  const jetzt = new Date('2026-11-07');
  const neu = bewerteSeltenheit({ anzahl: 2, preis: 18, vergleich: 18, jahr: '2024', merkmale: [], angebote: viele(2, 18), ueberIsbn: true, jetzt });
  assert.equal(neu.stufe, 'gewoehnlich');
  // Teures neues Buch zum Neupreis → nicht selten …
  const teuer = bewerteSeltenheit({ anzahl: 30, preis: 58, vergleich: 60, jahr: '2025', neupreis: 60, merkmale: [], angebote: viele(30, 60), ueberIsbn: true, jetzt });
  assert.equal(teuer.stufe, 'gewoehnlich');
  // … außer es wird deutlich über dem Neupreis gehandelt (vergriffen)
  const vergriffen = bewerteSeltenheit({ anzahl: 30, preis: 90, vergleich: 95, jahr: '2025', neupreis: 40, merkmale: [], angebote: viele(30, 95), ueberIsbn: true, jetzt });
  assert.equal(vergriffen.stufe, 'selten');
  // Ältere Bücher mit wenigen Angeboten bleiben selten
  assert.equal(bewerteSeltenheit({ anzahl: 2, preis: 18, vergleich: 18, jahr: '2015', merkmale: [], angebote: viele(2, 18), ueberIsbn: true, jetzt }).stufe, 'selten');
});

test('Noch neu lieferbar (Neubuch-Angebot) → nicht selten, keine Knappheit', () => {
  const angebote = [{ gesamt: 12, neu: true }, { gesamt: 14 }];
  assert.equal(bewerteSeltenheit({ anzahl: 2, preis: 12, vergleich: 12, jahr: '2009', merkmale: [], angebote, ueberIsbn: true }).stufe, 'gewoehnlich');
  const r = berechnePreis({
    angebote: [{ ...ang('Thalia', 9), neu: true }, ang('ZVAB', 11)],
    zustand: 'sehr_gut',
    merkmale: [],
  })!;
  assert.ok(schrittText(r).includes('Noch neu lieferbar → Knappheit nicht gewertet'), schrittText(r));
});

test('Knappheit nicht bei Neuerscheinung', () => {
  const r = berechnePreis({ vergleichspreis: 10, anzahlAngebote: 2, zustand: 'sehr_gut', merkmale: [], jahr: '2025', jetzt: new Date('2026-11-07') })!;
  assert.ok(schrittText(r).includes('Neuerscheinung 2025'));
  assert.equal(r.rohwert, 10); // kein Unterbieten (2 Vergleiche), kein Zuschlag
});

test('eurobuch: neubuch="1" wird als Neubuch-Angebot erkannt', () => {
  const a = parseEurobuch('<Book id="1" title="x" price="9" currency="EUR" priceeur="9" platform="Thalia.de" neubuch="1" versandkosten_eur="0.00" />', 3);
  assert.equal(a[0].neu, true);
});

test('Stapelwert: Gesamt, Laden (Grabbel + Regal) und Lager getrennt', () => {
  const w = stapelWert([
    { kategorie: 'grabbel', endpreis: 1 },
    { kategorie: 'grabbel', endpreis: 2 },
    { kategorie: 'regal', endpreis: 9.5 },
    { kategorie: 'lager', endpreis: 40 },
    { kategorie: null, endpreis: 4 }, // alter Eintrag ohne Kategorie → Regal
  ]);
  assert.deepEqual([w.gesamt, w.laden, w.lager], [56.5, 16.5, 40]);
  assert.deepEqual([w.je.grabbel.anzahl, w.je.regal.anzahl, w.je.lager.anzahl], [2, 2, 1]);
});

test('Stapel-Liste: nach Kategorie gruppiert (Grabbel, Regal, Lager), sonst nach Preis oder Zeit', () => {
  const e = (id: number, kategorie: 'grabbel' | 'regal' | 'lager' | null, endpreis: number) => ({ id, kategorie, endpreis });
  const liste = [e(1, 'regal', 4.5), e(2, 'lager', 40), e(3, 'grabbel', 2), e(4, null, 3), e(5, 'grabbel', 1)];
  const g = stapelGruppen(liste);
  assert.deepEqual(g.map((x) => [x.kategorie, x.anzahl, x.summe]), [['grabbel', 2, 3], ['regal', 2, 7.5], ['lager', 1, 40]]);
  assert.deepEqual(g[0].data.map((x) => x.id), [5, 3]); // neueste zuerst
  assert.deepEqual(stapelGruppen(liste, 'preis')[0].data.map((x) => x.id), [2, 1, 4, 3, 5]);
  assert.deepEqual(stapelGruppen(liste, 'zeit')[0].data.map((x) => x.id), [5, 4, 3, 2, 1]);
  assert.deepEqual(stapelGruppen([], 'preis'), []);
});
