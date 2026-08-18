param(
    [string]$OutputDirectory = "$env:USERPROFILE\Desktop",
    [switch]$IncludeEnergyAudit
)

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    throw "Generating energy diagnostics and reports requires Administrator privileges. Please run PowerShell as Administrator."
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Battery Health & Energy Diagnostics" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

if (-not (Test-Path $OutputDirectory)) {
    New-Item -ItemType Directory -Path $OutputDirectory -Force -ErrorAction SilentlyContinue | Out-Null
}

$batteryReportPath = Join-Path -Path $OutputDirectory -ChildPath "WiScripts_BatteryReport.html"
$energyReportPath  = Join-Path -Path $OutputDirectory -ChildPath "WiScripts_EnergyReport.html"

Write-Host "Generating Battery Health Report..." -ForegroundColor Yellow
$batteryProc = Start-Process -FilePath "powercfg.exe" -ArgumentList @("/batteryreport", "/output", "`"$batteryReportPath`"") -NoNewWindow -Wait -PassThru -ErrorAction SilentlyContinue

if ($batteryProc.ExitCode -eq 0) {
    Write-Host "[OK] Battery report saved to: $batteryReportPath" -ForegroundColor Green
} else {
    Write-Host "[WARN] Battery report could not be generated (Device may be a desktop system)." -ForegroundColor DarkYellow
}

if ($IncludeEnergyAudit) {
    Write-Host "Running 10-second Energy Efficiency Audit..." -ForegroundColor Cyan
    $energyProc = Start-Process -FilePath "powercfg.exe" -ArgumentList @("/energy", "/duration", "10", "/output", "`"$energyReportPath`"") -NoNewWindow -Wait -PassThru -ErrorAction SilentlyContinue
    if ($energyProc.ExitCode -eq 0) {
        Write-Host "[OK] Energy report saved to: $energyReportPath" -ForegroundColor Green
    }
}

Write-Host "==========================================================" -ForegroundColor Green
