param(
    [ValidateSet('RestoreClassic', 'RestoreModern')]$Action = 'RestoreClassic',
    [switch]$DryRun
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Windows 11 Context Menu Style Selector" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "[INFO] Target Action : $Action" -ForegroundColor Cyan
Write-Host "[INFO] DryRun Mode   : $([bool]$DryRun)" -ForegroundColor Cyan

$clsidRoot = "HKCU:\Software\Classes\CLSID\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}"
$clsidInproc = "$clsidRoot\InprocServer32"

if ($Action -eq 'RestoreClassic') {
    Write-Host "`n[INFO] Restoring classic Windows 10 style context menu..." -ForegroundColor Cyan
    
    if ($DryRun) {
        Write-Host "  [DRY-RUN] Would create registry key: $clsidInproc" -ForegroundColor Yellow
        Write-Host "  [DRY-RUN] Would set (Default) property to empty string (bypass XAML context menu)." -ForegroundColor Yellow
        Write-Host "  [DRY-RUN] Would restart Windows Explorer to apply changes." -ForegroundColor Yellow
    } else {
        try {
            if (-not (Test-Path $clsidInproc)) {
                New-Item -Path $clsidInproc -Force -ErrorAction Stop | Out-Null
            }
            Set-ItemProperty -Path $clsidInproc -Name "(Default)" -Value "" -Force -ErrorAction Stop
            Write-Host "  [OK] Classic context menu CLSID override registered." -ForegroundColor Green
        } catch {
            Write-Host "  [ERROR] Failed to write registry key: $($_.Exception.Message)" -ForegroundColor Red
            exit 1
        }

        Write-Host "[INFO] Restarting Windows Explorer process to apply changes..." -ForegroundColor Cyan
        Stop-Process -Name "explorer" -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
        Start-Process "explorer.exe"
        Write-Host "  [OK] Windows Explorer restarted successfully." -ForegroundColor Green
    }
} else {
    Write-Host "`n[INFO] Restoring modern Windows 11 style context menu..." -ForegroundColor Cyan
    
    if ($DryRun) {
        Write-Host "  [DRY-RUN] Would remove registry key override: $clsidRoot" -ForegroundColor Yellow
        Write-Host "  [DRY-RUN] Would restart Windows Explorer to apply changes." -ForegroundColor Yellow
    } else {
        try {
            if (Test-Path $clsidRoot) {
                Remove-Item -Path $clsidRoot -Recurse -Force -ErrorAction Stop
                Write-Host "  [OK] Removed classic context menu CLSID override." -ForegroundColor Green
            } else {
                Write-Host "  [INFO] Registry override does not exist; modern menu is already active." -ForegroundColor Cyan
            }
        } catch {
            Write-Host "  [ERROR] Failed to remove registry key: $($_.Exception.Message)" -ForegroundColor Red
            exit 1
        }

        Write-Host "[INFO] Restarting Windows Explorer process to apply changes..." -ForegroundColor Cyan
        Stop-Process -Name "explorer" -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
        Start-Process "explorer.exe"
        Write-Host "  [OK] Windows Explorer restarted successfully." -ForegroundColor Green
    }
}

Write-Host "`n==========================================================" -ForegroundColor Green
if ($DryRun) {
    Write-Host "[DRY-RUN] Context menu configuration simulation finished." -ForegroundColor Yellow
} else {
    Write-Host "[OK] Context menu configuration completed successfully ($Action)." -ForegroundColor Green
}
Write-Host "==========================================================" -ForegroundColor Green

exit 0
