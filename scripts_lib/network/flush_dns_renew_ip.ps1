param(
    [string]$InterfaceAlias = "All"
)

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    throw "This script requires Administrator privileges. Please run PowerShell as Administrator."
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Flush DNS Cache & Renew DHCP Leases" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Flush DNS Client Resolver Cache
Write-Host "[INFO] Flushing local DNS Client Resolver Cache..." -ForegroundColor Cyan
try {
    Clear-DnsClientCache -ErrorAction Stop
    Write-Host "  [OK] DNS Resolver cache cleared successfully via Clear-DnsClientCache." -ForegroundColor Green
} catch {
    $flushProc = Start-Process -FilePath "ipconfig.exe" -ArgumentList "/flushdns" -NoNewWindow -Wait -PassThru
    if ($flushProc.ExitCode -eq 0) {
        Write-Host "  [OK] DNS Resolver cache flushed via ipconfig /flushdns." -ForegroundColor Green
    } else {
        Write-Host "  [WARN] DNS cache flush returned exit code $($flushProc.ExitCode)." -ForegroundColor Yellow
    }
}

# 2. Clear NetBIOS Name Cache
Write-Host "[INFO] Purging and reloading NetBIOS Remote Name Cache..." -ForegroundColor Cyan
$nbtProc = Start-Process -FilePath "nbtstat.exe" -ArgumentList "-R" -NoNewWindow -Wait -PassThru -ErrorAction SilentlyContinue
if ($nbtProc.ExitCode -eq 0) {
    Write-Host "  [OK] NetBIOS name cache purged (nbtstat -R)." -ForegroundColor Green
} else {
    Write-Host "  [WARN] NetBIOS purge completed with status code $($nbtProc.ExitCode)." -ForegroundColor DarkGray
}

# 3. Clear ARP / Neighbor Cache Table
Write-Host "[INFO] Flushing ARP / IP Neighbor Resolution Tables..." -ForegroundColor Cyan
try {
    if ($InterfaceAlias -ne "All") {
        Clear-NetNeighbor -InterfaceAlias $InterfaceAlias -Confirm:$false -ErrorAction SilentlyContinue
    } else {
        Clear-NetNeighbor -Confirm:$false -ErrorAction SilentlyContinue
    }
    Write-Host "  [OK] ARP neighbor cache table flushed." -ForegroundColor Green
} catch {
    Start-Process -FilePath "netsh.exe" -ArgumentList @("interface", "ip", "delete", "arpcache") -NoNewWindow -Wait -ErrorAction SilentlyContinue | Out-Null
    Write-Host "  [OK] ARP cache flushed via netsh interface ip." -ForegroundColor Green
}

# 4. Release DHCP Leases
Write-Host "[INFO] Releasing DHCP IPv4 network leases..." -ForegroundColor Cyan
$relProc = Start-Process -FilePath "ipconfig.exe" -ArgumentList "/release" -NoNewWindow -Wait -PassThru -ErrorAction SilentlyContinue
if ($relProc.ExitCode -eq 0) {
    Write-Host "  [OK] DHCP leases released." -ForegroundColor Green
} else {
    Write-Host "  [WARN] DHCP release reported non-zero status code $($relProc.ExitCode)." -ForegroundColor Yellow
}

# Brief delay for NIC stack stabilization
Start-Sleep -Milliseconds 1500

# 5. Renew DHCP Leases
Write-Host "[INFO] Renewing DHCP IPv4 leases from router/gateway..." -ForegroundColor Cyan
$renProc = Start-Process -FilePath "ipconfig.exe" -ArgumentList "/renew" -NoNewWindow -Wait -PassThru -ErrorAction SilentlyContinue
if ($renProc.ExitCode -eq 0) {
    Write-Host "  [OK] DHCP leases renewed successfully." -ForegroundColor Green
} else {
    Write-Host "  [WARN] DHCP renewal reported status code $($renProc.ExitCode)." -ForegroundColor Yellow
}

# 6. Re-register DNS Names with Active Directory / DNS Servers
Write-Host "[INFO] Re-registering DNS client names and IP mappings..." -ForegroundColor Cyan
$regProc = Start-Process -FilePath "ipconfig.exe" -ArgumentList "/registerdns" -NoNewWindow -Wait -PassThru -ErrorAction SilentlyContinue
if ($regProc.ExitCode -eq 0) {
    Write-Host "  [OK] DNS names registration initiated." -ForegroundColor Green
}

# 7. Gateway Connectivity Verification
Write-Host "`n[INFO] Verifying Default Gateway connectivity..." -ForegroundColor Cyan
$gateway = $null
try {
    $routes = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue
    if ($routes) {
        $gateway = ($routes | Select-Object -First 1).NextHop
    }
} catch {
    # Ignore route query error
}

if ($gateway -and $gateway -ne "0.0.0.0") {
    $pingTest = Test-Connection -ComputerName $gateway -Count 2 -Quiet -ErrorAction SilentlyContinue
    if ($pingTest) {
        Write-Host "  [OK] Gateway $gateway is actively responding." -ForegroundColor Green
    } else {
        Write-Host "  [WARN] Gateway $gateway did not respond to ICMP ping." -ForegroundColor Yellow
    }
} else {
    Write-Host "  [INFO] Network adapter state refreshed." -ForegroundColor White
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "[OK] Network resolver and DHCP lease renewal completed." -ForegroundColor Green
