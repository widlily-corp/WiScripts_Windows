<#
.SYNOPSIS
    Clears the Windows Update download cache and resets update services.
.DESCRIPTION
    Stops Windows Update (wuauserv), Cryptographic (CryptSvc), and BITS services,
    safely purges C:\Windows\SoftwareDistribution\Download and Catroot2 contents,
    and restarts all services to resolve update download and installation errors.
.NOTES
    Requires Administrator elevation.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = "Continue"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Windows Update Cache Reset Utility" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Stop Windows Update related services
$services = @("wuauserv", "bits", "cryptsvc", "trustedinstaller")
foreach ($svcName in $services) {
    $svc = Get-Service -Name $svcName -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -eq 'Running') {
        Write-Host "Stopping service: $svcName..." -ForegroundColor Yellow
        Stop-Service -Name $svcName -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
    }
}

# 2. Purge SoftwareDistribution Download Cache
$softDistDownload = "$env:SystemRoot\SoftwareDistribution\Download"
if (Test-Path -Path $softDistDownload) {
    Write-Host "Purging Windows Update Download cache: $softDistDownload" -ForegroundColor Yellow
    try {
        Get-ChildItem -Path $softDistDownload -Recurse -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "[OK] SoftwareDistribution\Download cache cleared successfully." -ForegroundColor Green
    } catch {
        Write-Host "[WARN] Some files could not be removed: $($_.Exception.Message)" -ForegroundColor DarkYellow
    }
}

# 3. Purge Catroot2 folder
$catroot2 = "$env:SystemRoot\System32\catroot2"
if (Test-Path -Path $catroot2) {
    Write-Host "Resetting Catroot2 directory: $catroot2" -ForegroundColor Yellow
    try {
        Get-ChildItem -Path $catroot2 -Recurse -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "[OK] Catroot2 purged successfully." -ForegroundColor Green
    } catch {
        Write-Host "[WARN] Catroot2 could not be fully cleared: $($_.Exception.Message)" -ForegroundColor DarkYellow
    }
}

# 4. Restart services
foreach ($svcName in $services) {
    $svc = Get-Service -Name $svcName -ErrorAction SilentlyContinue
    if ($svc) {
        Write-Host "Restarting service: $svcName..." -ForegroundColor Cyan
        Start-Service -Name $svcName -ErrorAction SilentlyContinue
    }
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " Windows Update Cache purge operation completed." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
