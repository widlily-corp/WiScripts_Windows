param(
    [string]$StateFilter = "All",
    [int]$Top = 50
)

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    throw "Dumping process-mapped network connections requires Administrator privileges. Please run PowerShell as Administrator."
}

$ErrorActionPreference = "SilentlyContinue"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Process-Mapped Network Telemetry" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

Write-Host "Gathering TCP/UDP endpoint telemetry (Filter: $StateFilter, Top: $Top)..." -ForegroundColor Yellow

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

$listenCount = ($connections | Where-Object { $_.State -eq "Listen" }).Count
$estabCount = ($connections | Where-Object { $_.State -eq "Established" }).Count

Write-Host "`nConnection Summary:" -ForegroundColor Cyan
Write-Host "  * Listening Endpoints: $listenCount" -ForegroundColor DarkGray
Write-Host "  * Active Established:  $estabCount" -ForegroundColor DarkGray
Write-Host "==========================================================" -ForegroundColor Green
