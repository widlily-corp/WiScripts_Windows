# Requires -RunAsAdministrator

Write-Host ">>> APPLYING BATTERY PROFILE (MAX AUTONOMY) <<<" -ForegroundColor Yellow

# 1. Смена схемы питания
$powerSaverGUID = "a1841308-3541-4fab-bc81-f71556f20b4a"
$balancedGUID = "381b4222-f694-41f0-9685-ff5bb260df2e"

# Попытка установить Экономию энергии, если нет - Сбалансированную
$planOutput = powercfg /setactive $powerSaverGUID 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Power Saver plan not found, setting Balanced..."
    powercfg /setactive $balancedGUID
} else {
    Write-Host "Switched to Power Saver plan."
}

# 2. Настройка процессора (Отключение Turbo Boost через Max Processor State)
# Устанавливаем максимальное состояние процессора на 95% для текущей схемы
$currentPlan = (powercfg /getactivescheme) -match "GUID: ([-0-9a-f]+)" | Out-Null; $currentPlan = $matches[1]
powercfg /setdcvalueindex $currentPlan SUB_PROCESSOR PROCTHROTTLEMAX 95
powercfg /setacvalueindex $currentPlan SUB_PROCESSOR PROCTHROTTLEMAX 95
powercfg /setdcvalueindex $currentPlan SUB_PROCESSOR PROCTHROTTLEMIN 0
powercfg /setacvalueindex $currentPlan SUB_PROCESSOR PROCTHROTTLEMIN 0
Write-Host "Max CPU state set to 95%, Min to 0%."

# 3. PCI Express ASPM (Maximum Power Savings)
powercfg /setdcvalueindex $currentPlan SUB_PCIEXPRESS ASAPM 2
Write-Host "PCI Express ASPM set to Maximum Power Savings."

# 4. Отключение "тяжелых" служб
$servicesToStop = @(
    "SysMain", # Superfetch
    "DiagTrack", # Connected User Experiences and Telemetry
    "WSearch", # Windows Search
    "CompatTelRunner", # Telemetry runner
    "AMD External Events Utility",
    "AMD Crash Defender Service"
)

foreach ($svc in $servicesToStop) {
    if (Get-Service $svc -ErrorAction SilentlyContinue | Where-Object {$_.Status -eq 'Running'}) {
        Stop-Service -Name $svc -Force -ErrorAction SilentlyContinue
        Write-Host "Stopped service: $svc"
    }
}

# 5. Приостановка фоновых задач, жрущих CPU
# Например, Office ClickToRun
if (Get-Service "ClickToRunSvc" -ErrorAction SilentlyContinue | Where-Object {$_.Status -eq 'Running'}) {
    Stop-Service "ClickToRunSvc" -Force -ErrorAction SilentlyContinue
    Write-Host "Stopped Office ClickToRun Service."
}

Write-Host ">>> BATTERY PROFILE APPLIED <<<" -ForegroundColor Green
