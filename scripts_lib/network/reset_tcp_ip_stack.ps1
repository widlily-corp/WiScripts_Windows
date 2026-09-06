param()

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[ERROR] This script requires Administrator privileges. Please run as Administrator."
    exit 1
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Full TCP/IP Protocol Stack Reset" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

Write-Host "Resetting IPv4 TCP/IP stack configuration..." -ForegroundColor Yellow
netsh int ip reset "$env:TEMP\netsh_ip_reset.log" 2>$null | Out-Null
Write-Host "  [OK] IPv4 stack reset." -ForegroundColor Green

Write-Host "Resetting IPv6 network configuration..." -ForegroundColor Yellow
netsh int ipv6 reset "$env:TEMP\netsh_ipv6_reset.log" 2>$null | Out-Null
Write-Host "  [OK] IPv6 configuration reset." -ForegroundColor Green

Write-Host "Flushing ARP cache..." -ForegroundColor Yellow
netsh interface ip delete arpcache 2>$null | Out-Null
Write-Host "  [OK] ARP cache flushed." -ForegroundColor Green

Write-Host "Releasing and renewing DHCP leases..." -ForegroundColor Cyan
ipconfig /release 2>$null | Out-Null
ipconfig /renew 2>$null | Out-Null
Write-Host "  [OK] DHCP leases refreshed." -ForegroundColor Green

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " TCP/IP stack reset completed. Please restart your system." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
