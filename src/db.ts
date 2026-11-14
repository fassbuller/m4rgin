// Lokale Datenbank auf dem Handy: Such-Log (für spätere Auswertung), Stapel, Einstellungen.
// Jede Suche wird protokolliert – auch ohne Treffer und auch, wenn nicht ausgepreist wird.

import * as SQLite from 'expo-sqlite';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Titel } from './lib/titel';
import { Kategorie, Merkmal, Zustand } from './lib/preis';
import { zuCsv } from './lib/csv';
import { Angebot, MarktErgebnis } from './lib/markt';
import { Snapshot } from './lib/trend';
import type { Standort } from './lib/ladenplan';
import { Korrektur } from './lib/korrektur';
import { Einstellungen, mitStandards } from './einstellungen';
import { geheimnisseSpeichern, mitGeheimnissen, ohneGeheimnisse } from './geheim';

/**
 * eBay-Verkäufernamen sind Nutzerdaten von eBay. m4rgin ist von der „Marketplace Account Deletion“-Pflicht
 * ausgenommen, weil es keine eBay-Nutzerdaten speichert – deshalb landen sie nie in der Datenbank.
 */
export function speicherbarerHaendler(a?: { plattform?: string; quelle?: string; haendler?: string } | null): string | undefined {
  if (!a) return undefined;
  if (a.quelle === 'ebay' || a.plattform === 'eBay') return undefined;
  return a.haendler;
}

export type Methode = 'barcode' | 'isbn_getippt' | 'foto_ocr' | 'foto_isbn' | 'foto_ki' | 'manuell';
export type Aktion = 'gesucht' | 'ausgepreist' | 'verworfen';

export interface LogEintrag {
  id: number;
  zeit: string;
  methode: Methode;
  suchbegriff: string;
  treffer_anzahl: number;
  quelle: string | null;
  isbn: string | null;
  titel: string | null;
  autor: string | null;
  verlag: string | null;
  jahr: string | null;
  neupreis: number | null;
  vergleichspreis: number | null;
  anzahl_angebote: number | null;
  zustand: Zustand | null;
  merkmale: string | null;
  vorschlag: number | null;
  endpreis: number | null;
  kategorie: Kategorie | null;
  aktion: Aktion;
  /** 1 = liegt in einem Stapel (für CSV/Abwärtskompatibilität) */
  stapel: number;
  /** Zugehöriger Stapel */
  stapel_id: number | null;
  /** Name des Stapels (nur bei Abfragen mit JOIN) */
  stapel_name?: string | null;
  dauer_ms: number | null;
  sachgruppen: string | null;
  markt_anzahl: number | null;
  /** Ladenplan: Raum-ID (z. B. „wintergarten“) und Abteilung (z. B. „Lyrik“) – nur wenn nicht geraten */
  standort_raum?: string | null;
  standort_abteilung?: string | null;
  markt_min: number | null;
  markt_median: number | null;
  anker_plattform: string | null;
  anker_haendler: string | null;
  anker_url: string | null;
  markt_json: string | null;
  trend: string | null;
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function db(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = init().catch((e) => {
      // Ein fehlgeschlagenes Öffnen nicht merken – sonst scheitert jede spätere Abfrage bis zum Neustart
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

async function init() {
  // Dateiname bleibt aus der Zeit als „Bleistift“ – umbenennen würde vorhandene Stapel und Verläufe verlieren
  const d = await SQLite.openDatabaseAsync('bleistift.db');
  await d.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      zeit TEXT NOT NULL,
      methode TEXT NOT NULL,
      suchbegriff TEXT NOT NULL,
      treffer_anzahl INTEGER NOT NULL DEFAULT 0,
      quelle TEXT, isbn TEXT, titel TEXT, autor TEXT, verlag TEXT, jahr TEXT, neupreis REAL,
      vergleichspreis REAL, anzahl_angebote INTEGER, zustand TEXT, merkmale TEXT,
      vorschlag REAL, endpreis REAL, kategorie TEXT,
      aktion TEXT NOT NULL DEFAULT 'gesucht',
      stapel INTEGER NOT NULL DEFAULT 0,
      dauer_ms INTEGER,
      sachgruppen TEXT,
      markt_anzahl INTEGER, markt_min REAL, markt_median REAL,
      anker_plattform TEXT, anker_haendler TEXT, anker_url TEXT,
      markt_json TEXT,
      trend TEXT
    );
    CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
    -- Ein Stapel ist ein benannter Arbeitsvorrat; genau einer ist aktiv,
    -- die übrigen bleiben pausiert und lassen sich später weiterführen.
    CREATE TABLE IF NOT EXISTS stapel (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      aktiv INTEGER NOT NULL DEFAULT 0,
      angelegt TEXT NOT NULL,
      geaendert TEXT NOT NULL
    );
    -- Marktlage je Titel über die Zeit (Grundlage für das Angebots-Signal).
    -- Nur Kennzahlen, keine einzelnen Angebote (eurobuch erlaubt keine Langzeit-Speicherung von Treffern).
    CREATE TABLE IF NOT EXISTS markt_verlauf (
      schluessel TEXT NOT NULL,
      zeit TEXT NOT NULL,
      anzahl INTEGER NOT NULL,
      min REAL,
      median REAL
    );
    CREATE INDEX IF NOT EXISTS markt_verlauf_schluessel ON markt_verlauf (schluessel, zeit);
    -- Abweichungen vom Vorschlag (Preis von Hand, anderer Vergleich, aussortierte Angebote)
    CREATE TABLE IF NOT EXISTS korrektur (
      zeit TEXT NOT NULL,
      log_id INTEGER,
      isbn TEXT, titel TEXT,
      vorschlag REAL NOT NULL,
      endpreis REAL NOT NULL,
      zweig TEXT, kategorie TEXT, zustand TEXT,
      anzahl INTEGER,
      ampel TEXT,
      vergleich_von_hand INTEGER NOT NULL DEFAULT 0,
      aussortiert_von_hand INTEGER NOT NULL DEFAULT 0,
      art TEXT NOT NULL
    );
  `);
  await migriereStapel(d);
  return d;
}

/** Alte Datenbank: `stapel` war nur 0/1 → Spalte `stapel_id` ergänzen und Altbestand übernehmen. */
async function migriereStapel(d: SQLite.SQLiteDatabase) {
  const spalten = await d.getAllAsync<{ name: string }>('PRAGMA table_info(log)');
  if (!spalten.some((s) => s.name === 'stapel_id')) {
    await d.execAsync('ALTER TABLE log ADD COLUMN stapel_id INTEGER');
  }
  // Ladenplan (Raum + Abteilung)
  if (!spalten.some((s) => s.name === 'standort_raum')) {
    await d.execAsync('ALTER TABLE log ADD COLUMN standort_raum TEXT; ALTER TABLE log ADD COLUMN standort_abteilung TEXT;');
  }
  const vorhanden = await d.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM stapel');
  if ((vorhanden?.n ?? 0) > 0) return;
  const alt = await d.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM log WHERE stapel = 1');
  if (!alt?.n) return; // frischer Start: der erste Stapel entsteht beim Auspreisen
  const jetzt = new Date().toISOString();
  const r = await d.runAsync(
    'INSERT INTO stapel (name, aktiv, angelegt, geaendert) VALUES (?, 1, ?, ?)',
    'Stapel 1',
    jetzt,
    jetzt,
  );
  await d.runAsync('UPDATE log SET stapel_id = ? WHERE stapel = 1 AND stapel_id IS NULL', r.lastInsertRowId);
}

// ---------- Log ----------

export async function logSuche(methode: Methode, suchbegriff: string, trefferAnzahl: number): Promise<number> {
  const d = await db();
  const r = await d.runAsync(
    'INSERT INTO log (zeit, methode, suchbegriff, treffer_anzahl) VALUES (?, ?, ?, ?)',
    new Date().toISOString(),
    methode,
    suchbegriff,
    trefferAnzahl,
  );
  return r.lastInsertRowId;
}

export async function logAuspreisen(
  id: number,
  t: Titel,
  p: {
    vergleichspreis: number | null;
    anzahlAngebote: number | null;
    zustand: Zustand;
    merkmale: Merkmal[];
    vorschlag: number;
    endpreis: number;
    kategorie: Kategorie;
    dauerMs: number;
    markt: MarktErgebnis | null;
    anker: Angebot | null;
    trend: string | null;
    standort?: Standort | null;
  },
) {
  const d = await db();
  // Ohne aktiven Stapel (alle pausiert oder abgeschlossen) beginnt hier ein neuer.
  const stapel = await aktiverStapelOderNeu();
  // Für die Nachvollziehbarkeit: die 5 günstigsten Angebote zum Zeitpunkt des Auspreisens
  const top = p.markt?.angebote.slice(0, 5).map((a) => ({
    p: a.plattform, h: speicherbarerHaendler(a), g: a.gesamt, v: a.versandGeschaetzt ? 'geschätzt' : a.versand, z: a.zustandText?.slice(0, 120), u: a.url,
  }));
  await d.runAsync(
    `UPDATE log SET quelle=?, isbn=?, titel=?, autor=?, verlag=?, jahr=?, neupreis=?,
       vergleichspreis=?, anzahl_angebote=?, zustand=?, merkmale=?, vorschlag=?, endpreis=?,
       kategorie=?, aktion='ausgepreist', stapel=1, stapel_id=?, dauer_ms=?, sachgruppen=?,
       markt_anzahl=?, markt_min=?, markt_median=?, anker_plattform=?, anker_haendler=?, anker_url=?,
       markt_json=?, trend=? WHERE id=?`,
    t.quelle,
    t.isbn ?? null,
    t.titel,
    t.autoren.join('; ') || null,
    t.verlag ?? null,
    t.jahr ?? null,
    t.neupreis ?? null,
    p.vergleichspreis,
    p.anzahlAngebote,
    p.zustand,
    p.merkmale.join(',') || null,
    p.vorschlag,
    p.endpreis,
    p.kategorie,
    stapel.id,
    p.dauerMs,
    t.sachgruppen?.join('; ') || null,
    p.markt?.lage.anzahl ?? null,
    p.markt?.lage.min ?? null,
    p.markt?.lage.median ?? null,
    p.anker?.plattform ?? null,
    speicherbarerHaendler(p.anker) ?? null,
    p.anker?.url ?? null,
    top ? JSON.stringify(top) : null,
    p.trend,
    id,
  );
  // Ladenplan: wo das Buch vermutlich hingehört (nur wenn sicher genug, „geraten“ bleibt leer)
  if (p.standort && !p.standort.geraten) {
    await d.runAsync(
      'UPDATE log SET standort_raum=?, standort_abteilung=? WHERE id=?',
      p.standort.vorschlag.raum,
      p.standort.vorschlag.name,
      id,
    );
  }
}

// ---------- Marktverlauf ----------

export async function verlaufSpeichern(schluessel: string, m: MarktErgebnis) {
  const d = await db();
  await d.runAsync(
    'INSERT INTO markt_verlauf (schluessel, zeit, anzahl, min, median) VALUES (?, ?, ?, ?, ?)',
    schluessel,
    m.zeit,
    m.lage.anzahl,
    m.lage.min,
    m.lage.median,
  );
}

export async function verlaufLaden(schluessel: string): Promise<Snapshot[]> {
  const d = await db();
  return d.getAllAsync<Snapshot>(
    'SELECT zeit, anzahl, min FROM markt_verlauf WHERE schluessel=? ORDER BY zeit',
    schluessel,
  );
}

/** Titel gewählt, aber nicht ausgepreist (Sheet geschlossen) */
export async function logVerworfen(id: number, t?: Titel) {
  const d = await db();
  await d.runAsync(
    `UPDATE log SET aktion='verworfen', quelle=COALESCE(?, quelle), isbn=COALESCE(?, isbn),
       titel=COALESCE(?, titel), autor=COALESCE(?, autor) WHERE id=? AND aktion='gesucht'`,
    t?.quelle ?? null,
    t?.isbn ?? null,
    t?.titel ?? null,
    t?.autoren.join('; ') || null,
    id,
  );
}

export async function logLaden(limit = 200): Promise<LogEintrag[]> {
  const d = await db();
  return d.getAllAsync<LogEintrag>('SELECT * FROM log ORDER BY id DESC LIMIT ?', limit);
}

export interface Statistik {
  suchen: number;
  mitTreffer: number;
  ausgepreist: number;
  summe: number;
  proMethode: { methode: string; n: number }[];
  proKategorie: { kategorie: string; n: number }[];
}

export async function statistik(): Promise<Statistik> {
  const d = await db();
  const a = await d.getFirstAsync<{ suchen: number; mitTreffer: number; ausgepreist: number; summe: number }>(
    `SELECT COUNT(*) AS suchen,
            SUM(CASE WHEN treffer_anzahl > 0 THEN 1 ELSE 0 END) AS mitTreffer,
            SUM(CASE WHEN aktion='ausgepreist' THEN 1 ELSE 0 END) AS ausgepreist,
            COALESCE(SUM(CASE WHEN aktion='ausgepreist' THEN endpreis END), 0) AS summe
     FROM log`,
  );
  const proMethode = await d.getAllAsync<{ methode: string; n: number }>(
    'SELECT methode, COUNT(*) AS n FROM log GROUP BY methode ORDER BY n DESC',
  );
  const proKategorie = await d.getAllAsync<{ kategorie: string; n: number }>(
    "SELECT kategorie, COUNT(*) AS n FROM log WHERE aktion='ausgepreist' GROUP BY kategorie ORDER BY n DESC",
  );
  return {
    suchen: a?.suchen ?? 0,
    mitTreffer: a?.mitTreffer ?? 0,
    ausgepreist: a?.ausgepreist ?? 0,
    summe: a?.summe ?? 0,
    proMethode,
    proKategorie,
  };
}

// ---------- Stapel: benannte Arbeitsvorräte, einer aktiv, andere pausiert ----------

export interface Stapel {
  id: number;
  name: string;
  /** 1 = gerade in Benutzung, 0 = pausiert */
  aktiv: number;
  angelegt: string;
  geaendert: string;
  /** Bücher im Stapel */
  anzahl: number;
  /** Verkaufssumme ohne Lager-Bücher */
  summe: number;
}

const STAPEL_SPALTEN = `
  s.id, s.name, s.aktiv, s.angelegt, s.geaendert,
  COUNT(l.id) AS anzahl,
  COALESCE(SUM(CASE WHEN l.kategorie <> 'lager' THEN l.endpreis ELSE 0 END), 0) AS summe`;

export async function stapelListe(): Promise<Stapel[]> {
  const d = await db();
  return d.getAllAsync<Stapel>(
    `SELECT ${STAPEL_SPALTEN}
       FROM stapel s LEFT JOIN log l ON l.stapel_id = s.id
      GROUP BY s.id
      ORDER BY s.aktiv DESC, s.geaendert DESC`,
  );
}

export async function aktiverStapel(): Promise<Stapel | null> {
  const d = await db();
  return (
    (await d.getFirstAsync<Stapel>(
      `SELECT ${STAPEL_SPALTEN}
         FROM stapel s LEFT JOIN log l ON l.stapel_id = s.id
        WHERE s.aktiv = 1
        GROUP BY s.id
        LIMIT 1`,
    )) ?? null
  );
}

/** Legt einen Stapel an und macht ihn – wenn gewünscht – zum aktiven (die anderen pausieren). */
export async function stapelAnlegen(name?: string, aktiv = true): Promise<Stapel> {
  const d = await db();
  const jetzt = new Date().toISOString();
  const vorhanden = new Set(
    (await d.getAllAsync<{ name: string }>('SELECT name FROM stapel')).map((r) => r.name),
  );
  // kleinste freie Nummer, damit „Stapel 2“ nach dem Abschließen nicht doppelt entsteht
  let nummer = 1;
  while (vorhanden.has(`Stapel ${nummer}`)) nummer++;
  const standard = `Stapel ${nummer}`;
  if (aktiv) await d.runAsync('UPDATE stapel SET aktiv = 0');
  const r = await d.runAsync(
    'INSERT INTO stapel (name, aktiv, angelegt, geaendert) VALUES (?, ?, ?, ?)',
    (name ?? '').trim() || standard,
    aktiv ? 1 : 0,
    jetzt,
    jetzt,
  );
  return {
    id: r.lastInsertRowId,
    name: (name ?? '').trim() || standard,
    aktiv: aktiv ? 1 : 0,
    angelegt: jetzt,
    geaendert: jetzt,
    anzahl: 0,
    summe: 0,
  };
}

/** Aktiven Stapel holen; gibt es keinen (alle pausiert/abgeschlossen), wird einer angelegt. */
export async function aktiverStapelOderNeu(): Promise<Stapel> {
  return (await aktiverStapel()) ?? stapelAnlegen();
}

/** Pausierten Stapel weiterführen – der bisher aktive wird dabei pausiert. */
export async function stapelAktivieren(id: number): Promise<void> {
  const d = await db();
  const jetzt = new Date().toISOString();
  await d.runAsync('UPDATE stapel SET aktiv = 0, geaendert = ? WHERE aktiv = 1 AND id <> ?', jetzt, id);
  await d.runAsync('UPDATE stapel SET aktiv = 1, geaendert = ? WHERE id = ?', jetzt, id);
}

export async function stapelPausieren(id: number): Promise<void> {
  const d = await db();
  await d.runAsync('UPDATE stapel SET aktiv = 0, geaendert = ? WHERE id = ?', new Date().toISOString(), id);
}

export async function stapelUmbenennen(id: number, name: string): Promise<void> {
  const sauber = name.trim();
  if (!sauber) return;
  const d = await db();
  await d.runAsync('UPDATE stapel SET name = ?, geaendert = ? WHERE id = ?', sauber, new Date().toISOString(), id);
}

/** Einträge eines Stapels; ohne id die des aktiven Stapels. */
export async function stapelLaden(stapelId?: number | null): Promise<LogEintrag[]> {
  const d = await db();
  const id = stapelId ?? (await aktiverStapel())?.id ?? null;
  if (id == null) return [];
  return d.getAllAsync<LogEintrag>(
    `SELECT l.*, s.name AS stapel_name
       FROM log l JOIN stapel s ON s.id = l.stapel_id
      WHERE l.stapel_id = ?
      ORDER BY l.id DESC`,
    id,
  );
}

/** Alles, was der Stapel-Reiter braucht. */
export async function stapelUebersicht(): Promise<{ aktiv: Stapel | null; eintraege: LogEintrag[]; alle: Stapel[] }> {
  const alle = await stapelListe();
  const aktiv = alle.find((s) => s.aktiv === 1) ?? null;
  const eintraege = aktiv ? await stapelLaden(aktiv.id) : [];
  return { aktiv, eintraege, alle };
}

export async function ausStapelEntfernen(id: number) {
  const d = await db();
  await d.runAsync('UPDATE log SET stapel = 0, stapel_id = NULL WHERE id = ?', id);
}

/** Stapel abschließen: Bücher verlassen den Stapel, bleiben aber im Log. */
export async function stapelAbschliessen(id: number) {
  const d = await db();
  await d.runAsync('UPDATE log SET stapel = 0, stapel_id = NULL WHERE stapel_id = ?', id);
  await d.runAsync('DELETE FROM stapel WHERE id = ?', id);
}

/**
 * Einmalig: Stapel-Bücher, die früher von Hand auf 1 €/2 € gesetzt wurden, aber noch unter Regal/Lager stehen,
 * in die Bücherbox verschieben (seit der Kategorie dem Endpreis folgt). Läuft nur einmal (Merker).
 */
export async function altbestandInBuecherbox(regalAb: number): Promise<number> {
  if (await merkerLaden('buecherbox-umzug')) return 0;
  const d = await db();
  const r = await d.runAsync(
    "UPDATE log SET kategorie='grabbel' WHERE stapel_id IS NOT NULL AND endpreis IS NOT NULL AND endpreis < ? AND kategorie IS NOT 'grabbel'",
    regalAb - 0.001,
  );
  await merkerSpeichern('buecherbox-umzug', '1');
  return r.changes;
}

export async function endpreisAendern(id: number, endpreis: number, kategorie?: Kategorie) {
  const d = await db();
  if (kategorie) await d.runAsync('UPDATE log SET endpreis=?, kategorie=? WHERE id=?', endpreis, kategorie, id);
  else await d.runAsync('UPDATE log SET endpreis=? WHERE id=?', endpreis, id);
  // Auch spätere Änderungen im Stapel gehören ins Korrektur-Protokoll
  const e = await d.getFirstAsync<LogEintrag>('SELECT * FROM log WHERE id = ?', id);
  if (e?.vorschlag != null && Math.abs(e.vorschlag - endpreis) >= 0.005) {
    await korrekturSpeichern({
      log_id: id, isbn: e.isbn, titel: e.titel, vorschlag: e.vorschlag, endpreis,
      zweig: e.kategorie === 'lager' ? 'lager' : 'laden', kategorie: e.kategorie, zustand: e.zustand,
      anzahl: e.markt_anzahl, ampel: null, vergleich_von_hand: 0, aussortiert_von_hand: 0, art: 'nachtraeglich',
    }).catch(() => undefined);
  }
}

export interface EintragAenderung {
  zustand: Zustand;
  merkmale: Merkmal[];
  vorschlag: number;
  endpreis: number;
  kategorie: Kategorie;
  vergleichspreis: number | null;
  /** von Hand gesetzter/korrigierter Neupreis */
  neupreis?: number | null;
  /** Frisch abgefragte Marktdaten, falls vorhanden */
  markt?: MarktErgebnis | null;
  anker?: Angebot | null;
  /** Von Hand gewähltes gespeichertes Angebot (ohne frische Marktdaten) */
  ankerGewaehlt?: { plattform: string; haendler?: string; url?: string };
}

/** Eintrag im Stapel nachträglich ändern (Zustand, Merkmale, Preis, ggf. frische Marktdaten). */
export async function eintragAktualisieren(id: number, a: EintragAenderung) {
  const d = await db();
  if (a.markt) {
    const top = a.markt.angebote.slice(0, 5).map((x) => ({
      p: x.plattform, h: speicherbarerHaendler(x), g: x.gesamt, v: x.versandGeschaetzt ? 'geschätzt' : x.versand, z: x.zustandText?.slice(0, 120), u: x.url,
    }));
    await d.runAsync(
      `UPDATE log SET zustand=?, merkmale=?, vorschlag=?, endpreis=?, kategorie=?, vergleichspreis=?, neupreis=?,
         markt_anzahl=?, markt_min=?, markt_median=?, anker_plattform=?, anker_haendler=?, anker_url=?,
         markt_json=? WHERE id=?`,
      a.zustand,
      a.merkmale.join(',') || null,
      a.vorschlag,
      a.endpreis,
      a.kategorie,
      a.vergleichspreis,
      a.neupreis ?? null,
      a.markt.lage.anzahl,
      a.markt.lage.min,
      a.markt.lage.median,
      a.anker?.plattform ?? null,
      speicherbarerHaendler(a.anker) ?? null,
      a.anker?.url ?? null,
      top.length ? JSON.stringify(top) : null,
      id,
    );
    return;
  }
  if (a.ankerGewaehlt) {
    await d.runAsync(
      'UPDATE log SET anker_plattform=?, anker_haendler=?, anker_url=? WHERE id=?',
      a.ankerGewaehlt.plattform,
      speicherbarerHaendler(a.ankerGewaehlt) ?? null,
      a.ankerGewaehlt.url ?? null,
      id,
    );
  }
  await d.runAsync(
    'UPDATE log SET zustand=?, merkmale=?, vorschlag=?, endpreis=?, kategorie=?, vergleichspreis=?, neupreis=? WHERE id=?',
    a.zustand,
    a.merkmale.join(',') || null,
    a.vorschlag,
    a.endpreis,
    a.kategorie,
    a.vergleichspreis,
    a.neupreis ?? null,
    id,
  );
}

// ---------- Export ----------

const KOPF: (keyof LogEintrag)[] = [
  'id', 'zeit', 'methode', 'suchbegriff', 'treffer_anzahl', 'quelle', 'isbn', 'titel', 'autor',
  'verlag', 'jahr', 'neupreis', 'vergleichspreis', 'anzahl_angebote', 'zustand', 'merkmale',
  'vorschlag', 'endpreis', 'kategorie', 'aktion', 'stapel_name', 'dauer_ms', 'sachgruppen', 'markt_anzahl',
  'markt_min', 'markt_median', 'anker_plattform', 'anker_haendler', 'anker_url', 'trend', 'markt_json',
  'standort_raum', 'standort_abteilung',
];

export async function exportCsv(nurStapel = false) {
  const d = await db();
  const aktiv = nurStapel ? await aktiverStapel() : null;
  const zeilen = await d.getAllAsync<LogEintrag>(
    `SELECT l.*, s.name AS stapel_name
       FROM log l LEFT JOIN stapel s ON s.id = l.stapel_id
      ${nurStapel ? 'WHERE l.stapel_id = ?' : ''}
      ORDER BY l.id`,
    ...(nurStapel ? [aktiv?.id ?? -1] : []),
  );
  const csv = zuCsv(KOPF, zeilen.map((z) => KOPF.map((k) => z[k] as string | number | null)));
  const datum = new Date().toISOString().slice(0, 10);
  const teil = nurStapel ? aktiv?.name ?? 'stapel' : 'log';
  const sauber = teil.toLowerCase().replace(/[^a-z0-9äöüß]+/gi, '-').replace(/^-+|-+$/g, '') || 'stapel';
  const name = `m4rgin-${sauber}-${datum}.csv`;
  const datei = new File(Paths.cache, name);
  if (datei.exists) datei.delete();
  datei.create();
  datei.write(csv);
  await Sharing.shareAsync(datei.uri, { mimeType: 'text/csv', dialogTitle: name });
}

// ---------- Einstellungen ----------

export async function einstellungenLaden(): Promise<Einstellungen> {
  const d = await db();
  const r = await d.getFirstAsync<{ v: string }>("SELECT v FROM kv WHERE k='einstellungen'");
  let gespeichert: Partial<Einstellungen> | null = null;
  try {
    gespeichert = r ? JSON.parse(r.v) : null;
  } catch {
    // Kaputter Eintrag (z. B. abgebrochenes Schreiben) → Standardwerte statt Absturz
    gespeichert = null;
  }
  const e = await mitGeheimnissen(mitStandards(gespeichert));
  // Ältere Stände hatten Passwörter im JSON → einmalig in den sicheren Speicher umziehen
  const alt = mitStandards(gespeichert);
  if (alt.eurobuch.passwort || alt.ebay.clientSecret || alt.ki.apiKey || alt.googleBooksKey) {
    await einstellungenSpeichern(e).catch(() => undefined);
  }
  return e;
}

export async function einstellungenSpeichern(e: Einstellungen) {
  const d = await db();
  // Geheimnisse in den sicheren Speicher, der Rest (ohne sie) nach SQLite
  await geheimnisseSpeichern(e);
  await d.runAsync(
    "INSERT INTO kv (k, v) VALUES ('einstellungen', ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v",
    JSON.stringify(ohneGeheimnisse(e)),
  );
}

// ---------- Kleine Merker (Onboarding gesehen, Sortierung …) ----------

export async function merkerLaden(k: string): Promise<string | null> {
  const d = await db();
  const r = await d.getFirstAsync<{ v: string }>('SELECT v FROM kv WHERE k = ?', `merker.${k}`);
  return r?.v ?? null;
}

export async function merkerSpeichern(k: string, v: string) {
  const d = await db();
  await d.runAsync('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v', `merker.${k}`, v);
}

// ---------- Ignorierte Händler („passt nie“) ----------

export async function ignorierteHaendlerLaden(): Promise<string[]> {
  try {
    const x = JSON.parse((await merkerLaden('ignorierteHaendler')) ?? '[]');
    return Array.isArray(x) ? x.filter((h): h is string => typeof h === 'string') : [];
  } catch {
    return [];
  }
}

export async function ignorierteHaendlerSpeichern(liste: string[]) {
  const sauber = [...new Set(liste.map((h) => h.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
  await merkerSpeichern('ignorierteHaendler', JSON.stringify(sauber));
}

// ---------- Korrektur-Protokoll ----------
// Jede Abweichung vom Vorschlag (Preis von Hand, anderes Vergleichsangebot, Angebot aussortiert)
// wird mit Zusammenhang gespeichert. Nach ein paar Wochen sieht man, welche Regel systematisch danebenliegt.

export async function korrekturSpeichern(k: Omit<Korrektur, 'zeit'>) {
  const d = await db();
  await d.runAsync(
    `INSERT INTO korrektur (zeit, log_id, isbn, titel, vorschlag, endpreis, zweig, kategorie, zustand, anzahl, ampel,
       vergleich_von_hand, aussortiert_von_hand, art) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    new Date().toISOString(),
    k.log_id,
    k.isbn,
    k.titel,
    k.vorschlag,
    k.endpreis,
    k.zweig,
    k.kategorie,
    k.zustand,
    k.anzahl,
    k.ampel,
    k.vergleich_von_hand,
    k.aussortiert_von_hand,
    k.art,
  );
}

export async function korrekturenLaden(limit = 2000): Promise<Korrektur[]> {
  const d = await db();
  return d.getAllAsync<Korrektur>('SELECT * FROM korrektur ORDER BY zeit DESC LIMIT ?', limit);
}

export async function korrekturenLoeschen() {
  const d = await db();
  await d.runAsync('DELETE FROM korrektur');
}
