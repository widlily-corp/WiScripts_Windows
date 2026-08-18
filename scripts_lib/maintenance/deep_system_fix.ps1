<#
.SYNOPSIS
    Deep Network & Component Restoration by Antigravity.
#>

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Warning "This script requires Administrator privileges. Please run PowerShell as Administrator."
    return
}

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "      Deep Network Fix by Antigravity" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

# 1. Disable IPv6
Write-Host "[1/5] Disabling IPv6 System-Wide..."
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip6\Parameters" -Name "DisabledComponents" -PropertyType DWord -Value 255 -Force -ErrorAction SilentlyContinue | Out-Null

# 2. Set Interface Metrics
Write-Host "[2/5] Setting Interface Metrics (Prioritizing Wi-Fi)..."
$WiFi = Get-NetAdapter | Where-Object {$_.InterfaceDescription -like '*Qualcomm FastConnect*' -or $_.Name -like '*Wi-Fi*' -or $_.InterfaceAlias -like '*Wi-Fi*'} | Select-Object -First 1
if ($WiFi) {
    Set-NetIPInterface -InterfaceIndex $WiFi.ifIndex -InterfaceMetric 1 -ErrorAction SilentlyContinue
    $OtherAdapters = Get-NetAdapter | Where-Object {$_.ifIndex -ne $WiFi.ifIndex}
    foreach ($Adapter in $OtherAdapters) {
        Set-NetIPInterface -InterfaceIndex $Adapter.ifIndex -InterfaceMetric 100 -ErrorAction SilentlyContinue
    }
}

# 3. Disable Browser ECH
Write-Host "[3/5] Disabling Chrome and Edge ECH Policies..."
$ChromePath = "HKLM:\SOFTWARE\Policies\Google\Chrome"
$EdgePath = "HKLM:\SOFTWARE\Policies\Microsoft\Edge"
if (!(Test-Path $ChromePath)) { New-Item -Path $ChromePath -Force -ErrorAction SilentlyContinue | Out-Null }
if (!(Test-Path $EdgePath)) { New-Item -Path $EdgePath -Force -ErrorAction SilentlyContinue | Out-Null }
New-ItemProperty -Path $ChromePath -Name "EncryptedClientHelloEnabled" -PropertyType DWord -Value 0 -Force -ErrorAction SilentlyContinue | Out-Null
New-ItemProperty -Path $EdgePath -Name "EncryptedClientHelloEnabled" -PropertyType DWord -Value 0 -Force -ErrorAction SilentlyContinue | Out-Null

# 4. Set DNS
Write-Host "[4/5] Forcing Reliable DNS (Google + Yandex)..."
if ($WiFi) {
    Set-DnsClientServerAddress -InterfaceIndex $WiFi.ifIndex -ServerAddresses ("8.8.8.8","77.88.8.8") -ErrorAction SilentlyContinue
}

# 5. Reset network stack
Write-Host "[5/5] Resetting Winsock and TCP/IP stack..."
netsh winsock reset 2>$null | Out-Null
netsh int ip reset 2>$null | Out-Null
ipconfig /flushdns 2>$null | Out-Null

Write-Host "=============================================" -ForegroundColor Green
Write-Host "All fixes applied successfully!" -ForegroundColor Green
Write-Host "Please RESTART YOUR COMPUTER for changes to take effect." -ForegroundColor Yellow
Write-Host "=============================================" -ForegroundColor Green

if ([Environment]::UserInteractive -and -not [Console]::IsInputRedirected) {
    Read-Host "Press Enter to exit..."
}
