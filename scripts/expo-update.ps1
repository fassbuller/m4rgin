# Veröffentlicht den aktuellen Stand als EAS Update – die App läuft dann in Expo Go ohne laufenden PC.
# Aufruf aus dem Projektordner:  powershell -ExecutionPolicy Bypass -File scripts\expo-update.ps1
# Optional:  -Nachricht "Ampel überarbeitet"   -Kanal laden
# Der Expo-Zugangstoken (expo.dev → Account settings → Access tokens) wird nur abgefragt und lebt nur
# in diesem Fenster – er wird nirgends gespeichert.
# Beim ersten Mal wird das Projekt bei Expo angelegt (eas init) – das schreibt die Projekt-ID in app.json.
param(
    [string]$Nachricht = "",
    [string]$Kanal = "laden"
)
$ErrorActionPreference = "Stop"
$sicher = Read-Host "Expo-Zugangstoken einfuegen (Rechtsklick fuegt ein) und Enter" -AsSecureString
$zeiger = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sicher)
$env:EXPO_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringAuto($zeiger)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($zeiger)

Set-Location (Split-Path -Parent $PSScriptRoot)
# Der Hermes-Compiler darf im Windows-Temp-Ordner (AppData\Local\Temp) hier keine Dateien anlegen
# ("permission denied", Exit-Code 6) – deshalb ein eigener Temp-Ordner im Projekt.
$tmp = Join-Path (Get-Location) ".tmp"
New-Item -ItemType Directory -Force $tmp | Out-Null
$env:TEMP = $tmp
$env:TMP = $tmp
# Der Projekt-Fingerabdruck hängt hier gelegentlich minutenlang und wird für Expo Go nicht gebraucht
# (Laufzeit = SDK-Version, kein eigener nativer Build) – eas schlägt das Überspringen selbst vor.
$env:EAS_SKIP_AUTO_FINGERPRINT = "1"
npx --yes eas-cli@latest whoami
if ($LASTEXITCODE -ne 0) { throw "Anmeldung bei Expo fehlgeschlagen - Token pruefen." }

$app = Get-Content app.json -Raw -Encoding UTF8 | ConvertFrom-Json
$projektId = $app.expo.extra.eas.projectId
if (-not $projektId) {
    Write-Host "Erstes Mal: Projekt bei Expo anlegen ..." -ForegroundColor Cyan
    npx --yes eas-cli@latest init --non-interactive --force
    if ($LASTEXITCODE -ne 0) { throw "eas init fehlgeschlagen." }
    npx --yes eas-cli@latest update:configure --platform all --non-interactive
    $app = Get-Content app.json -Raw -Encoding UTF8 | ConvertFrom-Json
    $projektId = $app.expo.extra.eas.projectId
}

if (-not $Nachricht) { $Nachricht = (git log -1 --pretty=%s) }
# Stand fest ins Bundle schreiben (Einstellungen zeigen ihn oben an): Commit, ggf. „+“ bei ungespeicherten Änderungen, Uhrzeit
$commit = (git rev-parse --short HEAD)
if (git status --porcelain --untracked-files=no) { $commit = "$commit+" }
$env:EXPO_PUBLIC_STAND = "$commit vom $(Get-Date -Format 'dd.MM. HH:mm')"
Write-Host "Stand: $env:EXPO_PUBLIC_STAND" -ForegroundColor Cyan
# Wächter: eas update bleibt hier gelegentlich gleich zu Beginn minutenlang ohne Ausgabe hängen (der zweite
# Versuch lief bisher immer durch). Darum mit Zeitlimit starten und bei Hänger selbst neu versuchen –
# der Token bleibt in diesem Fenster, er muss nicht neu eingegeben werden.
$nachrichtArg = $Nachricht.Replace('"', "'")
$argumente = "--yes eas-cli@latest update --channel $Kanal --environment preview --message `"$nachrichtArg`" --platform all --non-interactive"
$limitMinuten = 4
$ok = $false
for ($versuch = 1; $versuch -le 3 -and -not $ok; $versuch++) {
    if ($versuch -gt 1) { Write-Host "=== eas hing - Versuch $versuch von 3 ===" -ForegroundColor Yellow }
    $p = Start-Process -FilePath "npx.cmd" -ArgumentList $argumente -NoNewWindow -PassThru
    if ($p.WaitForExit($limitMinuten * 60 * 1000)) {
        if ($p.ExitCode -ne 0) { throw "eas update fehlgeschlagen (Exit-Code $($p.ExitCode))." }
        $ok = $true
    } else {
        # Ganzen Prozessbaum beenden (npx startet eas als Kindprozess)
        & taskkill.exe /T /F /PID $p.Id | Out-Null
        Write-Host ""
        Write-Host "eas update hat nach $limitMinuten Minuten nicht geantwortet - abgebrochen." -ForegroundColor Yellow
    }
}
if (-not $ok) { throw "eas update hing dreimal - spaeter erneut versuchen." }

$sdk = ($app.expo.sdkVersion, (node -p "require('expo/package.json').version.split('.')[0] + '.0.0'") | Where-Object { $_ } | Select-Object -First 1)
$laufzeit = "exposdk:$sdk"
$expoGo = "exp://u.expo.dev/$projektId" + "?channel-name=$Kanal&runtime-version=$laufzeit"
$qr = "https://qr.expo.dev/eas-update?projectId=$projektId&runtimeVersion=$([uri]::EscapeDataString($laufzeit))&channel=$Kanal&slug=exp"
Write-Host ""
Write-Host "=== Fertig ===" -ForegroundColor Green
Write-Host "In Expo Go oeffnen:  $expoGo"
Write-Host "QR-Code (im Browser oeffnen, mit dem iPhone scannen):  $qr"
