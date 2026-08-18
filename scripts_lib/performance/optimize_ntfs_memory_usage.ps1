param()

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Warning "Tuning NTFS parameters requires Administrator privileges. Please run PowerShell as Administrator."
    return
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: NTFS Memory Usage & I/O Latency Optimizer" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

Write-Host "Configuring NTFS memory usage tier to Tier 2 (Enhanced Cache)..." -ForegroundColor Yellow
fsutil behavior set memoryusage 2 2>$null | Out-Null

Write-Host "Disabling NTFS Last Access Timestamp updates..." -ForegroundColor Yellow
fsutil behavior set disablelastaccess 1 2>$null | Out-Null

Write-Host "Disabling 8.3 short name creation for volume performance..." -ForegroundColor Yellow
fsutil behavior set disable8dot3 1 2>$null | Out-Null

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " NTFS filesystem memory pool and I/O parameters optimized." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
