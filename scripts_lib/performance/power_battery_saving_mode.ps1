<#
.SYNOPSIS
    Applies Battery Saver Power Profile (Maximum Autonomy).
.DESCRIPTION
    Switches to Power Saver or Balanced plan, caps max CPU state to 95% (disabling aggressive boost),
    enables maximum PCI Express ASPM power saving, and stops heavy background services.
#>

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Warning "This script requires Administrator privileges. Please run PowerShell as Administrator."
}

Write-Host ">>> APPLYING BATTERY PROFILE (MAX AUTONOMY) <<<" -ForegroundColor Yellow

$powerSaverGUID = "a1841308-3541-4fab-bc81-f71556f20b4a"
$balancedGUID   = "381b4222-f694-41f0-9685-ff5bb260df2e"

$planOutput = powercfg /setactive $powerSaverGUID 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Power Saver plan not found, setting Balanced..."
    powercfg /setactive $balancedGUID 2>$null
} else {
    Write-Host "Switched to Power Saver plan." -ForegroundColor Green
}

# Cap processor state to 95% on battery to eliminate turbo throttling heat
powercfg /setdcvalueindex SCHEME_CURRENT SUB_PROCESSOR PROCTHROTTLEMAX 95 2>$null
powercfg /setacvalueindex SCHEME_CURRENT SUB_PROCESSOR PROCTHROTTLEMAX 95 2>$null
powercfg /setdcvalueindex SCHEME_CURRENT SUB_PROCESSOR PROCTHROTTLEMIN 0 2>$null
powercfg /setacvalueindex SCHEME_CURRENT SUB_PROCESSOR PROCTHROTTLEMIN 0 2>$null
powercfg /setdcvalueindex SCHEME_CURRENT SUB_PCIEXPRESS ASAPM 2 2>$null
powercfg /setactive SCHEME_CURRENT 2>$null

Write-Host "Max CPU state set to 95% (Turbo Boost dampened), ASPM Max Power Saving."

$servicesToStop = @(
    "SysMain",
    "DiagTrack",
    "WSearch",
    "CompatTelRunner",
    "AMD External Events Utility",
    "AMD Crash Defender Service",
    "ClickToRunSvc"
)

foreach ($svc in $servicesToStop) {
    if (Get-Service $svc -ErrorAction SilentlyContinue | Where-Object {$_.Status -eq 'Running'}) {
        Stop-Service -Name $svc -Force -ErrorAction SilentlyContinue
        Write-Host "Suspended service: $svc"
    }
}

Write-Host ">>> BATTERY PROFILE APPLIED SUCCESSFULLY <<<" -ForegroundColor Green
