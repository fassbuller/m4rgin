# Baut das Test-APK (EAS-Profil „preview“) in der Expo-Cloud – mit Test-Haven-Vorgabe.
# Aufruf aus dem Projektordner:  powershell -ExecutionPolicy Bypass -File scripts\apk-preview.ps1
#
# Der EAS-Build läuft auf Expos Servern, lokale Umgebungsvariablen kommen dort nicht an. Deshalb legt das Skript
# EXPO_PUBLIC_HAVEN_ADRESSE / EXPO_PUBLIC_HAVEN_SCHLUESSEL als EAS-Umgebungsvariablen der Umgebung „preview“ an
# (Schlüssel mit Sichtbarkeit „sensitive“ – in der Expo-Oberfläche verdeckt; im fertigen APK steht er trotzdem,
# siehe src/testvorgabe.ts). Fehlt die Secret-Datei, werden die Variablen geleert und ohne Vorgabe gebaut.
# Der Expo-Zugangstoken wird nur abgefragt und lebt nur in diesem Fenster.
$ErrorActionPreference = "Stop"
$sicher = Read-Host "Expo-Zugangstoken einfuegen (Rechtsklick fuegt ein) und Enter" -AsSecureString
$zeiger = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sicher)
$env:EXPO_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringAuto($zeiger)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($zeiger)

Set-Location (Split-Path -Parent $PSScriptRoot)
$tmp = Join-Path (Get-Location) ".tmp"
New-Item -ItemType Directory -Force $tmp | Out-Null
$env:TEMP = $tmp
$env:TMP = $tmp

npx --yes eas-cli@latest whoami
if ($LASTEXITCODE -ne 0) { throw "Anmeldung bei Expo fehlgeschlagen - Token pruefen." }

. "$PSScriptRoot\testvorgabe.ps1"
$mitVorgabe = Set-TestVorgabe

function Set-EasVariable([string]$Name, [string]$Wert, [string]$Sichtbarkeit) {
    if ($Wert) {
        # Wert nie ausgeben: Ausgabe von eas unterdrücken, nur den Erfolg melden
        npx --yes eas-cli@latest env:create --environment preview --name $Name --value $Wert --visibility $Sichtbarkeit --type string --force --non-interactive *> $null
        if ($LASTEXITCODE -ne 0) { throw "EAS-Variable $Name liess sich nicht setzen." }
        Write-Host "EAS-Variable $Name gesetzt ($Sichtbarkeit)." -ForegroundColor Cyan
    } else {
        npx --yes eas-cli@latest env:delete --environment preview --variable-name $Name --non-interactive *> $null
        Write-Host "EAS-Variable $Name entfernt (ohne Vorgabe)." -ForegroundColor Yellow
    }
}
Set-EasVariable "EXPO_PUBLIC_HAVEN_ADRESSE" $env:EXPO_PUBLIC_HAVEN_ADRESSE "plaintext"
Set-EasVariable "EXPO_PUBLIC_HAVEN_SCHLUESSEL" $env:EXPO_PUBLIC_HAVEN_SCHLUESSEL "sensitive"

$commit = (git rev-parse --short HEAD)
$env:EXPO_PUBLIC_STAND = "$commit (APK)"
Write-Host "Starte EAS-Build android/preview (Stand $commit, Vorgabe: $mitVorgabe) ..." -ForegroundColor Cyan
npx --yes eas-cli@latest build --platform android --profile preview --non-interactive --no-wait
if ($LASTEXITCODE -ne 0) { throw "EAS-Build liess sich nicht starten." }
Write-Host ""
Write-Host "=== Build gestartet - Fortschritt und APK-Link auf expo.dev unter Builds ===" -ForegroundColor Green
