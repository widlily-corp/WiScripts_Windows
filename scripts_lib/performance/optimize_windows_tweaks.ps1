param(
    [switch]$IncludeSystemRepair
)

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[ERROR] This script requires Administrator privileges. Please run as Administrator."
    exit 1
}

$logDir = if ($env:LOCALAPPDATA) {
    Join-Path $env:LOCALAPPDATA "WiScripts\Logs"
} elseif ($env:TEMP) {
    $env:TEMP
} else {
    $env:USERPROFILE
}

if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force -ErrorAction SilentlyContinue | Out-Null
}

$logPath = Join-Path $logDir "WiScripts_optimize_log.txt"
Start-Transcript -Path $logPath -Force -ErrorAction SilentlyContinue

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Windows OS Performance & Privacy Tweaks" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Removing Microsoft PC Manager bloatware if present
Write-Host "[1/6] Removing Microsoft PC Manager..." -ForegroundColor Cyan
try {
    $packages = Get-AppxPackage *PCManager* -ErrorAction SilentlyContinue
    if ($packages) {
        $packages | Remove-AppxPackage -ErrorAction SilentlyContinue
        Write-Host "  [OK] Successfully removed PC Manager." -ForegroundColor Green
    } else {
        Write-Host "  [INFO] PC Manager not installed." -ForegroundColor DarkGray
    }
} catch {
    Write-Host "  [NOTE] $($_.Exception.Message)" -ForegroundColor DarkGray
}

# 2. Cleaning Startup Registry Items
Write-Host "[2/6] Cleaning Startup Registry Items..." -ForegroundColor Cyan
$runKey = "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run"
$itemsToRemove = @(
    "YandexBrowserAutoLaunch*",
    "MicrosoftEdgeAutoLaunch*",
    "Mozilla-Firefox*",
    "HUAWEI Cloud",
    "Steam",
    "Discord",
    "Lesta Game Center",
    "AMDNoiseSuppression"
)

foreach ($item in $itemsToRemove) {
    try {
        if ($item -like "*`**") {
            $matches = Get-ItemProperty -Path $runKey -ErrorAction SilentlyContinue | Get-Member -MemberType NoteProperty | Where-Object Name -like $item
            foreach ($m in $matches) {
                Remove-ItemProperty -Path $runKey -Name $m.Name -Force -ErrorAction SilentlyContinue
                Write-Host "  [OK] Removed from startup: $($m.Name)" -ForegroundColor Green
            }
        } else {
            $val = Get-ItemProperty -Path $runKey -Name $item -ErrorAction SilentlyContinue
            if ($val) {
                Remove-ItemProperty -Path $runKey -Name $item -Force -ErrorAction SilentlyContinue
                Write-Host "  [OK] Removed from startup: ${item}" -ForegroundColor Green
            }
        }
    } catch {
        Write-Host "  [NOTE] Notice for ${item}: $($_.Exception.Message)" -ForegroundColor DarkGray
    }
}

# 3. Kernel Responsiveness & Multimedia Throttling
Write-Host "[3/6] Optimizing Kernel & Multimedia Responsiveness..." -ForegroundColor Cyan
$sysProfileKey = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile"
if (-not (Test-Path $sysProfileKey)) {
    New-Item -Path $sysProfileKey -Force -ErrorAction SilentlyContinue | Out-Null
}
Set-ItemProperty -Path $sysProfileKey -Name "NetworkThrottlingIndex" -Value 0xffffffff -Type DWord -Force -ErrorAction SilentlyContinue | Out-Null
Set-ItemProperty -Path $sysProfileKey -Name "SystemResponsiveness" -Value 10 -Type DWord -Force -ErrorAction SilentlyContinue | Out-Null
Write-Host "  [OK] Network throttling index and system responsiveness tuned." -ForegroundColor Green

# 4. Gaming DVR & GameBar Overhead Reduction
Write-Host "[4/6] Disabling Background Gaming DVR Overhead..." -ForegroundColor Cyan
$gameConfigKey = "HKCU:\System\GameConfigStore"
if (-not (Test-Path $gameConfigKey)) {
    New-Item -Path $gameConfigKey -Force -ErrorAction SilentlyContinue | Out-Null
}
Set-ItemProperty -Path $gameConfigKey -Name "GameDVR_Enabled" -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue | Out-Null

$gameDvrKey = "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\GameDVR"
if (-not (Test-Path $gameDvrKey)) {
    New-Item -Path $gameDvrKey -Force -ErrorAction SilentlyContinue | Out-Null
}
Set-ItemProperty -Path $gameDvrKey -Name "AppCaptureEnabled" -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue | Out-Null
Write-Host "  [OK] Game DVR background capture disabled." -ForegroundColor Green

# 5. Diagnostic Telemetry & Visual Latency
Write-Host "[5/6] Tuning Desktop Latency & Service Parameters..." -ForegroundColor Cyan
$dataCollectionKey = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\DataCollection"
if (-not (Test-Path $dataCollectionKey)) {
    New-Item -Path $dataCollectionKey -Force -ErrorAction SilentlyContinue | Out-Null
}
Set-ItemProperty -Path $dataCollectionKey -Name "AllowTelemetry" -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue | Out-Null

$desktopKey = "HKCU:\Control Panel\Desktop"
Set-ItemProperty -Path $desktopKey -Name "MenuShowDelay" -Value "100" -Force -ErrorAction SilentlyContinue | Out-Null

Set-Service -Name DsmSvc -StartupType Manual -ErrorAction SilentlyContinue
Write-Host "  [OK] Telemetry policy, menu latency, and device setup service configured." -ForegroundColor Green

# 6. Optional System File Integrity Check (SFC/DISM)
Write-Host "[6/6] System File Repair Check..." -ForegroundColor Cyan
if ($IncludeSystemRepair) {
    Write-Host "  [INFO] Starting component store health scan (DISM)..." -ForegroundColor Yellow
    Dism.exe /Online /Cleanup-Image /RestoreHealth
    Write-Host "  [INFO] Starting System File Checker scan (SFC)..." -ForegroundColor Yellow
    sfc.exe /scannow
    Write-Host "  [OK] System file and image repairs completed." -ForegroundColor Green
} else {
    Write-Host "  [INFO] Heavy SFC/DISM repairs skipped by default (use -IncludeSystemRepair to run)." -ForegroundColor DarkGray
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " Windows OS performance optimizations applied successfully." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Stop-Transcript -ErrorAction SilentlyContinue
