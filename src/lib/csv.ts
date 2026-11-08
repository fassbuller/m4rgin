// CSV für deutsches Excel/LibreOffice: Semikolon, Dezimalkomma, UTF-8 mit BOM.

export type Zelle = string | number | null | undefined;

function zelle(v: Zelle): string {
  if (v == null) return '';
  let s = typeof v === 'number' ? String(v).replace('.', ',') : v;
  // Formel-Injection verhindern: Excel/LibreOffice führen Zellen mit =, +, -, @ (auch nach Tab/CR) als Formel aus
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function zuCsv(kopf: string[], zeilen: Zelle[][]): string {
  return '﻿' + [kopf, ...zeilen].map((z) => z.map(zelle).join(';')).join('\r\n') + '\r\n';
}
