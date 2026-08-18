<#
.SYNOPSIS
    Resets network settings in Windows.
.DESCRIPTION
    Performs full network stack reset: releases/renews IP, flushes DNS,
    resets Winsock catalog and TCP/IP protocol stack.
#>

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Warning "This script requires Administrator privileges. Please run PowerShell as Administrator."
    return
}

Write-Host "Starting full network reset..." -ForegroundColor Cyan

Write-Host "1/6: Releasing IP address..."
ipconfig /release 2>$null | Out-Null

Write-Host "2/6: Flushing DNS cache..."
ipconfig /flushdns 2>$null | Out-Null

Write-Host "3/6: Renewing IP address..."
ipconfig /renew 2>$null | Out-Null

Write-Host "4/6: Resetting Winsock catalog..."
netsh winsock reset 2>$null | Out-Null

Write-Host "5/6: Resetting TCP/IP stack..."
netsh int ip reset 2>$null | Out-Null

Write-Host "6/6: Registering DNS..."
ipconfig /registerdns 2>$null | Out-Null

Write-Host "=======================================================" -ForegroundColor Green
Write-Host "Network reset complete!" -ForegroundColor Green
Write-Host "IMPORTANT: Restart your computer for all changes to take full effect." -ForegroundColor Yellow
Write-Host "=======================================================" -ForegroundColor Green
