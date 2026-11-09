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
npx --yes eas-cli@latest update --channel $Kanal --environment preview --message "$Nachricht" --platform all --non-interactive
if ($LASTEXITCODE -ne 0) { throw "eas update fehlgeschlagen." }

$sdk = ($app.expo.sdkVersion, (node -p "require('expo/package.json').version.split('.')[0] + '.0.0'") | Where-Object { $_ } | Select-Object -First 1)
$laufzeit = "exposdk:$sdk"
$expoGo = "exp://u.expo.dev/$projektId" + "?channel-name=$Kanal&runtime-version=$laufzeit"
$qr = "https://qr.expo.dev/eas-update?projectId=$projektId&runtimeVersion=$([uri]::EscapeDataString($laufzeit))&channel=$Kanal&slug=exp"
Write-Host ""
Write-Host "=== Fertig ===" -ForegroundColor Green
Write-Host "In Expo Go oeffnen:  $expoGo"
Write-Host "QR-Code (im Browser oeffnen, mit dem iPhone scannen):  $qr"
