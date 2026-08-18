<#
.SYNOPSIS
    Resets network settings in Windows.
.DESCRIPTION
    This script performs a full reset of the network configuration, including:
    - Releasing and renewing the IP address
    - Flushing the DNS cache
    - Resetting the Winsock catalog
    - Resetting the TCP/IP stack
    
    It requires Administrator privileges to run successfully.
#>

# Check for Administrator privileges
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Error "This script requires Administrator privileges. Please open PowerShell as Administrator and run it again."
    Exit
}

Write-Host "Starting full network reset..." -ForegroundColor Cyan

Write-Host "1/6: Releasing IP address..."
ipconfig /release | Out-Null

Write-Host "2/6: Flushing DNS cache..."
ipconfig /flushdns | Out-Null

Write-Host "3/6: Renewing IP address..."
ipconfig /renew | Out-Null

Write-Host "4/6: Resetting Winsock catalog..."
netsh winsock reset | Out-Null

Write-Host "5/6: Resetting TCP/IP stack..."
netsh int ip reset | Out-Null

Write-Host "6/6: Registering DNS..."
ipconfig /registerdns | Out-Null

Write-Host "=======================================================" -ForegroundColor Green
Write-Host "Network reset complete!" -ForegroundColor Green
Write-Host "IMPORTANT: You MUST restart your computer for the changes to take effect." -ForegroundColor Yellow
Write-Host "=======================================================" -ForegroundColor Green
