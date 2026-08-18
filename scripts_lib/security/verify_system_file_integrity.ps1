param(
    [switch]$SkipDism
)

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Warning "Running SFC and DISM file integrity scans requires Administrator privileges. Please run PowerShell as Administrator."
    return
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Windows System File & Image Integrity Scan" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

if (-not $SkipDism) {
    Write-Host "Step 1/2: Verifying and repairing Windows Image with DISM..." -ForegroundColor Yellow
    Dism.exe /Online /Cleanup-Image /RestoreHealth
}

Write-Host "Step 2/2: Scanning system binaries with System File Checker (SFC)..." -ForegroundColor Yellow
sfc.exe /scannow

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " System file integrity scan complete." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
