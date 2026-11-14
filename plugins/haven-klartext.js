// Klartext-HTTP nur zu Haven über Tailscale (eigene Builds; Expo Go hat eigene Netzwerkregeln).
// Haven ist bewusst http ohne TLS erreichbar – WireGuard (Tailscale) verschlüsselt die Strecke
// (firestream2 v0.99.131, docker-compose.tailscale.yml). Android blockt Klartext in Release-Builds,
// iOS über App Transport Security. Erlaubt wird genau diese Adresse, sonst bleibt alles wie es ist.
//
//   app.json: ["./plugins/haven-klartext.js", { "hosts": ["100.73.19.78"] }]
const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod, withInfoPlist } = require('expo/config-plugins');

const DATEI = 'network_security_config';

function sicherheitsXml(hosts) {
  const domains = hosts.map((h) => `    <domain includeSubdomains="false">${h}</domain>`).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- m4rgin: Klartext nur zu Haven über Tailscale (plugins/haven-klartext.js) -->
<network-security-config>
  <domain-config cleartextTrafficPermitted="true">
${domains}
  </domain-config>
  <debug-overrides>
    <trust-anchors>
      <certificates src="system" />
      <certificates src="user" />
    </trust-anchors>
  </debug-overrides>
</network-security-config>
`;
}

module.exports = function havenKlartext(config, opts = {}) {
  const hosts = opts.hosts ?? [];
  if (!hosts.length) return config;

  // Android: res/xml/network_security_config.xml + Verweis im Manifest
  // Release (src/main): Klartext nur zu den Haven-Hosts.
  // Debug (src/debug überschreibt main): Klartext überall wie bisher – der Metro-Entwicklungsserver und
  // ein Ollama im Laden-WLAN laufen über http; ohne das würde die Netzwerkregel sie im Dev-Build sperren.
  config = withDangerousMod(config, [
    'android',
    async (c) => {
      const res = (variante) => path.join(c.modRequest.platformProjectRoot, 'app', 'src', variante, 'res', 'xml');
      fs.mkdirSync(res('main'), { recursive: true });
      fs.writeFileSync(path.join(res('main'), `${DATEI}.xml`), sicherheitsXml(hosts));
      fs.mkdirSync(res('debug'), { recursive: true });
      fs.writeFileSync(
        path.join(res('debug'), `${DATEI}.xml`),
        `<?xml version="1.0" encoding="utf-8"?>
<!-- m4rgin (Debug): Klartext überall erlaubt, wie ohne eigene Netzwerkregel (plugins/haven-klartext.js) -->
<network-security-config>
  <base-config cleartextTrafficPermitted="true" />
</network-security-config>
`,
      );
      return c;
    },
  ]);
  config = withAndroidManifest(config, (c) => {
    const app = c.modResults.manifest.application?.[0];
    if (app) app.$['android:networkSecurityConfig'] = `@xml/${DATEI}`;
    return c;
  });

  // iOS: ATS-Ausnahme je Host (lokale Netze erlaubt app.json schon über NSAllowsLocalNetworking)
  config = withInfoPlist(config, (c) => {
    const ats = (c.modResults.NSAppTransportSecurity = c.modResults.NSAppTransportSecurity ?? {});
    const ausnahmen = (ats.NSExceptionDomains = ats.NSExceptionDomains ?? {});
    for (const h of hosts) ausnahmen[h] = { NSExceptionAllowsInsecureHTTPLoads: true, NSIncludesSubdomains: false };
    return c;
  });
  return config;
};
