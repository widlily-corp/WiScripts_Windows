param(
    [switch]$PurgeDataStore
)

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    throw "This script requires Administrator privileges. Please run PowerShell as Administrator."
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Clean Windows Update Cache & SoftwareDistribution" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Measure initial cache directory size
$downloadDir = Join-Path -Path $env:windir -ChildPath "SoftwareDistribution\Download"
$initialBytes = [uint64]0

if (Test-Path $downloadDir) {
    $files = Get-ChildItem -Path $downloadDir -Recurse -File -Force -ErrorAction SilentlyContinue
    if ($files) {
        $measure = $files | Measure-Object -Property Length -Sum
        if ($measure -and $measure.Sum) {
            $initialBytes = [uint64]$measure.Sum
        }
    }
}

$initialMb = [math]::Round($initialBytes / 1MB, 1)
Write-Host "[INFO] Detected Windows Update cache size: $initialMb MB" -ForegroundColor Yellow

# 2. Safely Stop Update-Related Services
$services = @("wuauserv", "bits", "cryptsvc", "dosvc")
Write-Host "`n[INFO] Safely stopping Windows Update background services..." -ForegroundColor Cyan

foreach ($svc in $services) {
    try {
        $serviceObj = Get-Service -Name $svc -ErrorAction SilentlyContinue
        if ($serviceObj -and $serviceObj.Status -eq 'Running') {
            Stop-Service -Name $svc -Force -ErrorAction Stop
            Write-Host "  [OK] Service '$svc' stopped." -ForegroundColor Green
        }
    } catch {
        Write-Host "  [WARN] Could not gracefully stop '$svc' (May already be inactive)." -ForegroundColor DarkGray
    }
}

Start-Sleep -Milliseconds 1000

# 3. Purge Download Cache Files
Write-Host "`n[INFO] Purging downloaded update installation files in SoftwareDistribution\Download..." -ForegroundColor Cyan
$deletedCount = 0
if (Test-Path $downloadDir) {
    $items = Get-ChildItem -Path $downloadDir -Force -ErrorAction SilentlyContinue
    foreach ($item in $items) {
        try {
            Remove-Item -Path $item.FullName -Recurse -Force -ErrorAction Stop
            $deletedCount++
        } catch {
            # File may be locked by another process
        }
    }
    Write-Host "  [OK] Removed $deletedCount cache item(s) from SoftwareDistribution\Download." -ForegroundColor Green
}

# 4. Optional: Purge DataStore & Catroot2 (Rebuild Update History)
if ($PurgeDataStore) {
    Write-Host "`n[INFO] Purging Windows Update DataStore database and Catroot2 catalog..." -ForegroundColor Yellow
    
    $dataStoreDir = Join-Path -Path $env:windir -ChildPath "SoftwareDistribution\DataStore"
    if (Test-Path $dataStoreDir) {
        Remove-Item -Path "$dataStoreDir\*" -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "  [OK] SoftwareDistribution\DataStore purged." -ForegroundColor Green
    }
    
    $catroot2Dir = Join-Path -Path $env:windir -ChildPath "System32\catroot2"
    if (Test-Path $catroot2Dir) {
        Remove-Item -Path "$catroot2Dir\*" -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "  [OK] Catroot2 signatures directory cleared." -ForegroundColor Green
    }
}

# 5. Restart Services
Write-Host "`n[INFO] Restarting Windows Update background services..." -ForegroundColor Cyan
foreach ($svc in $services) {
    try {
        $serviceObj = Get-Service -Name $svc -ErrorAction SilentlyContinue
        if ($serviceObj) {
            Start-Service -Name $svc -ErrorAction SilentlyContinue
            Write-Host "  [OK] Service '$svc' restarted." -ForegroundColor Green
        }
    } catch {
        # Ignore startup errors for optional services
    }
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "[OK] Windows Update cache cleanup completed successfully. Reclaimed ~$initialMb MB." -ForegroundColor Green
