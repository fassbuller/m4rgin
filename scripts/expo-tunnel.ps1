# Startet Metro für Expo Go mit Tunnel (iPhone außerhalb des WLANs / bei abgeschotteten Netzen).
# Aufruf aus dem Projektordner:  powershell -ExecutionPolicy Bypass -File scripts\expo-tunnel.ps1
# Der Expo-Zugangstoken (expo.dev → Account settings → Access tokens) wird nur abgefragt und lebt nur
# in diesem Fenster – er wird nirgends gespeichert.
# Der Expo-Tunnel bricht gelegentlich mit 403/409 ab und reißt Metro mit – dann startet die Schleife
# Metro von selbst neu (die Adresse ändert sich dabei; in Expo Go unter „Development servers“ neu antippen).
param([int]$Port = 8081)
$sicher = Read-Host "Expo-Zugangstoken einfuegen (Rechtsklick fuegt ein) und Enter" -AsSecureString
$zeiger = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sicher)
$env:EXPO_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringAuto($zeiger)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($zeiger)

Set-Location (Split-Path -Parent $PSScriptRoot)
npx expo whoami
while ($true) {
    npx expo start --go --tunnel --clear --port $Port
    Write-Host ""
    Write-Host "=== Tunnel/Metro beendet - Neustart in 5 Sekunden (Strg+C zum Aufhoeren) ===" -ForegroundColor Yellow
    Start-Sleep -Seconds 5
}
