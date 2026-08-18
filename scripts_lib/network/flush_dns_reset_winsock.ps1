param()

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Warning "Resetting Winsock catalog requires Administrator privileges. Please run PowerShell as Administrator."
    return
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: DNS Flush & Winsock Catalog Reset" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

Write-Host "Flushing DNS resolver cache..." -ForegroundColor Yellow
ipconfig /flushdns 2>$null | Out-Null

Write-Host "Re-registering DNS client names..." -ForegroundColor Yellow
ipconfig /registerdns 2>$null | Out-Null

Write-Host "Clearing NetBIOS name cache..." -ForegroundColor Yellow
nbtstat -R 2>$null | Out-Null

Write-Host "Resetting Winsock catalog..." -ForegroundColor Cyan
netsh winsock reset 2>$null | Out-Null

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " DNS cache flushed and Winsock catalog reset." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
