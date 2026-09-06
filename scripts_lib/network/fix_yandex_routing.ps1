param()

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[ERROR] This script requires Administrator privileges. Please run as Administrator."
    exit 1
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Yandex Browser & DNS Routing Fix" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

Write-Host "Stopping running browser instances..."
Stop-Process -Name "browser" -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

$YandexPath = "HKLM:\SOFTWARE\Policies\Yandex\Browser"
if (!(Test-Path $YandexPath)) { New-Item -Path $YandexPath -Force -ErrorAction SilentlyContinue | Out-Null }
New-ItemProperty -Path $YandexPath -Name "QuicAllowed" -PropertyType DWord -Value 0 -Force -ErrorAction SilentlyContinue | Out-Null

Write-Host "Yandex Browser QUIC workaround applied." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
