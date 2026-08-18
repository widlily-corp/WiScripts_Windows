<#
.SYNOPSIS
    Unlocks and activates the Windows Ultimate Performance power scheme.
.DESCRIPTION
    Duplicates the built-in Ultimate Performance power scheme GUID
    (e9a42b02-d5df-448d-aa00-03f14749eb61) and activates it via powercfg.
.NOTES
    Requires Administrator elevation. Designed for high-performance workstations.
#>

[CmdletBinding()]
param()

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Windows Ultimate Performance Power Plan" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Check existing power plans
Write-Host "Querying current power schemes..." -ForegroundColor Yellow
$powerPlans = powercfg /list

Write-Host "Current Schemes:" -ForegroundColor DarkGray
$powerPlans | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }

# 2. Check if Ultimate Performance plan exists
$ultimateGuid = "e9a42b02-d5df-448d-aa00-03f14749eb61"
$existingPlan = $powerPlans | Select-String "Ultimate Performance"

if (-not $existingPlan) {
    Write-Host "Unlocking Ultimate Performance scheme..." -ForegroundColor Cyan
    $output = powercfg -duplicatescheme $ultimateGuid 2>&1
    Write-Host "Result: $output" -ForegroundColor DarkGray
    
    # Extract newly created GUID
    if ($output -match "([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})") {
        $targetGuid = $Matches[1]
    } else {
        $targetGuid = $ultimateGuid
    }
} else {
    if ($existingPlan -match "([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})") {
        $targetGuid = $Matches[1]
    } else {
        $targetGuid = $ultimateGuid
    }
}

# 3. Set Active Scheme
Write-Host "Activating Ultimate Performance plan ($targetGuid)..." -ForegroundColor Yellow
powercfg /setactive $targetGuid

# 4. Disable disk timeout and hibernate on AC power
powercfg /change disk-timeout-ac 0
powercfg /change standby-timeout-ac 0

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " Ultimate Performance power plan is now active." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
