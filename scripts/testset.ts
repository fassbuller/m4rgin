// Testset-Bericht: Wie schlägt sich die Preisermittlung auf allen Testfällen – alt (ohne Prüfung) gegen neu?
// Aufruf: npm run testset
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bewerteTestfall, Testfall } from '../src/lib/testfall';

export function testfaelleLaden(ordner = join(__dirname, '..', 'test', 'testset')): Testfall[] {
  return readdirSync(ordner)
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => {
      const x = JSON.parse(readFileSync(join(ordner, f), 'utf-8'));
      return Array.isArray(x) ? x : [x];
    });
}

if (require.main === module) {
  const faelle = testfaelleLaden();
  const euro = (n: number | null) => (n == null ? '–' : n.toFixed(2).replace('.', ',') + ' €');
  let altOk = 0;
  let neuOk = 0;
  for (const tf of faelle) {
    const alt = bewerteTestfall(tf, undefined, { ohnePruefung: true });
    const neu = bewerteTestfall(tf);
    if (alt.imZiel && !alt.falscherVergleich) altOk++;
    if (neu.imZiel && !neu.falscherVergleich) neuOk++;
    const z = (r: typeof alt) => `${euro(r.vorschlag)}${r.imZiel && !r.falscherVergleich ? ' ✓' : ' ✗'}`;
    console.log(`${tf.name}\n  erwartet ${euro(tf.erwartet.min)}–${euro(tf.erwartet.max)} · alt ${z(alt)} (${alt.vergleich}) · neu ${z(neu)} (${neu.vergleich})`);
  }
  console.log(`\n${faelle.length} Fälle · alt ${altOk} richtig · neu ${neuOk} richtig`);
}
