# Baut die Android-Testversion (Development Build) lokal und spielt sie auf den laufenden Emulator/das Gerät.
# Aufruf aus dem Projektordner:  powershell -ExecutionPolicy Bypass -File scripts\android-build.ps1 [-Neu]
#   -Neu  erzeugt den android-Ordner frisch aus app.json (nötig nach SDK-Update oder neuen nativen Paketen)
#
# Warum die virtuellen Laufwerke: Das Android-NDK verträgt keine Leerzeichen im Pfad („Lennard Markus“).
# B: zeigt auf den Ordner ÜBER dem Projekt – liegt package.json direkt im Laufwerks-Stamm, findet Expo es nicht.
param([switch]$Neu)

$projekt = Split-Path -Parent $PSScriptRoot
$oben = Split-Path -Parent $projekt
$name = Split-Path -Leaf $projekt
$sdk = "$env:LOCALAPPDATA\Android\Sdk"

if (Test-Path B:\package.json) { subst B: /d }
if (-not (Test-Path B:\)) { subst B: "$oben" }
if (-not (Test-Path S:\)) { subst S: "$sdk" }

# JDK 17 (Gradle 8 verträgt das JDK 25 von Android Studio nicht)
$jdk = Get-ChildItem "$env:LOCALAPPDATA\Programs\Temurin" -Directory -Filter "jdk-17*" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $jdk) { Write-Host "JDK 17 nicht gefunden unter $env:LOCALAPPDATA\Programs\Temurin" -ForegroundColor Red; exit 1 }
$env:JAVA_HOME = $jdk.FullName
$env:ANDROID_HOME = "S:\"
$env:ANDROID_SDK_ROOT = "S:\"
$env:Path = "$env:JAVA_HOME\bin;S:\platform-tools;$env:Path"

Set-Location "B:\$name"
if ($Neu -or -not (Test-Path android)) {
    npx expo prebuild -p android --clean
    if ($LASTEXITCODE -ne 0) { Write-Host "PREBUILD FEHLGESCHLAGEN" -ForegroundColor Red; exit 1 }
}

Set-Location "B:\$name\android"
"sdk.dir=S\:\\" | Out-File -Encoding ascii local.properties
.\gradlew.bat app:assembleDebug -PreactNativeArchitectures=x86_64,arm64-v8a --console=plain
if ($LASTEXITCODE -ne 0) { Write-Host "BUILD FEHLGESCHLAGEN ($LASTEXITCODE)" -ForegroundColor Red; exit 1 }

adb wait-for-device
adb install -r app\build\outputs\apk\debug\app-debug.apk
adb reverse tcp:8081 tcp:8081
Write-Host "BUILD+INSTALL OK" -ForegroundColor Green
