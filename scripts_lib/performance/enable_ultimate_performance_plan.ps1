param()

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Warning "Configuring power schemes requires Administrator privileges. Please run PowerShell as Administrator."
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Windows Ultimate Performance Power Plan" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$ultimateGuid = "e9a42b02-d5df-448d-aa00-03f14749eb61"
Write-Host "Duplicating built-in Ultimate Performance power scheme..." -ForegroundColor Yellow
powercfg -duplicatescheme $ultimateGuid 2>$null | Out-Null

Write-Host "Activating Ultimate Performance plan..." -ForegroundColor Cyan
$out = powercfg /setactive $ultimateGuid 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "Ultimate Performance power plan is now ACTIVE." -ForegroundColor Green
} else {
    Write-Host "Ultimate Performance scheme not supported, falling back to High Performance." -ForegroundColor Yellow
    powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c 2>$null
}

Write-Host "==========================================================" -ForegroundColor Green
