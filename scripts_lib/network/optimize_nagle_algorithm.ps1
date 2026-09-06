param(
    [ValidateSet('Enable', 'Disable')]$Action = 'Enable',
    [switch]$DryRun
)

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[ERROR] This script requires Administrator privileges. Please run as Administrator."
    exit 1
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Nagle's Algorithm & TCP Delayed ACK Optimizer" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$interfacesRoot = "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces"

if ($DryRun) {
    Write-Host "[INFO] Dry-Run mode enabled. Simulating changes without modifying the system." -ForegroundColor Yellow
}

# 1. Discover target network interfaces
Write-Host "`n[STEP 1/2] Detecting Active Network Interfaces..." -ForegroundColor Cyan
$targetAdapters = @()

try {
    if (Get-Command Get-NetAdapter -ErrorAction SilentlyContinue) {
        $adapters = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object {
            $_.Status -eq 'Up' -and -not [string]::IsNullOrWhiteSpace($_.InterfaceGuid)
        }
        foreach ($a in $adapters) {
            $targetAdapters += [PSCustomObject]@{
                Name        = $a.Name
                Description = $a.InterfaceDescription
                Guid        = $a.InterfaceGuid
            }
        }
    }
} catch {
    # Fallback to registry enumeration if Get-NetAdapter fails
}

# Fallback interface discovery if Get-NetAdapter returned no active interfaces
if ($targetAdapters.Count -eq 0) {
    Write-Host "  [INFO] Querying TCP/IP interface configuration from registry..." -ForegroundColor DarkGray
    if (Test-Path $interfacesRoot) {
        $subkeys = Get-ChildItem -Path $interfacesRoot -ErrorAction SilentlyContinue
        foreach ($sk in $subkeys) {
            $ipProp = Get-ItemProperty -Path $sk.PSPath -ErrorAction SilentlyContinue
            $hasIp = ($ipProp.IPAddress -and $ipProp.IPAddress -ne "0.0.0.0" -and $ipProp.IPAddress[0] -ne "0.0.0.0") -or
                     ($ipProp.DhcpIPAddress -and $ipProp.DhcpIPAddress -ne "0.0.0.0")
            if ($hasIp) {
                $targetAdapters += [PSCustomObject]@{
                    Name        = "Interface $($sk.PSChildName)"
                    Description = "Active TCP/IP Interface"
                    Guid        = $sk.PSChildName
                }
            }
        }
    }
}

if ($targetAdapters.Count -eq 0) {
    Write-Host "  [WARN] No active network interfaces with assigned IP addresses were detected." -ForegroundColor Yellow
    Write-Host "  [INFO] Verification complete. Exiting without modifications." -ForegroundColor White
    exit 0
}

Write-Host "  [OK] Found $($targetAdapters.Count) active network adapter(s):" -ForegroundColor Green
foreach ($adapter in $targetAdapters) {
    Write-Host "       - $($adapter.Name) ($($adapter.Description)) [GUID: $($adapter.Guid)]" -ForegroundColor White
}

# 2. Apply or Revert TCP_NODELAY and TcpAckFrequency
Write-Host "`n[STEP 2/2] Configuring TCP Low-Latency Parameters ($Action)..." -ForegroundColor Cyan

foreach ($adapter in $targetAdapters) {
    $guid = $adapter.Guid
    $guidClean = $guid.Trim("{", "}")
    
    # Locate registry key case-insensitively
    $targetKeyPath = "$interfacesRoot\$guid"
    if (-not (Test-Path $targetKeyPath)) {
        $targetKeyPath = "$interfacesRoot\{$guidClean}"
    }
    
    if (-not (Test-Path $targetKeyPath)) {
        # Search child subkeys for matching GUID string
        $matchingSubkey = Get-ChildItem -Path $interfacesRoot -ErrorAction SilentlyContinue | Where-Object {
            $_.PSChildName.Trim("{", "}").Equals($guidClean, [System.StringComparison]::OrdinalIgnoreCase)
        } | Select-Object -First 1
        
        if ($matchingSubkey) {
            $targetKeyPath = $matchingSubkey.PSPath
        }
    }

    if (-not (Test-Path $targetKeyPath)) {
        Write-Host "  [WARN] Registry key for adapter '$($adapter.Name)' not found ($guid). Skipping." -ForegroundColor Yellow
        continue
    }

    Write-Host "`n  [*] Interface: $($adapter.Name)" -ForegroundColor Cyan
    Write-Host "      Registry Path: $targetKeyPath" -ForegroundColor DarkGray

    if ($Action -eq 'Enable') {
        if ($DryRun) {
            Write-Host "      [DRY RUN] Would set 'TcpAckFrequency' = 1 (REG_DWORD) [Immediate ACK, no delayed ACK wait]" -ForegroundColor Yellow
            Write-Host "      [DRY RUN] Would set 'TCPNoDelay' = 1 (REG_DWORD) [Immediate packet dispatch, disable Nagle]" -ForegroundColor Yellow
            Write-Host "      [DRY RUN] Would set 'TcpDelAckTicks' = 0 (REG_DWORD) [Zero delayed ACK timer ticks]" -ForegroundColor Yellow
        } else {
            try {
                Set-ItemProperty -Path $targetKeyPath -Name "TcpAckFrequency" -Type DWord -Value 1 -Force -ErrorAction Stop
                Write-Host "      [OK] Set TcpAckFrequency = 1 (Immediate ACK enabled)" -ForegroundColor Green
            } catch {
                Write-Host "      [WARN] Failed to set TcpAckFrequency: $($_.Exception.Message)" -ForegroundColor Yellow
            }

            try {
                Set-ItemProperty -Path $targetKeyPath -Name "TCPNoDelay" -Type DWord -Value 1 -Force -ErrorAction Stop
                Write-Host "      [OK] Set TCPNoDelay = 1 (Nagle's algorithm disabled)" -ForegroundColor Green
            } catch {
                Write-Host "      [WARN] Failed to set TCPNoDelay: $($_.Exception.Message)" -ForegroundColor Yellow
            }

            try {
                Set-ItemProperty -Path $targetKeyPath -Name "TcpDelAckTicks" -Type DWord -Value 0 -Force -ErrorAction Stop
                Write-Host "      [OK] Set TcpDelAckTicks = 0 (Delayed ACK timer set to zero)" -ForegroundColor Green
            } catch {
                Write-Host "      [WARN] Failed to set TcpDelAckTicks: $($_.Exception.Message)" -ForegroundColor Yellow
            }
        }
    } else {
        if ($DryRun) {
            Write-Host "      [DRY RUN] Would remove 'TcpAckFrequency' (Reverts to OS default delayed ACK)" -ForegroundColor Yellow
            Write-Host "      [DRY RUN] Would remove 'TCPNoDelay' (Reverts to OS default Nagle algorithm)" -ForegroundColor Yellow
            Write-Host "      [DRY RUN] Would remove 'TcpDelAckTicks' (Reverts to OS default ACK ticks)" -ForegroundColor Yellow
        } else {
            try {
                Remove-ItemProperty -Path $targetKeyPath -Name "TcpAckFrequency" -Force -ErrorAction SilentlyContinue | Out-Null
                Write-Host "      [OK] Removed TcpAckFrequency (Restored Windows default ACK timing)" -ForegroundColor Green
            } catch {
                # Ignore property removal error
            }

            try {
                Remove-ItemProperty -Path $targetKeyPath -Name "TCPNoDelay" -Force -ErrorAction SilentlyContinue | Out-Null
                Write-Host "      [OK] Removed TCPNoDelay (Restored Windows default Nagle algorithm)" -ForegroundColor Green
            } catch {
                # Ignore property removal error
            }

            try {
                Remove-ItemProperty -Path $targetKeyPath -Name "TcpDelAckTicks" -Force -ErrorAction SilentlyContinue | Out-Null
                Write-Host "      [OK] Removed TcpDelAckTicks" -ForegroundColor Green
            } catch {
                # Ignore property removal error
            }
        }
    }
}

Write-Host "`n==========================================================" -ForegroundColor Green
if ($DryRun) {
    Write-Host " [DRY RUN COMPLETE] Nagle's algorithm and TCP ACK simulation finished." -ForegroundColor Yellow
} else {
    if ($Action -eq 'Enable') {
        Write-Host " [OK] TCP_NODELAY and immediate ACK successfully enabled on active adapters." -ForegroundColor Green
        Write-Host " [INFO] Newly opened game and application sockets will operate with minimum latency." -ForegroundColor White
        Write-Host " [NOTE] For active gaming sessions, reconnecting or restarting adapter is recommended." -ForegroundColor DarkGray
    } else {
        Write-Host " [OK] Default Nagle's algorithm and delayed ACK restored on active adapters." -ForegroundColor Green
    }
}
Write-Host "==========================================================" -ForegroundColor Green

exit 0
