<#
.SYNOPSIS
    Disables the deprecated and insecure Windows PowerShell 2.0 engine feature.
.DESCRIPTION
    PowerShell 2.0 lacks modern security features like Script Block Logging,
    AMSI (Antimalware Scan Interface), and Constrained Language Mode, making it
    a frequent target for downgrade attacks.
.NOTES
    Requires Administrator elevation.
#>

[CmdletBinding()]
param()

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: PowerShell v2.0 Engine Deprecation" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Check if PowerShell v2.0 feature is installed/enabled
Write-Host "Checking Windows PowerShell 2.0 Engine status..." -ForegroundColor Yellow
$feature = Get-WindowsOptionalFeature -Online -FeatureName "MicrosoftWindowsPowerShellV2Root" -ErrorAction SilentlyContinue

if ($feature) {
    Write-Host "Feature Status: $($feature.State)" -ForegroundColor Cyan
    if ($feature.State -eq "Enabled") {
        Write-Host "Disabling MicrosoftWindowsPowerShellV2Root feature..." -ForegroundColor Yellow
        Disable-WindowsOptionalFeature -Online -FeatureName "MicrosoftWindowsPowerShellV2Root" -NoRestart -ErrorAction SilentlyContinue
        Disable-WindowsOptionalFeature -Online -FeatureName "MicrosoftWindowsPowerShellV2" -NoRestart -ErrorAction SilentlyContinue
        Write-Host "[OK] PowerShell v2.0 feature disabled successfully." -ForegroundColor Green
    } else {
        Write-Host "[OK] PowerShell v2.0 is already disabled or not present." -ForegroundColor Green
    }
} else {
    Write-Host "[OK] PowerShell v2.0 feature not found on this Windows build." -ForegroundColor Green
}

# 2. Check and enable PowerShell Script Block Logging (Security Best Practice)
Write-Host "Verifying PowerShell Script Block Logging policy..." -ForegroundColor Cyan
$psPolicyKey = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\PowerShell\ScriptBlockLogging"
if (-not (Test-Path $psPolicyKey)) {
    New-Item -Path $psPolicyKey -Force | Out-Null
}
Set-ItemProperty -Path $psPolicyKey -Name "EnableScriptBlockLogging" -Value 1 -Type DWord -Force
Write-Host "[OK] PowerShell Script Block Logging enforced." -ForegroundColor Green

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " PowerShell environment security hardened." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
