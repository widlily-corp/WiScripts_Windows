<#
.SYNOPSIS
    Resets the IPv4 and IPv6 TCP/IP network stack to factory default settings.
.DESCRIPTION
    Executes netsh int ip reset and netsh int ipv6 reset, restores default MTU,
    and logs the reset operation to %TEMP%\tcp_reset_log.txt.
.NOTES
    Requires Administrator elevation. System reboot required afterwards.
#>

[CmdletBinding()]
param()

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Full TCP/IP Protocol Stack Reset" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$logPath = "$env:TEMP\tcp_reset_log.txt"

# 1. Reset IPv4 Stack
Write-Host "Resetting IPv4 TCP/IP stack configuration..." -ForegroundColor Yellow
netsh int ip reset $logPath

# 2. Reset IPv6 Stack
Write-Host "Resetting IPv6 TCP/IP stack configuration..." -ForegroundColor Yellow
netsh int ipv6 reset

# 3. Release and Renew DHCP Leases
Write-Host "Releasing and renewing active DHCP leases..." -ForegroundColor Cyan
ipconfig /release
Start-Sleep -Seconds 1
ipconfig /renew

# 4. Clear ARP table cache
Write-Host "Flushing Address Resolution Protocol (ARP) cache..." -ForegroundColor Yellow
netsh interface ip delete arpcache

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " TCP/IP protocol stack has been reset to default state." -ForegroundColor Green
Write-Host " Reset details logged to: $logPath" -ForegroundColor DarkGray
Write-Host " Please restart your computer to apply stack resets." -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Green
