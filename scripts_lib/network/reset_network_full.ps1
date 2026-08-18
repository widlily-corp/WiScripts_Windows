param()

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Warning "Resetting network configuration requires Administrator privileges. Please run PowerShell as Administrator."
    return
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Complete Network Stack Reset & Renewal" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

Write-Host "1/6: Releasing IP address lease..."
ipconfig /release 2>$null | Out-Null

Write-Host "2/6: Flushing DNS resolver cache..."
ipconfig /flushdns 2>$null | Out-Null

Write-Host "3/6: Renewing IP address lease..."
ipconfig /renew 2>$null | Out-Null

Write-Host "4/6: Resetting Winsock catalog..."
netsh winsock reset 2>$null | Out-Null

Write-Host "5/6: Resetting TCP/IP protocol stack..."
netsh int ip reset 2>$null | Out-Null

Write-Host "6/6: Re-registering DNS client names..."
ipconfig /registerdns 2>$null | Out-Null

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " Network stack reset completed successfully." -ForegroundColor Green
Write-Host " IMPORTANT: Restart your computer for all changes to take effect." -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Green
