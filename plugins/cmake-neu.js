// Neueres CMake für den C++-Teil der App (Codegen von RN 0.88).
// Grund: Unter Windows werden die Objektdatei-Pfade länger als 260 Zeichen; das ninja aus CMake 3.22
// kann keine langen Pfade, das aus CMake 3.31 schon (Windows-Einstellung LongPathsEnabled muss an sein).
// Gradle lädt die angegebene CMake-Version beim ersten Build selbst ins Android-SDK.
const { withAppBuildGradle } = require('expo/config-plugins');

const VERSION = '3.31.6';
const MARKE = '// m4rgin: cmake-neu';

module.exports = function cmakeNeu(config) {
  // Nur unter Windows nötig (Pfadlänge). Auf Linux/macOS – z. B. den EAS-Build-Servern, die nur CMake 3.22.1
  // haben – nichts ändern, sonst: „CMake '3.31.6' was not found in SDK“ (EAS-Build f2b0e44a, 15.11.2026).
  if (process.platform !== 'win32') return config;
  return withAppBuildGradle(config, (c) => {
    if (!c.modResults.contents.includes(MARKE)) {
      c.modResults.contents += `\n${MARKE}\nandroid { externalNativeBuild { cmake { version "${VERSION}" } } }\n`;
    }
    return c;
  });
};
