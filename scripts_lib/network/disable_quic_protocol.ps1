<#
.SYNOPSIS
    Disables QUIC (HTTP/3) in Google Chrome and Microsoft Edge.
#>

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Warning "This script requires Administrator privileges. Please run PowerShell as Administrator."
    return
}

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "      Disable QUIC Protocol by Antigravity" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

$ChromePath = "HKLM:\SOFTWARE\Policies\Google\Chrome"
$EdgePath = "HKLM:\SOFTWARE\Policies\Microsoft\Edge"

if (!(Test-Path $ChromePath)) { New-Item -Path $ChromePath -Force -ErrorAction SilentlyContinue | Out-Null }
if (!(Test-Path $EdgePath)) { New-Item -Path $EdgePath -Force -ErrorAction SilentlyContinue | Out-Null }

Write-Host "Disabling QUIC in Google Chrome..."
New-ItemProperty -Path $ChromePath -Name "QuicAllowed" -PropertyType DWord -Value 0 -Force -ErrorAction SilentlyContinue | Out-Null

Write-Host "Disabling QUIC in Microsoft Edge..."
New-ItemProperty -Path $EdgePath -Name "QuicAllowed" -PropertyType DWord -Value 0 -Force -ErrorAction SilentlyContinue | Out-Null

Write-Host "=============================================" -ForegroundColor Green
Write-Host "QUIC Protocol Successfully Disabled!" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green

if ([Environment]::UserInteractive -and -not [Console]::IsInputRedirected) {
    Read-Host "Press Enter to exit..."
}
