<#
.SYNOPSIS
    Optimizes NTFS file system memory cache and disables 8.3 short names and last access updates.
.DESCRIPTION
    Increases NTFS paged pool cache memory quota (fsutil behavior set memoryusage 2),
    disables 8.3 short name generation on non-system volumes, and disables NTFS last
    access time updates to eliminate unnecessary disk write operations.
.NOTES
    Requires Administrator elevation. System reboot required for memory usage changes.
#>

[CmdletBinding()]
param()

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: NTFS Memory Usage & I/O Latency Optimizer" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Increase NTFS paged pool memory cache
Write-Host "Configuring NTFS memory usage tier to Tier 2 (Enhanced Cache)..." -ForegroundColor Yellow
fsutil behavior set memoryusage 2

# 2. Disable NTFS Last Access Time Updates
Write-Host "Disabling NTFS Last Access Timestamp writes..." -ForegroundColor Cyan
fsutil behavior set disablelastaccess 1

# 3. Disable 8.3 short name generation
Write-Host "Disabling legacy 8.3 short name creation..." -ForegroundColor Cyan
fsutil behavior set disable8dot3 1

# 4. Display active filesystem configuration
Write-Host "`nCurrent Filesystem Behavior Settings:" -ForegroundColor DarkGray
fsutil behavior query memoryusage
fsutil behavior query disablelastaccess
fsutil behavior query disable8dot3

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " NTFS filesystem memory and I/O parameters optimized." -ForegroundColor Green
Write-Host " Please restart your system for memory tier changes to take effect." -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Green
