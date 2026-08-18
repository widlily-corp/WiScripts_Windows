<#
.SYNOPSIS
    Disables CPU core parking when connected to AC power for maximum responsiveness.
.DESCRIPTION
    Configures processor power management subgroup settings to 100% min/max
    processor state and 100% unparked cores across the active power plan.
.NOTES
    Requires Administrator elevation. Decreases latency on multi-core CPUs.
#>

[CmdletBinding()]
param()

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: CPU Core Parking Disabler (AC Mode)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Subgroup: PROCESSOR (54533251-82be-4824-96c1-47b60b740d00)
# Setting: CPMINCORES (0cc5b647-c1df-4637-891a-dec35c318583) - Processor performance core parking min cores
# Setting: CPMAXCORES (ea062031-0e34-4ff1-9b6d-eb10593acda0) - Processor performance core parking max cores

$subgroup = "54533251-82be-4824-96c1-47b60b740d00"
$minCores = "0cc5b647-c1df-4637-891a-dec35c318583"
$maxCores = "ea062031-0e34-4ff1-9b6d-eb10593acda0"
$perfStateMin = "893dee8e-2bef-41e0-89c6-b55d0929964c"

Write-Host "Configuring active power scheme processor core parking parameters..." -ForegroundColor Yellow

# Set minimum unparked cores on AC to 100%
powercfg -setacvalueindex SCHEME_CURRENT $subgroup $minCores 100

# Set maximum unparked cores on AC to 100%
powercfg -setacvalueindex SCHEME_CURRENT $subgroup $maxCores 100

# Set minimum processor state to 100% on AC (eliminating frequency ramp latency)
powercfg -setacvalueindex SCHEME_CURRENT $subgroup $perfStateMin 100

# Re-apply active power scheme to enforce changes
Write-Host "Re-applying active power scheme..." -ForegroundColor Cyan
powercfg -setactive SCHEME_CURRENT

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " CPU core parking on AC power disabled (100% cores active)." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
