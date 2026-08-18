param()

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Windows Icon & Thumbnail Cache Rebuilder" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

Write-Host "Terminating Windows Explorer process..." -ForegroundColor Yellow
Stop-Process -Name "explorer" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

Write-Host "Purging icon and thumbnail database files..." -ForegroundColor Yellow
$iconCachePath = "$env:LOCALAPPDATA\IconCache.db"
if (Test-Path $iconCachePath) {
    Remove-Item -Path $iconCachePath -Force -ErrorAction SilentlyContinue
}

$explorerCacheDir = "$env:LOCALAPPDATA\Microsoft\Windows\Explorer"
if (Test-Path $explorerCacheDir) {
    Get-ChildItem -Path $explorerCacheDir -Filter "thumbcache_*.db" | Remove-Item -Force -ErrorAction SilentlyContinue
    Get-ChildItem -Path $explorerCacheDir -Filter "iconcache_*.db" | Remove-Item -Force -ErrorAction SilentlyContinue
}

Write-Host "Restarting Windows Explorer..." -ForegroundColor Cyan
Start-Process "explorer.exe"

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " Icon and thumbnail cache successfully rebuilt." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
