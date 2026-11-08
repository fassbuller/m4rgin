# Baut die Android-Testversion (Development Build) lokal und spielt sie auf den laufenden Emulator/das Gerät.
# Aufruf aus dem Projektordner:  powershell -ExecutionPolicy Bypass -File scripts\android-build.ps1 [-Neu] [-Abi x86_64]
#   -Neu  erzeugt den android-Ordner frisch aus app.json (nötig nach SDK-Update oder neuen nativen Paketen)
#   -Abi  Prozessor-Architekturen, z. B. -Abi x86_64 nur für den Emulator (halbiert die Bauzeit)
#
# Windows-Stolpersteine:
# - Projektpfad mit Leerzeichen („Lennard Markus“): geht seit NDK 27 direkt. Ein virtuelles Laufwerk (subst)
#   für das Projekt geht seit RN 0.88 NICHT mehr – Node löst es zum echten Pfad auf, und die Code-Generierung
#   scheitert an Pfaden über zwei Laufwerke.
# - Pfade über 260 Zeichen: Windows-Einstellung LongPathsEnabled=1 plus neueres CMake (plugins/cmake-neu.js).
# - Nur das Android-SDK liegt auf S:, wie bisher.
param([switch]$Neu, [string]$Abi = "x86_64,arm64-v8a")

$projekt = Split-Path -Parent $PSScriptRoot
$sdk = "$env:LOCALAPPDATA\Android\Sdk"
if (-not (Test-Path S:\)) { subst S: "$sdk" }

# JDK 17 (Gradle verträgt das JDK 25 von Android Studio nicht)
$jdk = Get-ChildItem "$env:LOCALAPPDATA\Programs\Temurin" -Directory -Filter "jdk-17*" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $jdk) { Write-Host "JDK 17 nicht gefunden unter $env:LOCALAPPDATA\Programs\Temurin" -ForegroundColor Red; exit 1 }
$env:JAVA_HOME = $jdk.FullName
$env:ANDROID_HOME = "S:\"
$env:ANDROID_SDK_ROOT = "S:\"
$env:Path = "$env:JAVA_HOME\bin;S:\platform-tools;$env:Path"

Set-Location $projekt
if ($Neu -or -not (Test-Path android)) {
    npx expo prebuild -p android --clean
    if ($LASTEXITCODE -ne 0) { Write-Host "PREBUILD FEHLGESCHLAGEN" -ForegroundColor Red; exit 1 }
}

Set-Location "$projekt\android"
"sdk.dir=S\:\\" | Out-File -Encoding ascii local.properties
.\gradlew.bat app:assembleDebug "-PreactNativeArchitectures=$Abi" --console=plain
if ($LASTEXITCODE -ne 0) { Write-Host "BUILD FEHLGESCHLAGEN ($LASTEXITCODE)" -ForegroundColor Red; exit 1 }
Write-Host "BUILD OK" -ForegroundColor Green

adb wait-for-device
adb install -r app\build\outputs\apk\debug\app-debug.apk
adb reverse tcp:8081 tcp:8081
Write-Host "BUILD+INSTALL OK" -ForegroundColor Green
