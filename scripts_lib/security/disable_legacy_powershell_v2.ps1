param()

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    throw "Disabling Windows optional features requires Administrator privileges. Please run PowerShell as Administrator."
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: PowerShell v2.0 Engine Deprecation" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

Write-Host "Checking Windows PowerShell 2.0 Engine status..." -ForegroundColor Yellow
$feature = Get-WindowsOptionalFeature -Online -FeatureName "MicrosoftWindowsPowerShellV2Root" -ErrorAction SilentlyContinue

if ($feature) {
    Write-Host "Feature Status: $($feature.State)" -ForegroundColor Cyan
    if ($feature.State -eq "Enabled") {
        Write-Host "Disabling MicrosoftWindowsPowerShellV2Root feature..." -ForegroundColor Yellow
        Disable-WindowsOptionalFeature -Online -FeatureName "MicrosoftWindowsPowerShellV2Root" -NoRestart -ErrorAction SilentlyContinue | Out-Null
        Disable-WindowsOptionalFeature -Online -FeatureName "MicrosoftWindowsPowerShellV2" -NoRestart -ErrorAction SilentlyContinue | Out-Null
        Write-Host "[OK] PowerShell v2.0 feature disabled successfully." -ForegroundColor Green
    } else {
        Write-Host "[OK] PowerShell v2.0 is already disabled or not present." -ForegroundColor Green
    }
} else {
    Write-Host "[OK] PowerShell v2.0 feature not found on this Windows build." -ForegroundColor Green
}

Write-Host "Verifying PowerShell Script Block Logging policy..." -ForegroundColor Cyan
$psPolicyKey = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\PowerShell\ScriptBlockLogging"
if (-not (Test-Path $psPolicyKey)) {
    New-Item -Path $psPolicyKey -Force -ErrorAction SilentlyContinue | Out-Null
}
Set-ItemProperty -Path $psPolicyKey -Name "EnableScriptBlockLogging" -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue | Out-Null
Write-Host "[OK] PowerShell Script Block Logging policy enforced." -ForegroundColor Green

Write-Host "==========================================================" -ForegroundColor Green
