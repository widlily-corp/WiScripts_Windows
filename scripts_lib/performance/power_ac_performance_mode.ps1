# Requires -RunAsAdministrator

Write-Host ">>> APPLYING AC PROFILE (MAX PERFORMANCE) <<<" -ForegroundColor Yellow

# 1. Смена схемы питания
$ultimatePerfGUID = "e9a42b02-d5df-448d-aa00-03f14749eb61"
$highPerfGUID = "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c"

# Активация Ultimate Performance, если она скрыта
powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61 | Out-Null

$planOutput = powercfg /setactive $ultimatePerfGUID 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Ultimate Performance not available, trying High Performance..."
    powercfg /setactive $highPerfGUID
    if ($LASTEXITCODE -ne 0) {
        Write-Host "High Performance not available, keeping current plan..."
    } else {
        Write-Host "Switched to High Performance."
    }
} else {
    Write-Host "Switched to Ultimate Performance."
}

# 2. Настройка процессора (100% для максимального буста)
$currentPlan = (powercfg /getactivescheme) -match "GUID: ([-0-9a-f]+)" | Out-Null; $currentPlan = $matches[1]
powercfg /setacvalueindex $currentPlan SUB_PROCESSOR PROCTHROTTLEMAX 100
powercfg /setdcvalueindex $currentPlan SUB_PROCESSOR PROCTHROTTLEMAX 100
powercfg /setacvalueindex $currentPlan SUB_PROCESSOR PROCTHROTTLEMIN 0
powercfg /setdcvalueindex $currentPlan SUB_PROCESSOR PROCTHROTTLEMIN 0
Write-Host "Processor state set to Max 100%, Min 0%."

# Отключение парковки ядер (Core Parking) для максимальной отзывчивости (если поддерживается)
powercfg /setacvalueindex $currentPlan SUB_PROCESSOR CPMINCORES 100
powercfg /setacvalueindex $currentPlan SUB_PROCESSOR CPMAXCORES 100

# 3. PCI Express ASPM (Off)
powercfg /setacvalueindex $currentPlan SUB_PCIEXPRESS ASAPM 0
Write-Host "PCI Express ASPM turned OFF."

# 4. Включение системных служб
$servicesToStart = @(
    "SysMain", # Superfetch для кэширования
    "WSearch"
)

foreach ($svc in $servicesToStart) {
    if (Get-Service $svc -ErrorAction SilentlyContinue | Where-Object {$_.StartType -ne 'Disabled'}) {
        Start-Service -Name $svc -ErrorAction SilentlyContinue
        Write-Host "Started service: $svc"
    }
}

# 5. Возобновление Office ClickToRun
if (Get-Service "ClickToRunSvc" -ErrorAction SilentlyContinue | Where-Object {$_.StartType -ne 'Disabled'}) {
    Start-Service "ClickToRunSvc" -ErrorAction SilentlyContinue
    Write-Host "Started Office ClickToRun Service."
}

Write-Host ">>> AC PROFILE APPLIED <<<" -ForegroundColor Green
