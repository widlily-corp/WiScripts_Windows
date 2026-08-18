<#
.SYNOPSIS
    Hardens network security by disabling SMBv1, NetBIOS over TCP/IP, and LLMNR.
.DESCRIPTION
    Disables legacy vulnerable protocols (SMBv1, NetBIOS broadcast, LLMNR)
    used in NTLM relay and EternalBlue attacks, reducing lateral movement risks.
.NOTES
    Requires Administrator elevation.
#>

[CmdletBinding()]
param()

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: SMBv1, NetBIOS & LLMNR Security Hardening" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Disable SMBv1 Protocol
Write-Host "Disabling legacy SMBv1 protocol on Server and Client..." -ForegroundColor Yellow
try {
    Set-SmbServerConfiguration -EnableSMB1Protocol $false -Force -ErrorAction SilentlyContinue
    Disable-WindowsOptionalFeature -Online -FeatureName "SMB1Protocol" -NoRestart -ErrorAction SilentlyContinue
    Write-Host "[OK] SMBv1 protocol disabled." -ForegroundColor Green
} catch {
    Write-Host "[WARN] Could not update SMBv1 configuration: $($_.Exception.Message)" -ForegroundColor DarkYellow
}

# 2. Disable LLMNR (Link-Local Multicast Name Resolution) in Registry
Write-Host "Disabling LLMNR (Link-Local Multicast Name Resolution)..." -ForegroundColor Yellow
$dnsClientKey = "HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\DNSClient"
if (-not (Test-Path $dnsClientKey)) {
    New-Item -Path $dnsClientKey -Force | Out-Null
}
Set-ItemProperty -Path $dnsClientKey -Name "EnableMulticast" -Value 0 -Type DWord -Force
Write-Host "[OK] LLMNR disabled via registry policy." -ForegroundColor Green

# 3. Disable NetBIOS over TCP/IP on all active network adapters
Write-Host "Disabling NetBIOS over TCP/IP across network adapters..." -ForegroundColor Yellow
try {
    $adapters = Get-WmiObject -Class Win32_NetworkAdapterConfiguration -Filter "IPEnabled = True" -ErrorAction SilentlyContinue
    foreach ($adapter in $adapters) {
        # NetbiosOptions: 0 = Default (DHCP), 1 = Enabled, 2 = Disabled
        $res = $adapter.SetTcpipNetbios(2)
        if ($res.ReturnValue -eq 0) {
            Write-Host "  [OK] Disabled NetBIOS on: $($adapter.Description)" -ForegroundColor Green
        }
    }
} catch {
    Write-Host "[WARN] Failed to configure NetBIOS via WMI: $($_.Exception.Message)" -ForegroundColor DarkYellow
}

# 4. Require SMB Signing if supported
Write-Host "Enabling SMB Server/Client signing requirement..." -ForegroundColor Cyan
Set-SmbServerConfiguration -RequireSecuritySignature $true -Force -ErrorAction SilentlyContinue
Set-SmbClientConfiguration -RequireSecuritySignature $true -Force -ErrorAction SilentlyContinue

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " Network protocol security hardening completed." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
