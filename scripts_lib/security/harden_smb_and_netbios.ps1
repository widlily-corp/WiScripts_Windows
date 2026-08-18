<#
.SYNOPSIS
    Hardens network security by disabling SMBv1, NetBIOS over TCP/IP, and LLMNR.
#>

[CmdletBinding()]
param()

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Warning "Modifying network security policies requires Administrator privileges. Please run PowerShell as Administrator."
    return
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: SMBv1, NetBIOS & LLMNR Security Hardening" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

Write-Host "Disabling legacy SMBv1 protocol on Server and Client..." -ForegroundColor Yellow
try {
    Set-SmbServerConfiguration -EnableSMB1Protocol $false -Force -ErrorAction SilentlyContinue
    Disable-WindowsOptionalFeature -Online -FeatureName "SMB1Protocol" -NoRestart -ErrorAction SilentlyContinue | Out-Null
    Write-Host "[OK] SMBv1 protocol disabled." -ForegroundColor Green
} catch {
    Write-Host "[WARN] Could not update SMBv1 configuration: $($_.Exception.Message)" -ForegroundColor DarkYellow
}

Write-Host "Disabling LLMNR in Registry..." -ForegroundColor Yellow
$dnsClientKey = "HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\DNSClient"
if (-not (Test-Path $dnsClientKey)) {
    New-Item -Path $dnsClientKey -Force -ErrorAction SilentlyContinue | Out-Null
}
Set-ItemProperty -Path $dnsClientKey -Name "EnableMulticast" -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue | Out-Null
Write-Host "[OK] LLMNR disabled via registry policy." -ForegroundColor Green

Write-Host "Disabling NetBIOS over TCP/IP across network adapters..." -ForegroundColor Yellow
try {
    $adapters = Get-CimInstance -ClassName Win32_NetworkAdapterConfiguration -Filter "IPEnabled = True" -ErrorAction SilentlyContinue
    foreach ($adapter in $adapters) {
        $adapter | Invoke-CimMethod -MethodName SetTcpipNetbios -Arguments @{TcpipNetbiosOptions = 2} -ErrorAction SilentlyContinue | Out-Null
        Write-Host "  [OK] Disabled NetBIOS on: $($adapter.Description)" -ForegroundColor Green
    }
} catch {
    Write-Host "[WARN] Failed to configure NetBIOS: $($_.Exception.Message)" -ForegroundColor DarkYellow
}

Write-Host "Enabling SMB Server/Client signing requirement..." -ForegroundColor Cyan
Set-SmbServerConfiguration -RequireSecuritySignature $true -Force -ErrorAction SilentlyContinue
Set-SmbClientConfiguration -RequireSecuritySignature $true -Force -ErrorAction SilentlyContinue

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " Network protocol security hardening completed." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
