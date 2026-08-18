<#
.SYNOPSIS
    Performs System File Checker (SFC) scan and DISM health verification.
.DESCRIPTION
    Scans and verifies Windows core protected files using SFC /scannow and
    executes DISM /Online /Cleanup-Image /RestoreHealth to repair component store.
.NOTES
    Requires Administrator elevation. May take several minutes.
#>

[CmdletBinding()]
param(
    [switch]$SkipDism = $false
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Windows System File & Image Integrity Scan" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Check DISM Image Health
if (-not $SkipDism) {
    Write-Host "Step 1/2: Verifying and repairing Windows Image with DISM..." -ForegroundColor Yellow
    $dismArgs = @("/Online", "/Cleanup-Image", "/RestoreHealth")
    $dismProc = Start-Process -FilePath "dism.exe" -ArgumentList $dismArgs -NoNewWindow -Wait -PassThru
    if ($dismProc.ExitCode -eq 0) {
        Write-Host "[OK] DISM Image health check completed cleanly." -ForegroundColor Green
    } else {
        Write-Host "[WARN] DISM completed with code: $($dismProc.ExitCode)" -ForegroundColor DarkYellow
    }
}

# 2. Run System File Checker (SFC)
Write-Host "Step 2/2: Running System File Checker (SFC /scannow)..." -ForegroundColor Yellow
$sfcProc = Start-Process -FilePath "sfc.exe" -ArgumentList "/scannow" -NoNewWindow -Wait -PassThru

Write-Host "SFC Exit Code: $($sfcProc.ExitCode)" -ForegroundColor Cyan
switch ($sfcProc.ExitCode) {
    0 { Write-Host "[OK] Windows Resource Protection did not find any integrity violations." -ForegroundColor Green }
    1 { Write-Host "[WARN] Windows Resource Protection found corrupt files and successfully repaired them." -ForegroundColor Green }
    2 { Write-Host "[ERROR] Windows Resource Protection found corrupt files but was unable to fix some of them." -ForegroundColor Red }
    default { Write-Host "[INFO] SFC scan completed." -ForegroundColor Cyan }
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " Integrity scan finished." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
