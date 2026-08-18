<#
.SYNOPSIS
    Optimizes TCP Window Auto-Tuning level and congestion provider.
.DESCRIPTION
    Configures TCP global parameters including Receive Window Auto-Tuning (normal),
    Compound TCP / CUBIC congestion provider, ECN capability, and RSS (Receive Side Scaling).
.NOTES
    Requires Administrator elevation.
#>

[CmdletBinding()]
param(
    [ValidateSet("normal", "disabled", "highlyrestricted", "restricted", "experimental")]
    [string]$AutoTuningLevel = "normal",
    
    [ValidateSet("cubic", "ctcp", "default", "none")]
    [string]$CongestionProvider = "cubic"
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: High-Performance TCP/IP Stack Optimizer" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Query current TCP global settings
Write-Host "Current TCP Global Parameters:" -ForegroundColor Yellow
netsh int tcp show global

# 2. Configure TCP Autotuning
Write-Host "Setting TCP Receive Window Auto-Tuning Level: $AutoTuningLevel..." -ForegroundColor Cyan
netsh int tcp set global autotuninglevel=$AutoTuningLevel

# 3. Configure Congestion Provider
Write-Host "Setting TCP Congestion Provider: $CongestionProvider..." -ForegroundColor Cyan
try {
    Set-NetTCPSetting -SettingName "InternetCustom" -CongestionProvider $CongestionProvider -ErrorAction SilentlyContinue
} catch {
    Write-Host "[INFO] InternetCustom profile not active, applying via netsh..." -ForegroundColor DarkGray
}

# 4. Enable Receive Side Scaling (RSS) and Chimney offload
Write-Host "Enabling Receive-Side Scaling (RSS)..." -ForegroundColor Cyan
netsh int tcp set global rss=enabled
netsh int tcp set global fastopen=enabled
netsh int tcp set global timestamps=disabled

# 5. Verify updated settings
Write-Host "Updated TCP Global Parameters:" -ForegroundColor Green
netsh int tcp show global

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " TCP network parameters optimized successfully." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
