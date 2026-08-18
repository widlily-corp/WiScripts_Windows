param()

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Warning "Modifying system hosts file requires Administrator privileges. Please run PowerShell as Administrator."
    return
}

$hostsPath = "$env:windir\System32\drivers\etc\hosts"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: System Hosts File Reset & Restoration" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$defaultHosts = @"
# Copyright (c) 1993-2009 Microsoft Corp.
#
# This is a sample HOSTS file used by Microsoft TCP/IP for Windows.
#
# This file contains the mappings of IP addresses to host names. Each
# entry should be kept on an individual line. The IP address should
# be placed in the first column followed by the corresponding host name.
# The IP address and the host name should be separated by at least one
# space.
#
# Additionally, comments (such as these) may be inserted on individual
# lines or following the machine name denoted by a '#' symbol.
#
# For example:
#
#      102.54.94.97     rhino.acme.com          # source server
#       38.25.63.10     x.acme.com              # x client host

# localhost name resolution is handled within DNS itself.
#	127.0.0.1       localhost
#	::1             localhost
"@

Write-Host "Writing clean default hosts file..."
$defaultHosts | Set-Content $hostsPath -Force -ErrorAction SilentlyContinue

Write-Host "Flushing DNS resolver cache..."
ipconfig /flushdns 2>$null | Out-Null

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " Hosts file restored to clean Microsoft default state." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
