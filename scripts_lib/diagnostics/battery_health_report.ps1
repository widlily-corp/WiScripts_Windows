param(
    [string]$OutputDirectory = "$env:USERPROFILE\Desktop",
    [switch]$IncludeEnergyAudit,
    [switch]$OpenReport
)

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[INFO] Running in Standard User mode. Battery health report is available without elevation." -ForegroundColor Cyan
    if ($IncludeEnergyAudit) {
        Write-Host "[WARN] Full energy audit (/energy) requires Administrator privileges. Run as Administrator to include energy audit." -ForegroundColor Yellow
        $IncludeEnergyAudit = $false
    }
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Battery Health & Wear Diagnostics" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Query hardware battery devices via CIM / WMI
$batteries = Get-CimInstance -ClassName Win32_Battery -ErrorAction SilentlyContinue

if (-not $batteries -or $batteries.Count -eq 0) {
    Write-Host "[WARN] No physical battery detected. System is running on AC mains (Desktop or Server)." -ForegroundColor Yellow
    Write-Host "==========================================================" -ForegroundColor Green
    exit 0
}

foreach ($bat in $batteries) {
    $name = if ($bat.Name) { $bat.Name } else { "Internal Battery" }
    $devId = $bat.DeviceID
    $status = $bat.BatteryStatus
    $charge = $bat.EstimatedChargeRemaining
    $voltage = if ($bat.DesignVoltage) { [math]::Round($bat.DesignVoltage / 1000, 2) } else { "N/A" }
    
    Write-Host "[INFO] Battery Device: $name ($devId)" -ForegroundColor Cyan
    Write-Host "  Current Charge: $charge%" -ForegroundColor White
    Write-Host "  Voltage: $voltage V" -ForegroundColor White
    Write-Host "  Status Code: $status" -ForegroundColor White
}

# Resolve target report paths
if (-not (Test-Path $OutputDirectory)) {
    New-Item -ItemType Directory -Path $OutputDirectory -Force -ErrorAction SilentlyContinue | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$batteryReportPath = Join-Path -Path $OutputDirectory -ChildPath "BatteryReport_$timestamp.html"
$energyReportPath  = Join-Path -Path $OutputDirectory -ChildPath "EnergyReport_$timestamp.html"

# Generate official Windows Battery Health Report
Write-Host "`n[INFO] Generating official Windows Battery Report via powercfg..." -ForegroundColor Cyan
$batteryProc = Start-Process -FilePath "powercfg.exe" -ArgumentList @("/batteryreport", "/output", "`"$batteryReportPath`"") -NoNewWindow -Wait -PassThru -ErrorAction SilentlyContinue

if ($batteryProc.ExitCode -eq 0 -and (Test-Path $batteryReportPath)) {
    Write-Host "[OK] Battery Health Report generated: $batteryReportPath" -ForegroundColor Green
    
    # Optional: Open HTML report in default browser
    if ($OpenReport) {
        Start-Process -FilePath $batteryReportPath
    }
} else {
    Write-Host "[WARN] Failed to generate HTML battery report (powercfg exit code: $($batteryProc.ExitCode))." -ForegroundColor Yellow
}

# Optional 10-second system energy efficiency audit
if ($IncludeEnergyAudit) {
    Write-Host "`n[INFO] Running 10-second System Energy Efficiency Audit..." -ForegroundColor Cyan
    $energyProc = Start-Process -FilePath "powercfg.exe" -ArgumentList @("/energy", "/duration", "10", "/output", "`"$energyReportPath`"") -NoNewWindow -Wait -PassThru -ErrorAction SilentlyContinue
    
    if ($energyProc.ExitCode -eq 0 -and (Test-Path $energyReportPath)) {
        Write-Host "[OK] Energy Efficiency Report generated: $energyReportPath" -ForegroundColor Green
    } else {
        Write-Host "[WARN] Energy efficiency audit finished with warnings/errors (exit code: $($energyProc.ExitCode))." -ForegroundColor Yellow
    }
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "[OK] Battery diagnostics completed successfully." -ForegroundColor Green
