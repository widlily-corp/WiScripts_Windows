param(
    [switch]$ResetBase
)

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Warning "Cleaning the Windows Component Store requires Administrator privileges. Please run PowerShell as Administrator."
    return
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: WinSxS Component Store Cleanup" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

Write-Host "Starting DISM Component Cleanup..." -ForegroundColor Yellow
if ($ResetBase) {
    Write-Host "Mode: StartComponentCleanup with ResetBase (removes superseded update baselines)..." -ForegroundColor Yellow
    Dism.exe /Online /Cleanup-Image /StartComponentCleanup /ResetBase
} else {
    Write-Host "Mode: Standard StartComponentCleanup..." -ForegroundColor Yellow
    Dism.exe /Online /Cleanup-Image /StartComponentCleanup
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " WinSxS Component Store cleanup completed." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
