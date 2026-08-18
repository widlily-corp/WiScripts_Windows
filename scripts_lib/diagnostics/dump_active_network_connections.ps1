<#
.SYNOPSIS
    Dumps active TCP/UDP network connections mapped to running processes.
.DESCRIPTION
    Retrieves socket connections, listening ports, remote endpoints, and maps
    owning PID to process binary names and paths for suspicious connection audits.
.NOTES
    Requires Administrator elevation to query all system processes.
#>

[CmdletBinding()]
param(
    [ValidateSet("All", "Established", "Listen", "TimeWait", "CloseWait")]
    [string]$StateFilter = "All",
    
    [int]$Top = 50
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Process-Mapped Network Connection Telemetry" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Retrieve TCP Connections
Write-Host "Gathering TCP endpoint telemetry (Filter: $StateFilter, Top: $Top)..." -ForegroundColor Yellow

$connections = Get-NetTCPConnection -ErrorAction SilentlyContinue

if ($StateFilter -ne "All") {
    $connections = $connections | Where-Object { $_.State -eq $StateFilter }
}

$results = foreach ($conn in $connections | Select-Object -First $Top) {
    $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
    $procName = if ($proc) { $proc.ProcessName } else { "PID: $($conn.OwningProcess)" }
    $procPath = if ($proc) { $proc.Path } else { "N/A" }
    
    [PSCustomObject]@{
        LocalAddress  = "$($conn.LocalAddress):$($conn.LocalPort)"
        RemoteAddress = "$($conn.RemoteAddress):$($conn.RemotePort)"
        State         = $conn.State
        Process       = $procName
        PID           = $conn.OwningProcess
        Path          = $procPath
    }
}

$results | Format-Table -AutoSize -Property LocalAddress, RemoteAddress, State, Process, PID

# 2. Summary of Listening Ports
$listenPorts = ($connections | Where-Object { $_.State -eq "Listen" }).Count
$estabPorts = ($connections | Where-Object { $_.State -eq "Established" }).Count

Write-Host "`nConnection Summary:" -ForegroundColor Cyan
Write-Host "  - Listening Endpoints: $listenPorts" -ForegroundColor DarkGray
Write-Host "  - Active Established: $estabPorts" -ForegroundColor DarkGray

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " Network telemetry dump completed." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
