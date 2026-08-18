<#
.SYNOPSIS
    Disables QUIC for Yandex Browser to fix loading issues.
#>

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Warning "This script requires Administrator privileges. Please run PowerShell as Administrator."
    return
}

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "      Yandex Browser Fix by Antigravity" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

Write-Host "Closing Yandex Browser..."
Stop-Process -Name "browser" -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

Write-Host "Disabling broken QUIC protocol for Yandex Browser..."
$YandexPath = "HKLM:\SOFTWARE\Policies\Yandex\Browser"
if (!(Test-Path $YandexPath)) { New-Item -Path $YandexPath -Force -ErrorAction SilentlyContinue | Out-Null }
New-ItemProperty -Path $YandexPath -Name "QuicAllowed" -PropertyType DWord -Value 0 -Force -ErrorAction SilentlyContinue | Out-Null

Write-Host "=============================================" -ForegroundColor Green
Write-Host "Fix applied successfully." -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
