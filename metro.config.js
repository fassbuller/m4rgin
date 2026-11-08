// Metro soll keine Build-Artefakte beobachten: Gradle legt beim CMake-Build
// android/app/.cxx/... an und löscht Temp-Ordner wieder. Lief der Watcher zu
// diesem Zeitpunkt, brach er mit ENOENT ab und Metro starb.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const vorher = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(vorher) ? vorher : vorher ? [vorher] : []),
  /[\\/]android[\\/]app[\\/]\.cxx[\\/].*/,
  /[\\/]android[\\/]app[\\/]build[\\/].*/,
  /[\\/]android[\\/]build[\\/].*/,
  /[\\/]android[\\/]\.gradle[\\/].*/,
  /[\\/]node_modules[\\/].*[\\/]android[\\/]\.cxx[\\/].*/,
  /[\\/]node_modules[\\/].*[\\/]android[\\/]build[\\/].*/,
];

module.exports = config;
