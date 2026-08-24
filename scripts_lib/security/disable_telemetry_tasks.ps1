param(
    [switch]$DisableServices = $true,
    [switch]$DisableScheduledTasks = $true,
    [switch]$DisableRegistryTelemetry = $true
)

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    throw "This script requires Administrator privileges. Please run PowerShell as Administrator."
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Disable Windows Telemetry & Data Collection Tasks" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Disable Diagnostic and Telemetry Services
if ($DisableServices) {
    Write-Host "[INFO] Stopping and disabling background telemetry daemons..." -ForegroundColor Cyan
    $telemetryServices = @("DiagTrack", "dmwappushservice")
    
    foreach ($svc in $telemetryServices) {
        try {
            $service = Get-Service -Name $svc -ErrorAction SilentlyContinue
            if ($service) {
                if ($service.Status -eq 'Running') {
                    Stop-Service -Name $svc -Force -ErrorAction SilentlyContinue
                }
                Set-Service -Name $svc -StartupType Disabled -ErrorAction SilentlyContinue
                Write-Host "  [OK] Service '$svc' disabled." -ForegroundColor Green
            }
        } catch {
            Write-Host "  [WARN] Could not update service '$svc'." -ForegroundColor DarkGray
        }
    }
}

# 2. Disable Diagnostic & CEIP Scheduled Tasks
if ($DisableScheduledTasks) {
    Write-Host "`n[INFO] Disabling scheduled telemetry and diagnostic data collection tasks..." -ForegroundColor Cyan
    
    $telemetryTasks = @(
        "\Microsoft\Windows\Application Experience\Microsoft Compatibility Appraiser",
        "\Microsoft\Windows\Application Experience\ProgramDataUpdater",
        "\Microsoft\Windows\Application Experience\StartupAppTask",
        "\Microsoft\Windows\Customer Experience Improvement Program\Consolidator",
        "\Microsoft\Windows\Customer Experience Improvement Program\UsbCeip",
        "\Microsoft\Windows\Customer Experience Improvement Program\KernelCeipTask",
        "\Microsoft\Windows\DiskDiagnostic\Microsoft-Windows-DiskDiagnosticDataCollector",
        "\Microsoft\Windows\Feedback\Siuf\DmClient",
        "\Microsoft\Windows\Feedback\Siuf\DmClientOnScenarioDownload",
        "\Microsoft\Windows\Windows Error Reporting\QueueReporting",
        "\Microsoft\Windows\Autochk\Proxy"
    )
    
    foreach ($taskPath in $telemetryTasks) {
        $taskName = Split-Path -Path $taskPath -Leaf
        $taskDir  = Split-Path -Path $taskPath -Parent
        
        try {
            $task = Get-ScheduledTask -TaskPath "$taskDir\" -TaskName $taskName -ErrorAction SilentlyContinue
            if ($task) {
                Disable-ScheduledTask -TaskPath "$taskDir\" -TaskName $taskName -ErrorAction SilentlyContinue | Out-Null
                Write-Host "  [OK] Disabled task: $taskName" -ForegroundColor Green
            }
        } catch {
            # Task not present in this Windows build
        }
    }
}

# 3. Apply Group Policy Telemetry Restrictions via Registry
if ($DisableRegistryTelemetry) {
    Write-Host "`n[INFO] Applying privacy policy settings in Windows Registry..." -ForegroundColor Cyan
    
    $regDataCollection = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\DataCollection"
    if (-not (Test-Path $regDataCollection)) {
        New-Item -Path $regDataCollection -Force -ErrorAction SilentlyContinue | Out-Null
    }
    Set-ItemProperty -Path $regDataCollection -Name "AllowTelemetry" -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue
    Set-ItemProperty -Path $regDataCollection -Name "DoNotShowFeedbackNotifications" -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue
    Write-Host "  [OK] Set AllowTelemetry = 0 (Security Level)" -ForegroundColor Green

    $regWer = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\Windows Error Reporting"
    if (-not (Test-Path $regWer)) {
        New-Item -Path $regWer -Force -ErrorAction SilentlyContinue | Out-Null
    }
    Set-ItemProperty -Path $regWer -Name "Disabled" -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue
    Write-Host "  [OK] Windows Error Reporting telemetry disabled." -ForegroundColor Green
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "[OK] Telemetry and diagnostic data collection tasks disabled." -ForegroundColor Green
