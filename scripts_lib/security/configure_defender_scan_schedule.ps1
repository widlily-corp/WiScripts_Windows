param(
    [string]$ScanDay = "Everyday",
    [string]$ScanTime = "03:00",
    [int]$CpuThrottlePercent = 30,
    [string]$ScanType = "QuickScan",
    [switch]$UpdateDefinitionsFirst
)

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    throw "This script requires Administrator privileges. Please run PowerShell as Administrator."
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Configure Windows Defender Schedule & Throttling" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Map ScanDay string to Defender Day of Week integer enum
$dayMap = @{
    "Everyday"  = 0
    "Sunday"    = 1
    "Monday"    = 2
    "Tuesday"   = 3
    "Wednesday" = 4
    "Thursday"  = 5
    "Friday"    = 6
    "Saturday"  = 7
    "Never"     = 8
}

$dayInt = 0
if ($dayMap.ContainsKey($ScanDay)) {
    $dayInt = $dayMap[$ScanDay]
} else {
    Write-Host "[WARN] Unrecognized day '$ScanDay', defaulting to Everyday." -ForegroundColor Yellow
    $dayInt = 0
}

# 2. Validate and clamp CPU throttle percentage (10% to 100%)
if ($CpuThrottlePercent -lt 10) { $CpuThrottlePercent = 10 }
if ($CpuThrottlePercent -gt 100) { $CpuThrottlePercent = 100 }

# 3. Format ScanTime to HH:mm:ss
$parsedTime = "03:00:00"
try {
    $parsedTime = (Get-Date $ScanTime).ToString("HH:mm:ss")
} catch {
    $parsedTime = "03:00:00"
}

Write-Host "[INFO] Configuration Parameters:" -ForegroundColor Cyan
Write-Host "  Scheduled Day       : $ScanDay (Code: $dayInt)" -ForegroundColor White
Write-Host "  Scheduled Time      : $parsedTime" -ForegroundColor White
Write-Host "  CPU Throttle Limit  : $CpuThrottlePercent%" -ForegroundColor White
Write-Host "  Scan Profile        : $ScanType" -ForegroundColor White

# 4. Check if Defender cmdlets are available
if (-not (Get-Command "Set-MpPreference" -ErrorAction SilentlyContinue)) {
    Write-Host "[FAIL] Windows Defender PowerShell module (Set-MpPreference) is not available on this system." -ForegroundColor Red
    exit 1
}

# 5. Apply CPU Throttling Limit
try {
    Set-MpPreference -ScanAvgCPULoadFactor $CpuThrottlePercent -ErrorAction Stop
    Write-Host "  [OK] Maximum scan CPU load factor set to $CpuThrottlePercent%." -ForegroundColor Green
} catch {
    Write-Host "  [WARN] Failed to set ScanAvgCPULoadFactor: $($_.Exception.Message)" -ForegroundColor Yellow
}

# 6. Apply Schedule Time and Scan Type
try {
    if ($ScanType -eq "FullScan") {
        Set-MpPreference -ScanScheduleDay $dayInt -ScanScheduleTime $parsedTime -ErrorAction Stop
        Write-Host "  [OK] Full Scan scheduled for $ScanDay at $parsedTime." -ForegroundColor Green
    } else {
        Set-MpPreference -ScanScheduleDay $dayInt -ScanScheduleQuickScanTime $parsedTime -ErrorAction Stop
        Write-Host "  [OK] Quick Scan scheduled for $ScanDay at $parsedTime." -ForegroundColor Green
    }
} catch {
    Write-Host "  [WARN] Failed to configure scan schedule: $($_.Exception.Message)" -ForegroundColor Yellow
}

# 7. Signature Update Before Scan
if ($UpdateDefinitionsFirst) {
    try {
        Set-MpPreference -CheckForSignaturesBeforeRunningScan $true -ErrorAction Stop
        Write-Host "  [OK] Antivirus definitions update before scan enforced." -ForegroundColor Green
    } catch {
        # Non-fatal
    }
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "[OK] Windows Defender scan schedule and CPU throttling configured." -ForegroundColor Green
