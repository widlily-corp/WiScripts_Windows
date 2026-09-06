param()

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[ERROR] This script requires Administrator privileges. Please run as Administrator."
    exit 1
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Deep Network & Component Restoration" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

Write-Host "[1/5] Disabling IPv6 protocol..."
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip6\Parameters" -Name "DisabledComponents" -PropertyType DWord -Value 255 -Force -ErrorAction SilentlyContinue | Out-Null

Write-Host "[2/5] Setting interface metrics..."
$WiFi = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object {
    $_.PhysicalMediaType -eq 'Native 802.11' -or
    $_.MediaType -like '*802.11*' -or
    $_.InterfaceDescription -like '*Qualcomm FastConnect*' -or
    $_.InterfaceDescription -like '*Wireless*' -or
    $_.InterfaceDescription -like '*Wi-Fi*' -or
    $_.Name -like '*Wi-Fi*' -or
    $_.Name -like '*Беспроводная*' -or
    $_.InterfaceAlias -like '*Wi-Fi*' -or
    $_.InterfaceAlias -like '*Беспроводная*'
} | Select-Object -First 1

if (-not $WiFi) {
    $WiFi = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' } | Select-Object -First 1
}

if ($WiFi) {
    Write-Host "  Detected primary adapter: $($WiFi.Name) ($($WiFi.InterfaceDescription))" -ForegroundColor DarkGray
    Set-NetIPInterface -InterfaceIndex $WiFi.InterfaceIndex -InterfaceMetric 1 -ErrorAction SilentlyContinue
    $OtherAdapters = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.InterfaceIndex -ne $WiFi.InterfaceIndex }
    foreach ($Adapter in $OtherAdapters) {
        Set-NetIPInterface -InterfaceIndex $Adapter.InterfaceIndex -InterfaceMetric 100 -ErrorAction SilentlyContinue
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
    Set-DnsClientServerAddress -InterfaceIndex $WiFi.InterfaceIndex -ServerAddresses ("8.8.8.8","77.88.8.8") -ErrorAction SilentlyContinue
}

Write-Host "[5/5] Resetting Winsock and TCP/IP stack..."
netsh winsock reset 2>$null | Out-Null
netsh int ip reset "$env:TEMP\netsh_reset.log" 2>$null | Out-Null
ipconfig /flushdns 2>$null | Out-Null

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " All deep network fixes applied successfully." -ForegroundColor Green
Write-Host " Please RESTART your computer for all changes to take effect." -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Green
