// Erzeugt App-Icon, adaptives Android-Icon und Splash aus einer SVG-Vorlage.
// Aufruf: node assets/icon-quelle.js <pfad-zu-sharp>   (sharp ist keine Projekt-Abhängigkeit)
// Motiv „Preisschild“ im Fountain-Stil: Papier, weißes Schild mit Tintenrahmen und hartem Schatten, € in Tinte.
const path = require('path');
const sharp = require(process.argv[2] || 'sharp');

const OUT = __dirname;
const PAPIER = '#fbf6ee';
const TINTE = '#1d1d1b';

// Schild mit abgeschnittener Ecke oben rechts (wie ein Preisetikett), Loch für die Schnur
const UMRISS = 'M250 200 H640 L810 370 V820 H250 Z';

function schild() {
  return `
  <path d="${UMRISS}" fill="${TINTE}" transform="translate(52 52)"/>
  <path d="${UMRISS}" fill="#ffffff" stroke="${TINTE}" stroke-width="40" stroke-linejoin="miter"/>
  <circle cx="660" cy="360" r="40" fill="${TINTE}"/>
  <!-- € als Linien statt Text: librsvg kennt die Hausschrift nicht -->
  <path d="M592 455 A160 160 0 1 0 592 705" fill="none" stroke="${TINTE}" stroke-width="64" stroke-linecap="butt"/>
  <path d="M300 545 H545 M300 615 H525" stroke="${TINTE}" stroke-width="46"/>`;
}

const svg = (inhalt, { flaeche = true, skala = 1 } = {}) => `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  ${flaeche ? `<rect width="1024" height="1024" fill="${PAPIER}"/>` : ''}
  <g transform="translate(512 512) scale(${skala}) translate(-512 -512) translate(-14 -14)">${inhalt}</g>
</svg>`;

async function png(datei, s) {
  await sharp(Buffer.from(s)).png().toFile(path.join(OUT, datei));
  console.log('✓', datei);
}

(async () => {
  await png('icon.png', svg(schild(), { skala: 0.92 }));
  // Adaptiv: Motiv in die sichere Zone (≈ 66 %), Hintergrund separat
  await png('adaptive-icon.png', svg(schild(), { flaeche: false, skala: 0.6 }));
  await png('adaptive-hintergrund.png', svg('', {}));
  // Splash: Schild auf Papier (Splash-Hintergrund ist ebenfalls Papier)
  await png('splash-icon.png', svg(schild(), { flaeche: false, skala: 0.92 }));
})();
