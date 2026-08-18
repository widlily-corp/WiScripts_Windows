$hostsPath = "$env:windir\System32\drivers\etc\hosts"

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "      Full Hosts Reset by Antigravity" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

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

Write-Host "Resetting hosts file to Windows defaults..."
$defaultHosts | Set-Content $hostsPath -Force

Write-Host "Flushing DNS Cache..."
ipconfig /flushdns | Out-Null

Write-Host "=============================================" -ForegroundColor Green
Write-Host "Hosts file is now completely CLEAN!" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green

Read-Host "Press Enter to exit..."
