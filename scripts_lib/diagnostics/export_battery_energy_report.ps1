<#
.SYNOPSIS
    Generates detailed HTML Battery and Energy efficiency diagnostic reports.
.DESCRIPTION
    Executes powercfg /batteryreport and powercfg /energy to compile comprehensive
    hardware battery health, cycle count, capacity degradation, and energy drain telemetry.
.NOTES
    Requires Administrator elevation for energy analysis.
#>

[CmdletBinding()]
param(
    [string]$OutputDirectory = "$env:USERPROFILE\Desktop"
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Battery Health & Energy Efficiency Diagnostics" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

if (-not (Test-Path $OutputDirectory)) {
    New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
}

$batteryReportPath = Join-Path -Path $OutputDirectory -ChildPath "WiScripts_BatteryReport.html"
$energyReportPath = Join-Path -Path $OutputDirectory -ChildPath "WiScripts_EnergyReport.html"

# 1. Generate Battery Health Report
Write-Host "Generating Battery Health & Lifetime Telemetry Report..." -ForegroundColor Yellow
$batteryProc = Start-Process -FilePath "powercfg.exe" -ArgumentList @("/batteryreport", "/output", "`"$batteryReportPath`"") -NoNewWindow -Wait -PassThru

if ($batteryProc.ExitCode -eq 0) {
    Write-Host "[OK] Battery report saved to: $batteryReportPath" -ForegroundColor Green
} else {
    Write-Host "[WARN] Battery report could not be generated (Device may not have a battery)." -ForegroundColor DarkYellow
}

# 2. Run Energy Efficiency Audit (Duration: 60s)
Write-Host "Running 60-second Energy Efficiency & Power Drain Audit..." -ForegroundColor Cyan
Write-Host "Please avoid heavy workloads while energy telemetry is sampled..." -ForegroundColor DarkGray
$energyProc = Start-Process -FilePath "powercfg.exe" -ArgumentList @("/energy", "/duration", "60", "/output", "`"$energyReportPath`"") -NoNewWindow -Wait -PassThru

if ($energyProc.ExitCode -eq 0) {
    Write-Host "[OK] Energy report saved to: $energyReportPath" -ForegroundColor Green
} else {
    Write-Host "[INFO] Energy analysis completed with exit code: $($energyProc.ExitCode)" -ForegroundColor Cyan
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " Diagnostic reports export complete." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
