Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "      Deep Network Fix by Antigravity" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

# 1. Disable IPv6
Write-Host "[1/5] Disabling IPv6 System-Wide..."
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip6\Parameters" -Name "DisabledComponents" -PropertyType DWord -Value 255 -Force | Out-Null

# 2. Set Interface Metrics
Write-Host "[2/5] Setting Interface Metrics (Prioritizing Wi-Fi)..."
$WiFi = Get-NetAdapter | Where-Object {$_.InterfaceDescription -like '*Qualcomm FastConnect*' -or $_.Name -like '*Wi-Fi*'} | Select-Object -First 1
if ($WiFi) {
    Set-NetIPInterface -InterfaceIndex $WiFi.ifIndex -InterfaceMetric 1
}
$OtherAdapters = Get-NetAdapter | Where-Object {$_.ifIndex -ne $WiFi.ifIndex}
foreach ($Adapter in $OtherAdapters) {
    Set-NetIPInterface -InterfaceIndex $Adapter.ifIndex -InterfaceMetric 100
}

# 3. Disable Browser ECH
Write-Host "[3/5] Disabling Chrome and Edge ECH Policies..."
$ChromePath = "HKLM:\SOFTWARE\Policies\Google\Chrome"
$EdgePath = "HKLM:\SOFTWARE\Policies\Microsoft\Edge"
if (!(Test-Path $ChromePath)) { New-Item -Path $ChromePath -Force | Out-Null }
if (!(Test-Path $EdgePath)) { New-Item -Path $EdgePath -Force | Out-Null }
New-ItemProperty -Path $ChromePath -Name "EncryptedClientHelloEnabled" -PropertyType DWord -Value 0 -Force | Out-Null
New-ItemProperty -Path $EdgePath -Name "EncryptedClientHelloEnabled" -PropertyType DWord -Value 0 -Force | Out-Null

# 4. Set DNS
Write-Host "[4/5] Forcing Reliable DNS (Google + Yandex)..."
if ($WiFi) {
    Set-DnsClientServerAddress -InterfaceIndex $WiFi.ifIndex -ServerAddresses ("8.8.8.8","77.88.8.8")
}

# 5. Reset network stack
Write-Host "[5/5] Resetting Winsock and TCP/IP stack..."
netsh winsock reset | Out-Null
netsh int ip reset | Out-Null
ipconfig /flushdns | Out-Null

Write-Host "=============================================" -ForegroundColor Green
Write-Host "All fixes applied successfully!" -ForegroundColor Green
Write-Host "Please RESTART YOUR COMPUTER for changes to take effect." -ForegroundColor Yellow
Write-Host "=============================================" -ForegroundColor Green

Read-Host "Press Enter to exit..."
