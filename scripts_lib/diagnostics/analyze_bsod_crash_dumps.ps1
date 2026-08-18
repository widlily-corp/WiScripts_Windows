param(
    [int]$MaxEvents = 10
)

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    throw "Inspecting BSOD crash dumps and system event logs requires Administrator privileges. Please run PowerShell as Administrator."
}

$ErrorActionPreference = "SilentlyContinue"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: BSOD Crash Dumps & BugCheck Inspector" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$minidumpDir = "$env:SystemRoot\Minidump"
if (Test-Path $minidumpDir) {
    $dumps = Get-ChildItem -Path $minidumpDir -Filter "*.dmp" | Sort-Object LastWriteTime -Descending
    if ($dumps) {
        $count = $dumps.Count
        Write-Host "Found $count Minidump files in ${minidumpDir}:" -ForegroundColor Yellow
        $dumps | Select-Object -First $MaxEvents Name, Length, LastWriteTime | Format-Table -AutoSize
    } else {
        Write-Host "No crash dump files found in ${minidumpDir}." -ForegroundColor Green
    }
} else {
    Write-Host "Minidump directory does not exist (${minidumpDir})." -ForegroundColor Green
}

$memoryDmp = "$env:SystemRoot\MEMORY.DMP"
if (Test-Path $memoryDmp) {
    $item = Get-Item $memoryDmp
    $mb = [math]::Round($item.Length / 1MB, 1)
    $lastTime = $item.LastWriteTime
    Write-Host "Full memory dump found: $memoryDmp ($mb MB, $lastTime)" -ForegroundColor Yellow
}

Write-Host "Querying System Event Log for BugCheck crash events..." -ForegroundColor Cyan
$events = Get-EventLog -LogName System -Source "Microsoft-Windows-WER-SystemErrorReporting", "BugCheck" -Newest $MaxEvents -ErrorAction SilentlyContinue

if ($events) {
    $events | Format-Table TimeGenerated, EventID, Source, Message -AutoSize
} else {
    Write-Host "No recent BugCheck events recorded in the System Event Log." -ForegroundColor Green
}

Write-Host "==========================================================" -ForegroundColor Green
