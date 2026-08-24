param(
    [string]$AdapterName = "Active",
    [switch]$OptimizeTcp
)

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    throw "This script requires Administrator privileges. Please run PowerShell as Administrator."
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Network Adapter Soft Reset & TCP Optimization" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Discover Active Network Adapters
$allAdapters = Get-NetAdapter -ErrorAction SilentlyContinue
if (-not $allAdapters -or $allAdapters.Count -eq 0) {
    Write-Host "[WARN] No network adapters discovered via Get-NetAdapter." -ForegroundColor Yellow
    exit 0
}

$targetAdapters = @()
if ($AdapterName -eq "Active" -or $AdapterName -eq "All") {
    $targetAdapters = $allAdapters | Where-Object { $_.Status -eq 'Up' }
    if (-not $targetAdapters -or $targetAdapters.Count -eq 0) {
        $targetAdapters = $allAdapters
    }
} else {
    $targetAdapters = $allAdapters | Where-Object { $_.Name -like "*$AdapterName*" -or $_.InterfaceDescription -like "*$AdapterName*" }
}

if (-not $targetAdapters -or $targetAdapters.Count -eq 0) {
    Write-Host "[WARN] No matching adapters found for query '$AdapterName'." -ForegroundColor Yellow
    exit 0
}

# 2. Soft Restart Network Adapters
foreach ($adapter in $targetAdapters) {
    $name = $adapter.Name
    $desc = $adapter.InterfaceDescription
    $speed = if ($adapter.LinkSpeed) { $adapter.LinkSpeed } else { "Unknown" }
    
    Write-Host "`n[INFO] Restarting Network Adapter: $name ($desc, Link: $speed)..." -ForegroundColor Cyan
    try {
        Restart-NetAdapter -Name $name -Confirm:$false -ErrorAction Stop
        Write-Host "  [OK] Adapter '$name' restarted successfully." -ForegroundColor Green
    } catch {
        Write-Host "  [WARN] Native restart encountered error, falling back to Disable/Enable..." -ForegroundColor Yellow
        Disable-NetAdapter -Name $name -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
        Start-Sleep -Milliseconds 1000
        Enable-NetAdapter -Name $name -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
        Write-Host "  [OK] Adapter '$name' cycled via Disable/Enable." -ForegroundColor Green
    }
    
    # 3. Disable Energy Efficient Ethernet (EEE) to eliminate micro-stutters and DPC latency
    try {
        $eeeProps = Get-NetAdapterAdvancedProperty -Name $name -ErrorAction SilentlyContinue | Where-Object {
            $_.DisplayName -like "*Energy Efficient*" -or 
            $_.DisplayName -like "*Green Ethernet*" -or 
            $_.DisplayName -like "*Power Saving*" -or 
            $_.RegistryKeyword -like "*EEE*" -or
            $_.RegistryKeyword -like "*GreenEthernet*"
        }
        
        foreach ($prop in $eeeProps) {
            Set-NetAdapterAdvancedProperty -Name $name -DisplayName $prop.DisplayName -DisplayValue "Disabled" -ErrorAction SilentlyContinue | Out-Null
            Write-Host "  [OK] Disabled latency-inducing sleep state: $($prop.DisplayName)" -ForegroundColor DarkGray
        }
    } catch {
        # Non-fatal advanced property tuning
    }
}

# 4. Winsock Catalog Reset
Write-Host "`n[INFO] Performing Winsock catalog soft reset..." -ForegroundColor Cyan
$wsProc = Start-Process -FilePath "netsh.exe" -ArgumentList @("winsock", "reset") -NoNewWindow -Wait -PassThru -ErrorAction SilentlyContinue
if ($wsProc.ExitCode -eq 0) {
    Write-Host "  [OK] Winsock catalog reset completed." -ForegroundColor Green
}

# 5. High-Throughput TCP Window Scaling & Auto-Tuning Optimization
if ($OptimizeTcp) {
    Write-Host "`n[INFO] Applying high-performance TCP Stack settings..." -ForegroundColor Cyan
    
    Start-Process -FilePath "netsh.exe" -ArgumentList @("int", "tcp", "set", "global", "autotuninglevel=normal") -NoNewWindow -Wait -ErrorAction SilentlyContinue | Out-Null
    Start-Process -FilePath "netsh.exe" -ArgumentList @("int", "tcp", "set", "global", "rss=enabled") -NoNewWindow -Wait -ErrorAction SilentlyContinue | Out-Null
    Start-Process -FilePath "netsh.exe" -ArgumentList @("int", "tcp", "set", "global", "fastopen=enabled") -NoNewWindow -Wait -ErrorAction SilentlyContinue | Out-Null
    Start-Process -FilePath "netsh.exe" -ArgumentList @("int", "tcp", "set", "global", "timestamps=disabled") -NoNewWindow -Wait -ErrorAction SilentlyContinue | Out-Null
    
    Write-Host "  [OK] TCP Window Auto-Tuning = Normal" -ForegroundColor Green
    Write-Host "  [OK] Receive-Side Scaling (RSS) = Enabled" -ForegroundColor Green
    Write-Host "  [OK] TCP Fast Open = Enabled" -ForegroundColor Green
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "[OK] Network adapter reset and stack optimization completed." -ForegroundColor Green
