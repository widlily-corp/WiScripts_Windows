param(
    [switch]$DryRun
)

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[ERROR] This script requires Administrator privileges. Please run as Administrator."
    exit 1
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Disable Windows 11 24H2 Modern Telemetry Suite" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "[INFO] DryRun Mode : $([bool]$DryRun)" -ForegroundColor Cyan

# 1. Stop and Disable Modern Telemetry Services
Write-Host "`n[INFO] Disabling Windows diagnostic and telemetry background services..." -ForegroundColor Cyan
$telemetryServices = @("DiagTrack", "dmwappushservice")

foreach ($svcName in $telemetryServices) {
    try {
        $svc = Get-Service -Name $svcName -ErrorAction SilentlyContinue
        if ($svc) {
            if ($DryRun) {
                Write-Host "  [DRY-RUN] Would stop and set service '$svcName' startup type to Disabled." -ForegroundColor Yellow
            } else {
                if ($svc.Status -eq 'Running') {
                    Stop-Service -Name $svcName -Force -ErrorAction SilentlyContinue
                }
                Set-Service -Name $svcName -StartupType Disabled -ErrorAction SilentlyContinue
                Write-Host "  [OK] Service '$svcName' stopped and disabled." -ForegroundColor Green
            }
        } else {
            Write-Host "  [INFO] Service '$svcName' is not present on this system." -ForegroundColor DarkGray
        }
    } catch {
        Write-Host "  [WARN] Failed to configure service '$svcName': $($_.Exception.Message)" -ForegroundColor DarkGray
    }
}

# 2. Disable Windows 11 24H2 Scheduled Telemetry & CEIP Tasks
Write-Host "`n[INFO] Disabling Windows 11 24H2 scheduled telemetry and diagnostic data collection tasks..." -ForegroundColor Cyan

$modernTasks = @(
    "\Microsoft\Windows\Customer Experience Improvement Program\Consolidator",
    "\Microsoft\Windows\Customer Experience Improvement Program\UsbCeip",
    "\Microsoft\Windows\Customer Experience Improvement Program\KernelCeipTask",
    "\Microsoft\Windows\Customer Experience Improvement Program\BthSQM",
    "\Microsoft\Windows\Application Experience\Microsoft Compatibility Appraiser",
    "\Microsoft\Windows\Application Experience\ProgramDataUpdater",
    "\Microsoft\Windows\Application Experience\StartupAppTask",
    "\Microsoft\Windows\Application Experience\PcaPatchDbTask",
    "\Microsoft\Windows\Application Experience\MareBackup",
    "\Microsoft\Windows\Feedback\Siuf\DmClient",
    "\Microsoft\Windows\Feedback\Siuf\DmClientOnScenarioDownload",
    "\Microsoft\Windows\DiskDiagnostic\Microsoft-Windows-DiskDiagnosticDataCollector",
    "\Microsoft\Windows\DiskDiagnostic\Microsoft-Windows-DiskDiagnosticResolver",
    "\Microsoft\Windows\Windows Error Reporting\QueueReporting",
    "\Microsoft\Windows\Autochk\Proxy",
    "\Microsoft\Windows\Device Information\Device",
    "\Microsoft\Windows\Device Information\Device User"
)

$disabledTaskCount = 0
foreach ($taskPath in $modernTasks) {
    $taskName = Split-Path -Path $taskPath -Leaf
    $taskDir  = Split-Path -Path $taskPath -Parent

    try {
        $task = Get-ScheduledTask -TaskPath "$taskDir\" -TaskName $taskName -ErrorAction SilentlyContinue
        if ($task) {
            if ($DryRun) {
                Write-Host "  [DRY-RUN] Would disable task: $taskName ($taskDir)" -ForegroundColor Yellow
                $disabledTaskCount++
            } else {
                Disable-ScheduledTask -TaskPath "$taskDir\" -TaskName $taskName -ErrorAction SilentlyContinue | Out-Null
                Write-Host "  [OK] Disabled task: $taskName" -ForegroundColor Green
                $disabledTaskCount++
            }
        }
    } catch {
        # Task absent on this edition or build
    }
}

# 3. Apply Group Policy Telemetry Restrictions via Registry
Write-Host "`n[INFO] Applying Windows 11 24H2 diagnostic data collection policy restrictions..." -ForegroundColor Cyan

$policyRegistrySettings = @(
    @{
        Key   = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\DataCollection"
        Name  = "AllowTelemetry"
        Value = 0
    },
    @{
        Key   = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\DataCollection"
        Name  = "MaxTelemetryAllowed"
        Value = 0
    },
    @{
        Key   = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\DataCollection"
        Name  = "DoNotShowFeedbackNotifications"
        Value = 1
    },
    @{
        Key   = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\Windows Error Reporting"
        Name  = "Disabled"
        Value = 1
    },
    @{
        Key   = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\Windows Error Reporting"
        Name  = "DoNotSendAdditionalData"
        Value = 1
    },
    @{
        Key   = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\CloudContent"
        Name  = "DisableWindowsConsumerFeatures"
        Value = 1
    },
    @{
        Key   = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\AdvertisingInfo"
        Name  = "DisabledByGroupPolicy"
        Value = 1
    }
)

foreach ($setting in $policyRegistrySettings) {
    if ($DryRun) {
        Write-Host "  [DRY-RUN] Would set $($setting.Key) -> $($setting.Name) = $($setting.Value)" -ForegroundColor Yellow
    } else {
        try {
            if (-not (Test-Path $setting.Key)) {
                New-Item -Path $setting.Key -Force -ErrorAction SilentlyContinue | Out-Null
            }
            Set-ItemProperty -Path $setting.Key -Name $setting.Name -Value $setting.Value -Type DWord -Force -ErrorAction SilentlyContinue
            Write-Host "  [OK] Set $($setting.Name) = $($setting.Value)" -ForegroundColor Green
        } catch {
            Write-Host "  [WARN] Could not set $($setting.Name): $($_.Exception.Message)" -ForegroundColor DarkGray
        }
    }
}

Write-Host "`n==========================================================" -ForegroundColor Green
if ($DryRun) {
    Write-Host "[DRY-RUN] Windows 11 24H2 telemetry disabler simulation completed." -ForegroundColor Yellow
} else {
    Write-Host "[OK] Windows 11 24H2 modern telemetry services and tasks disabled." -ForegroundColor Green
}
Write-Host "==========================================================" -ForegroundColor Green

exit 0
