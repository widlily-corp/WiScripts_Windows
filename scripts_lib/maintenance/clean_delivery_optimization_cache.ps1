param(
    [int]$MaxAgeDays = 0
)

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[ERROR] This script requires Administrator privileges. Please run as Administrator."
    exit 1
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Clean Delivery Optimization Cache" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Try invoking built-in DeliveryOptimization PowerShell Cmdlet
Write-Host "[INFO] Attempting native Delivery Optimization cache purge..." -ForegroundColor Cyan
$cmdletSucceeded = $false
try {
    if (Get-Command "Delete-DeliveryOptimizationCache" -ErrorAction SilentlyContinue) {
        Delete-DeliveryOptimizationCache -Force -ErrorAction Stop
        Write-Host "  [OK] Native Delete-DeliveryOptimizationCache cmdlet executed successfully." -ForegroundColor Green
        $cmdletSucceeded = $true
    }
} catch {
    Write-Host "  [WARN] Native cmdlet encountered non-fatal error, proceeding to direct folder purge..." -ForegroundColor DarkGray
}

# 2. Stop Delivery Optimization Service (dosvc) for file unlocking
$dosvc = Get-Service -Name "dosvc" -ErrorAction SilentlyContinue
if ($dosvc -and $dosvc.Status -eq 'Running') {
    Write-Host "`n[INFO] Stopping Delivery Optimization service (dosvc)..." -ForegroundColor Cyan
    try {
        Stop-Service -Name "dosvc" -Force -ErrorAction Stop
        Write-Host "  [OK] Service 'dosvc' stopped." -ForegroundColor Green
    } catch {
        # Ignore stop failure
    }
}

Start-Sleep -Milliseconds 1000

# 3. Direct Cleanup of NetworkService DO Cache Directory
$doCachePaths = @(
    "$env:windir\ServiceProfiles\NetworkService\AppData\Local\Microsoft\Windows\DeliveryOptimization\Cache",
    "$env:windir\ServiceProfiles\NetworkService\AppData\Local\Microsoft\Windows\DeliveryOptimization\Logs",
    "$env:ProgramData\Microsoft\Windows\DeliveryOptimization\Cache"
)

$totalReclaimedBytes = [uint64]0
$purgedFilesCount = 0
$cutoffDate = if ($MaxAgeDays -gt 0) { (Get-Date).AddDays(-$MaxAgeDays) } else { $null }

foreach ($path in $doCachePaths) {
    if (Test-Path $path) {
        Write-Host "`n[INFO] Scanning cache directory: $path" -ForegroundColor Cyan
        $files = Get-ChildItem -Path $path -Recurse -File -Force -ErrorAction SilentlyContinue
        if ($files) {
            foreach ($file in $files) {
                if ($cutoffDate -and $file.LastWriteTime -gt $cutoffDate) {
                    continue
                }
                try {
                    $len = $file.Length
                    Remove-Item -Path $file.FullName -Force -ErrorAction Stop
                    $totalReclaimedBytes += [uint64]$len
                    $purgedFilesCount++
                } catch {
                    # Skip locked file
                }
            }
        }
    }
}

# 4. Restart Delivery Optimization Service
if ($dosvc) {
    Write-Host "`n[INFO] Restarting Delivery Optimization service (dosvc)..." -ForegroundColor Cyan
    try {
        Start-Service -Name "dosvc" -ErrorAction SilentlyContinue
        Write-Host "  [OK] Service 'dosvc' restarted." -ForegroundColor Green
    } catch {
        # Ignore restart error
    }
}

$reclaimedMb = [math]::Round($totalReclaimedBytes / 1MB, 2)
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "[OK] Delivery Optimization cache purged ($reclaimedMb MB freed across $purgedFilesCount files)." -ForegroundColor Green
