<#
.SYNOPSIS
    Applies AC Mains Power Profile (Maximum Performance).
.DESCRIPTION
    Switches to Ultimate or High Performance power plan, unthrottles CPU clock limits,
    disables PCI-e link state power management, and starts background performance services.
#>

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Warning "This script requires Administrator privileges. Please run PowerShell as Administrator."
}

Write-Host ">>> APPLYING AC PROFILE (MAX PERFORMANCE) <<<" -ForegroundColor Yellow

$ultimatePerfGUID = "e9a42b02-d5df-448d-aa00-03f14749eb61"
$highPerfGUID     = "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c"

powercfg -duplicatescheme $ultimatePerfGUID 2>$null | Out-Null
$planOutput = powercfg /setactive $ultimatePerfGUID 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Ultimate Performance not available, setting High Performance..."
    powercfg /setactive $highPerfGUID 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "High Performance not available, keeping active scheme."
    } else {
        Write-Host "Switched to High Performance plan." -ForegroundColor Green
    }
} else {
    Write-Host "Switched to Ultimate Performance plan." -ForegroundColor Green
}

# Apply processor throttle limits
powercfg /setacvalueindex SCHEME_CURRENT SUB_PROCESSOR PROCTHROTTLEMAX 100 2>$null
powercfg /setdcvalueindex SCHEME_CURRENT SUB_PROCESSOR PROCTHROTTLEMAX 100 2>$null
powercfg /setacvalueindex SCHEME_CURRENT SUB_PROCESSOR PROCTHROTTLEMIN 0 2>$null
powercfg /setdcvalueindex SCHEME_CURRENT SUB_PROCESSOR PROCTHROTTLEMIN 0 2>$null
powercfg /setacvalueindex SCHEME_CURRENT SUB_PCIEXPRESS ASAPM 0 2>$null

# Unhide and disable core parking if supported
powercfg /attributes 54533251-82be-4824-96c1-47b60b740d00 0cc5b647-c1df-4637-891a-dec35c318583 -ATTRIB_HIDE 2>$null
powercfg /setacvalueindex SCHEME_CURRENT 54533251-82be-4824-96c1-47b60b740d00 0cc5b647-c1df-4637-891a-dec35c318583 100 2>$null
powercfg /setactive SCHEME_CURRENT 2>$null

Write-Host "Processor & PCI-e power policies applied (100% max performance)."

$servicesToStart = @("SysMain", "WSearch", "ClickToRunSvc")
foreach ($svc in $servicesToStart) {
    if (Get-Service $svc -ErrorAction SilentlyContinue | Where-Object {$_.StartType -ne 'Disabled'}) {
        Start-Service -Name $svc -ErrorAction SilentlyContinue
        Write-Host "Started service: $svc"
    }
}

Write-Host ">>> AC PROFILE APPLIED SUCCESSFULLY <<<" -ForegroundColor Green
