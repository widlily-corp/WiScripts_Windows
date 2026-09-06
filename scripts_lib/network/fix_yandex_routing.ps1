param()

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[ERROR] This script requires Administrator privileges. Please run as Administrator."
    exit 1
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Yandex Browser & DNS Routing Fix" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$targets = @(
    "HKLM:\SOFTWARE\Policies\Yandex\Browser",
    "HKCU:\SOFTWARE\Policies\Yandex\Browser"
)

Write-Host "Configuring Yandex Browser QUIC policy (QuicAllowed = 0)..." -ForegroundColor Yellow
foreach ($path in $targets) {
    if (!(Test-Path $path)) {
        New-Item -Path $path -Force -ErrorAction SilentlyContinue | Out-Null
    }
    New-ItemProperty -Path $path -Name "QuicAllowed" -PropertyType DWord -Value 0 -Force -ErrorAction SilentlyContinue | Out-Null
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " Yandex Browser QUIC workaround applied." -ForegroundColor Green
Write-Host " Please restart Yandex Browser for changes to take effect." -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Green
