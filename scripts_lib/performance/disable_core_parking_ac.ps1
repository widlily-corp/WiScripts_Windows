<#
.SYNOPSIS
    Disables CPU core parking when connected to AC power.
#>

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Warning "Configuring core parking requires Administrator privileges. Please run PowerShell as Administrator."
    return
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: CPU Core Parking Disabler (AC Mode)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$subgroup = "54533251-82be-4824-96c1-47b60b740d00"
$minCores = "0cc5b647-c1df-4637-891a-dec35c318583"
$maxCores = "ea062031-0e34-4ff1-9b6d-eb10593acda0"
$perfStateMin = "893dee8e-2bef-41e0-89c6-b55d0929964c"

# Unhide settings first
powercfg /attributes $subgroup $minCores -ATTRIB_HIDE 2>$null
powercfg /attributes $subgroup $maxCores -ATTRIB_HIDE 2>$null
powercfg /attributes $subgroup $perfStateMin -ATTRIB_HIDE 2>$null

# Set values
powercfg -setacvalueindex SCHEME_CURRENT $subgroup $minCores 100 2>$null
powercfg -setacvalueindex SCHEME_CURRENT $subgroup $maxCores 100 2>$null
powercfg -setacvalueindex SCHEME_CURRENT $subgroup $perfStateMin 100 2>$null
powercfg -setactive SCHEME_CURRENT 2>$null

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " CPU core parking on AC power disabled (100% cores active)." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
