param()

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    throw "Windows OS optimization tweaks require Administrator privileges. Please run PowerShell as Administrator."
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

Write-Host "=== 1. Removing Microsoft PC Manager ===" -ForegroundColor Cyan
try {
    $packages = Get-AppxPackage *PCManager* -ErrorAction SilentlyContinue
    if ($packages) {
        $packages | Remove-AppxPackage -ErrorAction SilentlyContinue
        Write-Host "Successfully removed PC Manager." -ForegroundColor Green
    } else {
        Write-Host "PC Manager not installed."
    }
} catch {
    Write-Host "Notice: $($_.Exception.Message)" -ForegroundColor DarkGray
}

Write-Host "=== 2. Cleaning Startup Registry Items ===" -ForegroundColor Cyan
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
                Write-Host "Removed from startup: $($m.Name)" -ForegroundColor Green
            }
        } else {
            $val = Get-ItemProperty -Path $runKey -Name $item -ErrorAction SilentlyContinue
            if ($val) {
                Remove-ItemProperty -Path $runKey -Name $item -Force -ErrorAction SilentlyContinue
                Write-Host "Removed from startup: ${item}" -ForegroundColor Green
            }
        }
    } catch {
        Write-Host "Notice for ${item}: $($_.Exception.Message)" -ForegroundColor DarkGray
    }
}

if ($isAdmin) {
    Write-Host "=== 3. Restoring System Files (SFC/DISM) ===" -ForegroundColor Cyan
    Dism /Online /Cleanup-Image /RestoreHealth 2>$null | Out-Null
    sfc /scannow 2>$null | Out-Null
    
    Write-Host "=== 4. Resetting Network Stack ===" -ForegroundColor Cyan
    netsh winsock reset 2>$null | Out-Null
    netsh int ip reset 2>$null | Out-Null
    
    Write-Host "=== 5. Optimizing Services ===" -ForegroundColor Cyan
    Set-Service -Name DsmSvc -StartupType Manual -ErrorAction SilentlyContinue
    Restart-Service -Name SecurityHealthService -Force -ErrorAction SilentlyContinue
}

Write-Host "=== OPTIMIZATION COMPLETE ===" -ForegroundColor Green
Stop-Transcript -ErrorAction SilentlyContinue
