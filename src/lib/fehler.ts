// Technische Fehler in Sätze übersetzen, die man an der Theke versteht – statt „TypeError: Network request failed“.

export type FehlerArt = 'offline' | 'zeit' | 'quelle' | 'daten' | 'sonst';

export function fehlerArt(e: unknown): FehlerArt {
  const t = String((e as Error)?.message ?? e).toLowerCase();
  if (/network request failed|failed to fetch|networkerror|internet|unable to resolve host|offline/.test(t)) return 'offline';
  if (/timeout|zeitüberschreitung|took too long|aborted/.test(t)) return 'zeit';
  if (/antwortet mit \d{3}|status \d{3}|\b(4\d\d|5\d\d)\b/.test(t)) return 'quelle';
  if (/json|unexpected token|database|sqlite|prepareasync|nullpointer/.test(t)) return 'daten';
  return 'sonst';
}

/** Ein verständlicher Satz; `was` sagt, wobei es passiert ist („Die Preisabfrage“). */
export function fehlerText(e: unknown, was = 'Das hat'): string {
  const roh = String((e as Error)?.message ?? e);
  switch (fehlerArt(e)) {
    case 'offline':
      return `${was} nicht geklappt: keine Internetverbindung. WLAN prüfen und erneut versuchen.`;
    case 'zeit':
      return `${was} hat zu lange gedauert. Bitte gleich noch einmal versuchen.`;
    case 'quelle':
      return `${was} nicht geklappt: Der Dienst antwortet gerade nicht richtig (${kurz(roh)}).`;
    case 'daten':
      return `${was} nicht geklappt: Die gespeicherten Daten konnten nicht gelesen werden. App einmal schließen und neu öffnen.`;
    default:
      return `${was} nicht geklappt (${kurz(roh)}).`;
  }
}

const kurz = (s: string) => (s.length > 90 ? `${s.slice(0, 87)}…` : s);
