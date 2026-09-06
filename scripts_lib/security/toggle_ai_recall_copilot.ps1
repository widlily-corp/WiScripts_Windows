param(
    [ValidateSet('Disable', 'Enable')]$Action = 'Disable',
    [switch]$DryRun
)

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[ERROR] This script requires Administrator privileges. Please run as Administrator."
    exit 1
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Toggle Windows 11 AI Recall & Copilot Features" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "[INFO] Target Action : $Action" -ForegroundColor Cyan
Write-Host "[INFO] DryRun Mode   : $([bool]$DryRun)" -ForegroundColor Cyan

function Set-PolicyDword {
    param(
        [string]$Path,
        [string]$Name,
        [int]$Value,
        [bool]$IsDryRun
    )
    if ($IsDryRun) {
        Write-Host "  [DRY-RUN] Would set $Path -> $Name = $Value" -ForegroundColor Yellow
        return
    }
    try {
        if (-not (Test-Path $Path)) {
            New-Item -Path $Path -Force -ErrorAction Stop | Out-Null
        }
        Set-ItemProperty -Path $Path -Name $Name -Value $Value -Type DWord -Force -ErrorAction Stop
        Write-Host "  [OK] Set $Path -> $Name = $Value" -ForegroundColor Green
    } catch {
        Write-Host "  [WARN] Failed to set $Path -> $Name - $($_.Exception.Message)" -ForegroundColor DarkGray
    }
}

function Remove-PolicyProperty {
    param(
        [string]$Path,
        [string]$Name,
        [bool]$IsDryRun
    )
    if ($IsDryRun) {
        Write-Host "  [DRY-RUN] Would remove policy property $Path -> $Name" -ForegroundColor Yellow
        return
    }
    try {
        if (Test-Path $Path) {
            Remove-ItemProperty -Path $Path -Name $Name -Force -ErrorAction SilentlyContinue
            Write-Host "  [OK] Reverted policy property $Path -> $Name" -ForegroundColor Green
        }
    } catch {
        Write-Host "  [WARN] Failed to remove property $Path -> $Name - $($_.Exception.Message)" -ForegroundColor DarkGray
    }
}

if ($Action -eq 'Disable') {
    Write-Host "`n[INFO] Applying policies to disable Windows Recall (AI Data Analysis)..." -ForegroundColor Cyan
    Set-PolicyDword -Path "HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsAI" -Name "DisableAIDataAnalysis" -Value 1 -IsDryRun $DryRun
    Set-PolicyDword -Path "HKCU:\Software\Policies\Microsoft\Windows\WindowsAI" -Name "DisableAIDataAnalysis" -Value 1 -IsDryRun $DryRun
    Set-PolicyDword -Path "HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsAI" -Name "AllowSnapshotNotification" -Value 0 -IsDryRun $DryRun
    Set-PolicyDword -Path "HKCU:\Software\Policies\Microsoft\Windows\WindowsAI" -Name "AllowSnapshotNotification" -Value 0 -IsDryRun $DryRun

    Write-Host "`n[INFO] Applying policies to disable Windows Copilot..." -ForegroundColor Cyan
    Set-PolicyDword -Path "HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsCopilot" -Name "TurnOffWindowsCopilot" -Value 1 -IsDryRun $DryRun
    Set-PolicyDword -Path "HKCU:\Software\Policies\Microsoft\Windows\WindowsCopilot" -Name "TurnOffWindowsCopilot" -Value 1 -IsDryRun $DryRun

    Write-Host "`n[INFO] Updating Explorer taskbar and search AI integration..." -ForegroundColor Cyan
    Set-PolicyDword -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced" -Name "ShowCopilotButton" -Value 0 -IsDryRun $DryRun
    Set-PolicyDword -Path "HKCU:\Software\Policies\Microsoft\Windows\Explorer" -Name "DisableSearchBoxSuggestions" -Value 1 -IsDryRun $DryRun
    Set-PolicyDword -Path "HKLM:\SOFTWARE\Policies\Microsoft\Windows\Windows Search" -Name "AllowCortana" -Value 0 -IsDryRun $DryRun

    $copilotProcs = Get-Process -Name "*copilot*" -ErrorAction SilentlyContinue
    if ($copilotProcs) {
        if ($DryRun) {
            Write-Host "  [DRY-RUN] Would terminate active Copilot processes (Count: $($copilotProcs.Count))" -ForegroundColor Yellow
        } else {
            $copilotProcs | Stop-Process -Force -ErrorAction SilentlyContinue
            Write-Host "  [OK] Terminated active Copilot process instances." -ForegroundColor Green
        }
    }
} else {
    Write-Host "`n[INFO] Re-enabling Windows Recall & Copilot features..." -ForegroundColor Cyan
    Remove-PolicyProperty -Path "HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsAI" -Name "DisableAIDataAnalysis" -IsDryRun $DryRun
    Remove-PolicyProperty -Path "HKCU:\Software\Policies\Microsoft\Windows\WindowsAI" -Name "DisableAIDataAnalysis" -IsDryRun $DryRun
    Remove-PolicyProperty -Path "HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsAI" -Name "AllowSnapshotNotification" -IsDryRun $DryRun
    Remove-PolicyProperty -Path "HKCU:\Software\Policies\Microsoft\Windows\WindowsAI" -Name "AllowSnapshotNotification" -IsDryRun $DryRun

    Remove-PolicyProperty -Path "HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsCopilot" -Name "TurnOffWindowsCopilot" -IsDryRun $DryRun
    Remove-PolicyProperty -Path "HKCU:\Software\Policies\Microsoft\Windows\WindowsCopilot" -Name "TurnOffWindowsCopilot" -IsDryRun $DryRun

    Set-PolicyDword -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced" -Name "ShowCopilotButton" -Value 1 -IsDryRun $DryRun
    Remove-PolicyProperty -Path "HKCU:\Software\Policies\Microsoft\Windows\Explorer" -Name "DisableSearchBoxSuggestions" -IsDryRun $DryRun
    Remove-PolicyProperty -Path "HKLM:\SOFTWARE\Policies\Microsoft\Windows\Windows Search" -Name "AllowCortana" -IsDryRun $DryRun
}

Write-Host "`n==========================================================" -ForegroundColor Green
if ($DryRun) {
    Write-Host "[DRY-RUN] AI Recall & Copilot configuration simulation finished." -ForegroundColor Yellow
} else {
    Write-Host "[OK] Windows 11 AI Recall and Copilot settings successfully updated ($Action)." -ForegroundColor Green
}
Write-Host "==========================================================" -ForegroundColor Green

exit 0
