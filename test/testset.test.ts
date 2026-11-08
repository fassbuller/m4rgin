// Testset: Jeder Fall muss im erwarteten Preisbereich landen und darf kein „falsches“ Angebot als Vergleich nehmen.
// Neue Fälle: in der App „Als Testfall teilen“ → als .json in test/testset/ ablegen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testfaelleLaden } from '../scripts/testset';
import { bewerteTestfall } from '../src/lib/testfall';

for (const tf of testfaelleLaden()) {
  test(`Testset: ${tf.name}`, () => {
    const r = bewerteTestfall(tf);
    assert.ok(!r.falscherVergleich, `falsches Vergleichsangebot: ${r.vergleich}`);
    assert.ok(r.imZiel, `Vorschlag ${r.vorschlag} € außerhalb ${tf.erwartet.min}–${tf.erwartet.max} €`);
  });
}
