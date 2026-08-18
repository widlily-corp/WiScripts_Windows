<#
.SYNOPSIS
    Rebuilds the Windows Explorer icon cache and thumbnail database.
.DESCRIPTION
    Terminates Windows Explorer, deletes corrupted IconCache.db and thumbnail
    cache databases across LocalAppData Explorer storage, and restarts Explorer.
.NOTES
    Requires Administrator elevation or current user execution.
#>

[CmdletBinding()]
param()

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Windows Icon & Thumbnail Cache Rebuilder" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Stop Windows Explorer process
Write-Host "Terminating Windows Explorer process..." -ForegroundColor Yellow
Stop-Process -Name "explorer" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# 2. Delete legacy IconCache.db in LocalAppData
$legacyIconCache = "$env:LOCALAPPDATA\IconCache.db"
if (Test-Path -Path $legacyIconCache) {
    Write-Host "Deleting legacy icon cache: $legacyIconCache" -ForegroundColor Yellow
    Remove-Item -Path $legacyIconCache -Force -ErrorAction SilentlyContinue
}

# 3. Purge Windows 10/11 iconcache and thumbcache database files
$explorerCacheDir = "$env:LOCALAPPDATA\Microsoft\Windows\Explorer"
if (Test-Path -Path $explorerCacheDir) {
    Write-Host "Purging modern Explorer icon and thumbnail databases..." -ForegroundColor Yellow
    $cacheFiles = Get-ChildItem -Path $explorerCacheDir -Include "iconcache*.db", "thumbcache*.db" -Recurse -Force -ErrorAction SilentlyContinue
    foreach ($file in $cacheFiles) {
        try {
            Remove-Item -Path $file.FullName -Force -ErrorAction SilentlyContinue
            Write-Host "  Removed: $($file.Name)" -ForegroundColor DarkGray
        } catch {
            Write-Host "  [WARN] In use: $($file.Name)" -ForegroundColor DarkYellow
        }
    }
}

# 4. Restart Explorer
Write-Host "Restarting Windows Explorer..." -ForegroundColor Cyan
Start-Process -FilePath "$env:SystemRoot\explorer.exe"

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " Icon and thumbnail cache rebuild completed." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
