param(
    [string]$AutoTuningLevel = "normal",
    [string]$CongestionProvider = "cubic"
)

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Warning "Configuring TCP stack parameters requires Administrator privileges. Please run PowerShell as Administrator."
    return
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: High-Performance TCP/IP Stack Optimizer" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

Write-Host "Configuring TCP Window Auto-Tuning Level: $AutoTuningLevel..." -ForegroundColor Yellow
netsh int tcp set global autotuninglevel=$AutoTuningLevel 2>$null | Out-Null

Write-Host "Enabling Receive-Side Scaling (RSS)..." -ForegroundColor Yellow
netsh int tcp set global rss=enabled 2>$null | Out-Null

Write-Host "Enabling Fast Open (TCP Fast Open)..." -ForegroundColor Yellow
netsh int tcp set global fastopen=enabled 2>$null | Out-Null

Write-Host "Setting Congestion Provider: $CongestionProvider..." -ForegroundColor Yellow
netsh int tcp set supplemental template=internet congestionprovider=$CongestionProvider 2>$null | Out-Null

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " TCP stack parameters optimized for high throughput." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
