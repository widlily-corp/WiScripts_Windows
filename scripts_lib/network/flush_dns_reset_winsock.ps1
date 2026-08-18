<#
.SYNOPSIS
    Flushes local DNS resolver cache, re-registers DNS, and resets Winsock catalog.
.DESCRIPTION
    Executes ipconfig /flushdns, ipconfig /registerdns, netsh winsock reset,
    and clears NetBIOS cache (nbtstat -R, nbtstat -RR) for network restoration.
.NOTES
    Requires Administrator elevation.
#>

[CmdletBinding()]
param()

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: DNS Flush & Winsock Catalog Reset" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Flush DNS Cache
Write-Host "Flushing DNS resolver cache..." -ForegroundColor Yellow
Clear-DnsClientCache -ErrorAction SilentlyContinue
ipconfig /flushdns

# 2. Re-register DNS names
Write-Host "Re-registering DNS client names..." -ForegroundColor Yellow
ipconfig /registerdns

# 3. Purge NetBIOS name cache
Write-Host "Purging and reloading NetBIOS name cache..." -ForegroundColor Yellow
nbtstat -R
nbtstat -RR

# 4. Reset Winsock Catalog
Write-Host "Resetting Winsock catalog..." -ForegroundColor Cyan
netsh winsock reset

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " DNS Cache flushed and Winsock reset successfully." -ForegroundColor Green
Write-Host " A system restart is recommended to finalize Winsock changes." -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Green
