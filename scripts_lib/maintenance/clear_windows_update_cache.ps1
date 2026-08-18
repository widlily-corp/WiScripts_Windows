param()

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    throw "Purging Windows Update cache requires Administrator privileges. Please run PowerShell as Administrator."
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Windows Update Cache Purge & Service Reset" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$services = @("wuauserv", "bits", "cryptsvc", "dosvc")
Write-Host "Stopping Windows Update services..." -ForegroundColor Yellow
foreach ($s in $services) {
    Stop-Service -Name $s -Force -ErrorAction SilentlyContinue
}

$downloadDir = "$env:windir\SoftwareDistribution\Download"
if (Test-Path $downloadDir) {
    Write-Host "Purging SoftwareDistribution Download cache..." -ForegroundColor Yellow
    Remove-Item "$downloadDir\*" -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Restarting Windows Update services..." -ForegroundColor Cyan
foreach ($s in $services) {
    Start-Service -Name $s -ErrorAction SilentlyContinue
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " Windows Update cache successfully purged and services restored." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
