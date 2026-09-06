param()

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[ERROR] This script requires Administrator privileges. Please run as Administrator."
    exit 1
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: NTFS Memory Usage & I/O Latency Optimizer" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

Write-Host "Configuring NTFS memory usage tier to Tier 2 (Enhanced Cache)..." -ForegroundColor Yellow
$out1 = fsutil behavior set memoryusage 2 2>&1 | Out-String
if ($LASTEXITCODE -eq 0) {
    Write-Host "  [OK] Memory usage set to Tier 2." -ForegroundColor Green
} else {
    Write-Host "  [WARN] fsutil memoryusage notice: $($out1.Trim())" -ForegroundColor DarkGray
}

Write-Host "Disabling NTFS Last Access Timestamp updates..." -ForegroundColor Yellow
$out2 = fsutil behavior set disablelastaccess 1 2>&1 | Out-String
if ($LASTEXITCODE -eq 0) {
    Write-Host "  [OK] Last access timestamps disabled." -ForegroundColor Green
} else {
    Write-Host "  [WARN] fsutil disablelastaccess notice: $($out2.Trim())" -ForegroundColor DarkGray
}

Write-Host "Disabling 8.3 short name creation for volume performance..." -ForegroundColor Yellow
$out3 = fsutil behavior set disable8dot3 1 2>&1 | Out-String
if ($LASTEXITCODE -eq 0) {
    Write-Host "  [OK] 8.3 short name creation disabled." -ForegroundColor Green
} else {
    Write-Host "  [WARN] fsutil disable8dot3 notice: $($out3.Trim())" -ForegroundColor DarkGray
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " NTFS filesystem memory pool and I/O parameters optimized." -ForegroundColor Green
Write-Host " (A system restart may be required for fsutil memory changes to activate)" -ForegroundColor DarkGray
Write-Host "==========================================================" -ForegroundColor Green
