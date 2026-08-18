param()

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Warning "Applying power schemes requires Administrator privileges. Please run PowerShell as Administrator."
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Applying Battery Saver Power Profile" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$powerSaverGUID = "a1841308-3541-4fab-bc81-f71556f20b4a"
$balancedGUID   = "381b4222-f694-41f0-9685-ff5bb260df2e"

$planOutput = powercfg /setactive $powerSaverGUID 2>&1
if ($LASTEXITCODE -ne 0) {
    powercfg /setactive $balancedGUID 2>$null
    Write-Host "Switched to Balanced scheme." -ForegroundColor Green
} else {
    Write-Host "Switched to Power Saver scheme." -ForegroundColor Green
}

powercfg /setdcvalueindex SCHEME_CURRENT SUB_PROCESSOR PROCTHROTTLEMAX 95 2>$null
powercfg /setacvalueindex SCHEME_CURRENT SUB_PROCESSOR PROCTHROTTLEMAX 95 2>$null
powercfg /setdcvalueindex SCHEME_CURRENT SUB_PROCESSOR PROCTHROTTLEMIN 0 2>$null
powercfg /setacvalueindex SCHEME_CURRENT SUB_PROCESSOR PROCTHROTTLEMIN 0 2>$null
powercfg /setdcvalueindex SCHEME_CURRENT SUB_PCIEXPRESS ASAPM 2 2>$null
powercfg /setactive SCHEME_CURRENT 2>$null

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

Write-Host "Battery Saver profile applied successfully." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
