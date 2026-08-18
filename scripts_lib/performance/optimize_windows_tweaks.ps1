Start-Transcript -Path "C:\Users\Widlily\Documents\projects\optimize_log.txt" -Force

Write-Host "=== 1. Removing Microsoft PC Manager ===" -ForegroundColor Cyan
try {
    $packages = Get-AppxPackage *PCManager*
    if ($packages) {
        $packages | Remove-AppxPackage -ErrorAction Stop
        Write-Host "Successfully removed." -ForegroundColor Green
    } else {
        Write-Host "App not found."
    }
} catch {
    Write-Host "Error removing: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "=== 2. Cleaning Startup ===" -ForegroundColor Cyan
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
            foreach ($match in $matches) {
                Remove-ItemProperty -Path $runKey -Name $match.Name -Force -ErrorAction Stop
                Write-Host "Removed from startup (wildcard): $($match.Name)" -ForegroundColor Green
            }
        } else {
            $val = Get-ItemProperty -Path $runKey -Name $item -ErrorAction SilentlyContinue
            if ($val) {
                Remove-ItemProperty -Path $runKey -Name $item -Force -ErrorAction Stop
                Write-Host "Removed from startup: ${item}" -ForegroundColor Green
            }
        }
    } catch {
        Write-Host "Failed to remove ${item}: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

Write-Host "=== 3. Restoring system files ===" -ForegroundColor Cyan
try {
    Write-Host "Starting DISM RestoreHealth..."
    Dism /Online /Cleanup-Image /RestoreHealth
    Write-Host "Starting SFC Scannow..."
    sfc /scannow
} catch {
    Write-Host "Error checking components: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "=== 4. Resetting network components ===" -ForegroundColor Cyan
try {
    netsh winsock reset
    netsh int ip reset
    Write-Host "Network reset." -ForegroundColor Green
} catch {
    Write-Host "Error resetting network: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "=== 5. Optimizing services ===" -ForegroundColor Cyan
try {
    Set-Service -Name DsmSvc -StartupType Manual
    Write-Host "DsmSvc set to Manual." -ForegroundColor Green
} catch {
    Write-Host "Failed to modify DsmSvc: $($_.Exception.Message)" -ForegroundColor Yellow
}

try {
    Restart-Service -Name wscsvc -Force
    Restart-Service -Name SecurityHealthService -Force -ErrorAction SilentlyContinue
    Write-Host "Security services restarted." -ForegroundColor Green
} catch {
    Write-Host "Failed to restart security services: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host "=== OPTIMIZATION COMPLETE ===" -ForegroundColor Green
Stop-Transcript
