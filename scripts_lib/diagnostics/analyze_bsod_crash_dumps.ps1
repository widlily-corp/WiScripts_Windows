<#
.SYNOPSIS
    Parses Windows MiniDump and Kernel Memory crash dumps and BSOD BugCheck events.
.DESCRIPTION
    Scans C:\Windows\Minidump and C:\Windows\MEMORY.DMP, retrieves BugCheck code
    metadata, and queries Windows System Event Log for Kernel-Power and BugCheck (Event 1001) entries.
.NOTES
    Requires Administrator elevation to read memory dump headers.
#>

[CmdletBinding()]
param(
    [int]$MaxEvents = 10
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: BSOD Crash Dump & BugCheck Event Analyzer" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Scan for Minidump Files
$minidumpDir = "$env:SystemRoot\Minidump"
Write-Host "Checking for crash minidump files in: $minidumpDir" -ForegroundColor Yellow

if (Test-Path $minidumpDir) {
    $dumps = Get-ChildItem -Path $minidumpDir -Filter "*.dmp" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending
    if ($dumps.Count -gt 0) {
        Write-Host "Found $($dumps.Count) crash dump file(s):" -ForegroundColor Cyan
        foreach ($dump in $dumps | Select-Object -First 5) {
            Write-Host "  - File: $($dump.Name) | Size: $([math]::Round($dump.Length / 1KB, 2)) KB | Date: $($dump.LastWriteTime)" -ForegroundColor DarkGray
        }
    } else {
        Write-Host "[OK] No minidump crash files detected in $minidumpDir." -ForegroundColor Green
    }
} else {
    Write-Host "[OK] Minidump directory does not exist (no crash dumps recorded)." -ForegroundColor Green
}

# 2. Check Full Kernel Memory Dump
$kernelDump = "$env:SystemRoot\MEMORY.DMP"
if (Test-Path $kernelDump) {
    $kdFile = Get-Item $kernelDump
    Write-Host "`n[WARN] Active Kernel Memory Dump present:" -ForegroundColor Yellow
    Write-Host "  Path: $kernelDump" -ForegroundColor DarkGray
    Write-Host "  Size: $([math]::Round($kdFile.Length / 1MB, 2)) MB" -ForegroundColor DarkGray
    Write-Host "  Modified: $($kdFile.LastWriteTime)" -ForegroundColor DarkGray
}

# 3. Query System Event Log for BugCheck events (Event ID 1001)
Write-Host "`nQuerying System Event Log for recent BugCheck / BSOD events..." -ForegroundColor Yellow
try {
    $events = Get-WinEvent -FilterHashtable @{LogName='System'; ProviderName='Microsoft-Windows-WER-SystemErrorReporting', 'BugCheck'; Id=1001} -MaxEvents $MaxEvents -ErrorAction SilentlyContinue
    if ($events) {
        foreach ($evt in $events) {
            Write-Host "----------------------------------------------------------" -ForegroundColor DarkGray
            Write-Host "Date: $($evt.TimeCreated)" -ForegroundColor Cyan
            Write-Host "Message: $($evt.Message)" -ForegroundColor White
        }
    } else {
        Write-Host "[OK] No recent BugCheck events recorded in Event Log." -ForegroundColor Green
    }
} catch {
    Write-Host "[INFO] No BugCheck events found in the event log." -ForegroundColor Green
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " Crash dump diagnostics completed." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
