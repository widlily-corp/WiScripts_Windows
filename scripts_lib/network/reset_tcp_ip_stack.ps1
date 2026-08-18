param()

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Warning "Resetting TCP/IP stack requires Administrator privileges. Please run PowerShell as Administrator."
    return
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Full TCP/IP Protocol Stack Reset" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

Write-Host "Resetting IPv4 TCP/IP stack configuration..." -ForegroundColor Yellow
netsh int ip reset 2>$null | Out-Null

Write-Host "Resetting IPv6 network configuration..." -ForegroundColor Yellow
netsh int ipv6 reset 2>$null | Out-Null

Write-Host "Flushing ARP cache..." -ForegroundColor Yellow
netsh interface ip delete arpcache 2>$null | Out-Null

Write-Host "Releasing and renewing DHCP leases..." -ForegroundColor Cyan
ipconfig /release 2>$null | Out-Null
ipconfig /renew 2>$null | Out-Null

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " TCP/IP stack reset completed. Please restart your system." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
