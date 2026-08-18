param()

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Warning "Applying power schemes requires Administrator privileges. Please run PowerShell as Administrator."
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Applying AC Mains Power Profile" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$ultimatePerfGUID = "e9a42b02-d5df-448d-aa00-03f14749eb61"
$highPerfGUID     = "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c"

powercfg -duplicatescheme $ultimatePerfGUID 2>$null | Out-Null
$planOutput = powercfg /setactive $ultimatePerfGUID 2>&1
if ($LASTEXITCODE -ne 0) {
    powercfg /setactive $highPerfGUID 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Switched to High Performance scheme." -ForegroundColor Green
    }
} else {
    Write-Host "Switched to Ultimate Performance scheme." -ForegroundColor Green
}

powercfg /setacvalueindex SCHEME_CURRENT SUB_PROCESSOR PROCTHROTTLEMAX 100 2>$null
powercfg /setdcvalueindex SCHEME_CURRENT SUB_PROCESSOR PROCTHROTTLEMAX 100 2>$null
powercfg /setacvalueindex SCHEME_CURRENT SUB_PROCESSOR PROCTHROTTLEMIN 0 2>$null
powercfg /setdcvalueindex SCHEME_CURRENT SUB_PROCESSOR PROCTHROTTLEMIN 0 2>$null
powercfg /setacvalueindex SCHEME_CURRENT SUB_PCIEXPRESS ASAPM 0 2>$null

powercfg /attributes 54533251-82be-4824-96c1-47b60b740d00 0cc5b647-c1df-4637-891a-dec35c318583 -ATTRIB_HIDE 2>$null
powercfg /setacvalueindex SCHEME_CURRENT 54533251-82be-4824-96c1-47b60b740d00 0cc5b647-c1df-4637-891a-dec35c318583 100 2>$null
powercfg /setactive SCHEME_CURRENT 2>$null

$servicesToStart = @("SysMain", "WSearch", "ClickToRunSvc")
foreach ($svc in $servicesToStart) {
    if (Get-Service $svc -ErrorAction SilentlyContinue | Where-Object {$_.StartType -ne 'Disabled'}) {
        Start-Service -Name $svc -ErrorAction SilentlyContinue
        Write-Host "Started service: $svc"
    }
}

Write-Host "AC High-Performance profile applied successfully." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
