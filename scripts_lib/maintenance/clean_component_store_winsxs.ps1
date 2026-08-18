<#
.SYNOPSIS
    Cleans up superseded and obsolete components in the WinSxS store using DISM.
.DESCRIPTION
    Runs DISM Component Cleanup with /StartComponentCleanup and /ResetBase options
    to reclaim gigabytes of disk space while maintaining system stability.
.NOTES
    Requires Administrator elevation. ResetBase prevents uninstalling existing updates.
#>

[CmdletBinding()]
param(
    [switch]$ResetBase = $false
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Windows Component Store (WinSxS) Cleanup" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Analyze Component Store
Write-Host "Analyzing current component store state with DISM..." -ForegroundColor Yellow
$analyzeArgs = @("/Online", "/Cleanup-Image", "/AnalyzeComponentStore")
Start-Process -FilePath "dism.exe" -ArgumentList $analyzeArgs -NoNewWindow -Wait

# 2. Execute Cleanup
Write-Host "Starting WinSxS component store cleanup..." -ForegroundColor Cyan
$cleanupArgs = @("/Online", "/Cleanup-Image", "/StartComponentCleanup")

if ($ResetBase) {
    Write-Host "ResetBase flag specified: removing superseded component versions..." -ForegroundColor Yellow
    $cleanupArgs += "/ResetBase"
}

$proc = Start-Process -FilePath "dism.exe" -ArgumentList $cleanupArgs -NoNewWindow -Wait -PassThru

if ($proc.ExitCode -eq 0) {
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host " WinSxS component store cleanup completed successfully." -ForegroundColor Green
    Write-Host "==========================================================" -ForegroundColor Green
} else {
    Write-Host "==========================================================" -ForegroundColor Red
    Write-Host " DISM exited with code $($proc.ExitCode)." -ForegroundColor Red
    Write-Host "==========================================================" -ForegroundColor Red
}
