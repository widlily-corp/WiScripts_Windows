param()

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    throw "Modifying browser policy keys requires Administrator privileges. Please run PowerShell as Administrator."
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Disable QUIC Protocol (HTTP/3 Workaround)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$ChromePath = "HKLM:\SOFTWARE\Policies\Google\Chrome"
$EdgePath   = "HKLM:\SOFTWARE\Policies\Microsoft\Edge"
$YandexPath = "HKLM:\SOFTWARE\Policies\Yandex\Browser"

foreach ($p in @($ChromePath, $EdgePath, $YandexPath)) {
    if (!(Test-Path $p)) { New-Item -Path $p -Force -ErrorAction SilentlyContinue | Out-Null }
    New-ItemProperty -Path $p -Name "QuicAllowed" -PropertyType DWord -Value 0 -Force -ErrorAction SilentlyContinue | Out-Null
}

Write-Host "QUIC protocol disabled across Chrome, Edge, and Yandex Browser policies." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
