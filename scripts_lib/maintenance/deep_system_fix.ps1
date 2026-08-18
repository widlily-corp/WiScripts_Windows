param()

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    throw "Deep system repairs require Administrator privileges. Please run PowerShell as Administrator."
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Deep Network & Component Restoration" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

Write-Host "[1/5] Disabling IPv6 protocol..."
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip6\Parameters" -Name "DisabledComponents" -PropertyType DWord -Value 255 -Force -ErrorAction SilentlyContinue | Out-Null

Write-Host "[2/5] Setting interface metrics..."
$WiFi = Get-NetAdapter | Where-Object {$_.InterfaceDescription -like '*Qualcomm FastConnect*' -or $_.Name -like '*Wi-Fi*' -or $_.InterfaceAlias -like '*Wi-Fi*'} | Select-Object -First 1
if ($WiFi) {
    Set-NetIPInterface -InterfaceIndex $WiFi.ifIndex -InterfaceMetric 1 -ErrorAction SilentlyContinue
    $OtherAdapters = Get-NetAdapter | Where-Object {$_.ifIndex -ne $WiFi.ifIndex}
    foreach ($Adapter in $OtherAdapters) {
        Set-NetIPInterface -InterfaceIndex $Adapter.ifIndex -InterfaceMetric 100 -ErrorAction SilentlyContinue
    }
}

Write-Host "[3/5] Disabling browser ECH policies..."
$ChromePath = "HKLM:\SOFTWARE\Policies\Google\Chrome"
$EdgePath = "HKLM:\SOFTWARE\Policies\Microsoft\Edge"
if (!(Test-Path $ChromePath)) { New-Item -Path $ChromePath -Force -ErrorAction SilentlyContinue | Out-Null }
if (!(Test-Path $EdgePath)) { New-Item -Path $EdgePath -Force -ErrorAction SilentlyContinue | Out-Null }
New-ItemProperty -Path $ChromePath -Name "EncryptedClientHelloEnabled" -PropertyType DWord -Value 0 -Force -ErrorAction SilentlyContinue | Out-Null
New-ItemProperty -Path $EdgePath -Name "EncryptedClientHelloEnabled" -PropertyType DWord -Value 0 -Force -ErrorAction SilentlyContinue | Out-Null

Write-Host "[4/5] Configuring reliable DNS endpoints..."
if ($WiFi) {
    Set-DnsClientServerAddress -InterfaceIndex $WiFi.ifIndex -ServerAddresses ("8.8.8.8","77.88.8.8") -ErrorAction SilentlyContinue
}

Write-Host "[5/5] Resetting Winsock and TCP/IP stack..."
netsh winsock reset 2>$null | Out-Null
netsh int ip reset 2>$null | Out-Null
ipconfig /flushdns 2>$null | Out-Null

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " All deep network fixes applied successfully." -ForegroundColor Green
Write-Host " Please RESTART your computer for all changes to take effect." -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Green
