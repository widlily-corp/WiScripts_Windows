param()

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[ERROR] This script requires Administrator privileges. Please run as Administrator."
    exit 1
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Complete Network Stack Reset & Renewal" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

Write-Host "[1/6] Releasing IP address lease..." -ForegroundColor Yellow
ipconfig /release 2>$null | Out-Null
Write-Host "  [OK] IP leases released." -ForegroundColor Green

Write-Host "[2/6] Flushing DNS resolver cache..." -ForegroundColor Yellow
ipconfig /flushdns 2>$null | Out-Null
Write-Host "  [OK] DNS resolver cache flushed." -ForegroundColor Green

Write-Host "[3/6] Renewing IP address lease..." -ForegroundColor Yellow
ipconfig /renew 2>$null | Out-Null
Write-Host "  [OK] IP leases requested from DHCP." -ForegroundColor Green

Write-Host "[4/6] Resetting Winsock catalog..." -ForegroundColor Yellow
netsh winsock reset 2>$null | Out-Null
Write-Host "  [OK] Winsock catalog reset." -ForegroundColor Green

Write-Host "[5/6] Resetting TCP/IP protocol stack..." -ForegroundColor Yellow
netsh int ip reset "$env:TEMP\netsh_reset.log" 2>$null | Out-Null
Write-Host "  [OK] TCP/IP protocol stack reset." -ForegroundColor Green

Write-Host "[6/6] Re-registering DNS client names..." -ForegroundColor Yellow
ipconfig /registerdns 2>$null | Out-Null
Write-Host "  [OK] DNS client names registered." -ForegroundColor Green

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " Network stack reset completed successfully." -ForegroundColor Green
Write-Host " IMPORTANT: Restart your computer for all changes to take effect." -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Green
