# Vorgabe der Testversion setzen: Test-Haven + gemeinsamer Geräte-Schlüssel als EXPO_PUBLIC_HAVEN_* (src/testvorgabe.ts).
# Wird von expo-update.ps1 (Kanal „laden“) und apk-preview.ps1 per Punkt-Aufruf eingebunden:  . "$PSScriptRoot\testvorgabe.ps1"
# Der Schlüssel kommt aus der Secret-Datei der Haven-Seite und wird NIE ausgegeben, nie ins Repo, app.json oder eas.json
# geschrieben. Fehlt die Datei, wird ohne Vorgabe gebaut (Warnung) – Testpersonen müssen dann koppeln.
$script:TestHavenAdresse = "https://laden.kasse-test.fun"
$script:TestSchluesselDatei = Join-Path $env:USERPROFILE "Projekte\firestream2\_secrets\tester\m4rgin_gemeinsam.txt"

function Set-TestVorgabe {
    $env:EXPO_PUBLIC_HAVEN_ADRESSE = ""
    $env:EXPO_PUBLIC_HAVEN_SCHLUESSEL = ""
    if (-not (Test-Path $script:TestSchluesselDatei)) {
        Write-Host "WARNUNG: $($script:TestSchluesselDatei) fehlt - Testversion OHNE Test-Haven-Vorgabe (Testpersonen muessen koppeln)." -ForegroundColor Yellow
        return $false
    }
    # Nur den Schlüssel m4g_… übernehmen (egal ob allein in der Zeile oder als schluessel=…)
    $treffer = Select-String -Path $script:TestSchluesselDatei -Pattern 'm4g_[A-Za-z0-9_-]+' | Select-Object -First 1
    if (-not $treffer) {
        Write-Host "WARNUNG: In der Schluesseldatei steht kein m4g_-Schluessel - Testversion OHNE Vorgabe." -ForegroundColor Yellow
        return $false
    }
    $env:EXPO_PUBLIC_HAVEN_ADRESSE = $script:TestHavenAdresse
    $env:EXPO_PUBLIC_HAVEN_SCHLUESSEL = $treffer.Matches[0].Value
    Write-Host "Testversion: mit Test-Haven-Vorgabe ($($script:TestHavenAdresse), Schluessel aus der Secret-Datei)." -ForegroundColor Cyan
    return $true
}
