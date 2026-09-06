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
Write-Host " WiScripts: Gaming Low-Latency QoS DSCP Configuration" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$policyName = "Gaming_LowLatency_QoS"
$dscpValue = 46 # Expedited Forwarding (EF / RFC 3246), highest priority for real-time traffic
$gpoQosPath = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\QoS\$policyName"
$tcpQosPath = "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\QoS"
$tcpParamPath = "HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters"

if ($DryRun) {
    Write-Host "[INFO] Dry-Run mode enabled. Simulating changes without modifying the system." -ForegroundColor Yellow
}

if ($Action -eq 'Enable') {
    Write-Host "`n[STEP 1/2] Configuring TCP/IP QoS NLA and TOS Marking..." -ForegroundColor Cyan

    if ($DryRun) {
        Write-Host "  [DRY RUN] Would ensure registry path exists: $tcpQosPath" -ForegroundColor Yellow
        Write-Host "  [DRY RUN] Would set '$tcpQosPath' -> 'Do not use NLA' = '1' (REG_SZ)" -ForegroundColor Yellow
        Write-Host "  [DRY RUN] Would set '$tcpParamPath' -> 'DisableUserTOSSetting' = 0 (REG_DWORD)" -ForegroundColor Yellow
    } else {
        try {
            if (-not (Test-Path $tcpQosPath)) {
                New-Item -Path $tcpQosPath -Force -ErrorAction Stop | Out-Null
            }
            Set-ItemProperty -Path $tcpQosPath -Name "Do not use NLA" -Type String -Value "1" -Force -ErrorAction Stop
            Write-Host "  [OK] Configured 'Do not use NLA' = '1' (Enables DSCP on non-domain connections)." -ForegroundColor Green
        } catch {
            Write-Host "  [WARN] Failed to configure 'Do not use NLA': $($_.Exception.Message)" -ForegroundColor Yellow
        }

        try {
            if (-not (Test-Path $tcpParamPath)) {
                New-Item -Path $tcpParamPath -Force -ErrorAction Stop | Out-Null
            }
            Set-ItemProperty -Path $tcpParamPath -Name "DisableUserTOSSetting" -Type DWord -Value 0 -Force -ErrorAction Stop
            Write-Host "  [OK] Configured 'DisableUserTOSSetting' = 0 (Allows applications to specify TOS/DSCP)." -ForegroundColor Green
        } catch {
            Write-Host "  [WARN] Failed to configure 'DisableUserTOSSetting': $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }

    Write-Host "`n[STEP 2/2] Configuring Policy-Based QoS Rule '$policyName' (DSCP $dscpValue)..." -ForegroundColor Cyan

    if ($DryRun) {
        Write-Host "  [DRY RUN] Would configure QoS Policy '$policyName' with DSCP $dscpValue (Expedited Forwarding)." -ForegroundColor Yellow
        Write-Host "  [DRY RUN] Would apply to all network profiles (TCP & UDP protocols, unthrottled)." -ForegroundColor Yellow
        Write-Host "  [DRY RUN] Would ensure registry key '$gpoQosPath' is populated." -ForegroundColor Yellow
    } else {
        $netQosCmdletAvailable = $false
        try {
            if (Get-Command New-NetQosPolicy -ErrorAction SilentlyContinue) {
                $netQosCmdletAvailable = $true
            }
        } catch {
            $netQosCmdletAvailable = $false
        }

        $cmdletSuccess = $false
        if ($netQosCmdletAvailable) {
            try {
                $existing = Get-NetQosPolicy -Name $policyName -ErrorAction SilentlyContinue
                if ($existing) {
                    Set-NetQosPolicy -Name $policyName -NetworkProfile All -IPProtocolMatchCondition Both -DSCPAction $dscpValue -ThrottleRateActionBitsPerSecond 0 -ErrorAction Stop | Out-Null
                    Write-Host "  [OK] Updated existing NetQosPolicy '$policyName' (DSCP: $dscpValue)." -ForegroundColor Green
                } else {
                    New-NetQosPolicy -Name $policyName -NetworkProfile All -IPProtocolMatchCondition Both -DSCPAction $dscpValue -ThrottleRateActionBitsPerSecond 0 -ErrorAction Stop | Out-Null
                    Write-Host "  [OK] Created NetQosPolicy '$policyName' (DSCP: $dscpValue)." -ForegroundColor Green
                }
                $cmdletSuccess = $true
            } catch {
                Write-Host "  [INFO] NetQosPolicy cmdlet returned: $($_.Exception.Message). Applying Group Policy registry fallback..." -ForegroundColor DarkGray
            }
        }

        # Ensure Group Policy QoS registry entries are written
        try {
            if (-not (Test-Path $gpoQosPath)) {
                New-Item -Path $gpoQosPath -Force -ErrorAction Stop | Out-Null
            }
            Set-ItemProperty -Path $gpoQosPath -Name "Version" -Type String -Value "1.0" -Force -ErrorAction Stop
            Set-ItemProperty -Path $gpoQosPath -Name "Application Name" -Type String -Value "*" -Force -ErrorAction Stop
            Set-ItemProperty -Path $gpoQosPath -Name "Protocol" -Type String -Value "*" -Force -ErrorAction Stop
            Set-ItemProperty -Path $gpoQosPath -Name "Local Port" -Type String -Value "*" -Force -ErrorAction Stop
            Set-ItemProperty -Path $gpoQosPath -Name "Local IP" -Type String -Value "*" -Force -ErrorAction Stop
            Set-ItemProperty -Path $gpoQosPath -Name "Local IP Prefix Length" -Type String -Value "*" -Force -ErrorAction Stop
            Set-ItemProperty -Path $gpoQosPath -Name "Remote Port" -Type String -Value "*" -Force -ErrorAction Stop
            Set-ItemProperty -Path $gpoQosPath -Name "Remote IP" -Type String -Value "*" -Force -ErrorAction Stop
            Set-ItemProperty -Path $gpoQosPath -Name "Remote IP Prefix Length" -Type String -Value "*" -Force -ErrorAction Stop
            Set-ItemProperty -Path $gpoQosPath -Name "DSCP Value" -Type String -Value "$dscpValue" -Force -ErrorAction Stop
            Set-ItemProperty -Path $gpoQosPath -Name "Throttle Rate" -Type String -Value "-1" -Force -ErrorAction Stop

            Write-Host "  [OK] Group Policy QoS registry rule '$policyName' configured successfully." -ForegroundColor Green
        } catch {
            Write-Host "  [WARN] Failed to write Group Policy QoS registry keys: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }

    Write-Host "`n==========================================================" -ForegroundColor Green
    if ($DryRun) {
        Write-Host " [DRY RUN COMPLETE] QoS DSCP 46 tagging simulation finished." -ForegroundColor Yellow
    } else {
        Write-Host " [OK] QoS DSCP 46 Expedited Forwarding enabled for gaming." -ForegroundColor Green
        Write-Host " [INFO] High-priority tagging is now active for outbound packets." -ForegroundColor White
    }
    Write-Host "==========================================================" -ForegroundColor Green
}
else {
    Write-Host "`n[STEP 1/2] Removing Policy-Based QoS Rule '$policyName'..." -ForegroundColor Cyan

    if ($DryRun) {
        Write-Host "  [DRY RUN] Would remove NetQosPolicy '$policyName' if present." -ForegroundColor Yellow
        Write-Host "  [DRY RUN] Would delete registry key: $gpoQosPath" -ForegroundColor Yellow
    } else {
        try {
            if (Get-Command Remove-NetQosPolicy -ErrorAction SilentlyContinue) {
                $existing = Get-NetQosPolicy -Name $policyName -ErrorAction SilentlyContinue
                if ($existing) {
                    Remove-NetQosPolicy -Name $policyName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
                    Write-Host "  [OK] Removed NetQosPolicy '$policyName'." -ForegroundColor Green
                }
            }
        } catch {
            # Silently continue on cmdlet error
        }

        if (Test-Path $gpoQosPath) {
            try {
                Remove-Item -Path $gpoQosPath -Recurse -Force -ErrorAction Stop | Out-Null
                Write-Host "  [OK] Removed Group Policy QoS registry key: $gpoQosPath" -ForegroundColor Green
            } catch {
                Write-Host "  [WARN] Failed to remove registry key: $($_.Exception.Message)" -ForegroundColor Yellow
            }
        } else {
            Write-Host "  [INFO] QoS policy registry key not found (already removed)." -ForegroundColor DarkGray
        }
    }

    Write-Host "`n[STEP 2/2] Resetting TCP/IP QoS NLA configuration..." -ForegroundColor Cyan

    if ($DryRun) {
        Write-Host "  [DRY RUN] Would remove 'Do not use NLA' from $tcpQosPath if no other policies exist." -ForegroundColor Yellow
    } else {
        $parentQosKey = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\QoS"
        $remainingPolicies = @()
        if (Test-Path $parentQosKey) {
            $remainingPolicies = @(Get-ChildItem -Path $parentQosKey -ErrorAction SilentlyContinue)
        }

        if ($remainingPolicies.Count -eq 0) {
            try {
                if (Test-Path $tcpQosPath) {
                    Remove-ItemProperty -Path $tcpQosPath -Name "Do not use NLA" -Force -ErrorAction SilentlyContinue | Out-Null
                    Write-Host "  [OK] Cleaned up 'Do not use NLA' value." -ForegroundColor Green
                }
            } catch {
                # Ignore property removal error
            }
        } else {
            Write-Host "  [INFO] Other QoS policies detected in registry. Preserving 'Do not use NLA'." -ForegroundColor White
        }
    }

    Write-Host "`n==========================================================" -ForegroundColor Green
    if ($DryRun) {
        Write-Host " [DRY RUN COMPLETE] QoS DSCP removal simulation finished." -ForegroundColor Yellow
    } else {
        Write-Host " [OK] Policy-based QoS DSCP configuration removed successfully." -ForegroundColor Green
    }
    Write-Host "==========================================================" -ForegroundColor Green
}

exit 0
