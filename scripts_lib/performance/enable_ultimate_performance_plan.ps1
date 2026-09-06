param()

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[ERROR] This script requires Administrator privileges. Please run as Administrator."
    exit 1
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Windows Ultimate Performance Power Plan" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$ultimateGuid = "e9a42b02-d5df-448d-aa00-03f14749eb61"
$highPerfGuid = "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c"

Write-Host "Resolving Ultimate Performance power scheme..." -ForegroundColor Yellow
$targetGuid = $null
$existingSchemes = powercfg /list 2>&1 | Out-String

if ($existingSchemes -match '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\s+\([^\)]*(?:Ultimate|Максимальн)[^\)]*\)') {
    $targetGuid = $matches[1]
    Write-Host "  Found existing Ultimate Performance plan: $targetGuid" -ForegroundColor Green
} else {
    Write-Host "  Duplicating template Ultimate Performance scheme..." -ForegroundColor Yellow
    $dupOutput = powercfg -duplicatescheme $ultimateGuid 2>&1 | Out-String
    if ($dupOutput -match '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})') {
        $targetGuid = $matches[1]
    } else {
        $targetGuid = $highPerfGuid
    }
}

Write-Host "Activating Ultimate Performance plan ($targetGuid)..." -ForegroundColor Cyan
$setResult = powercfg /setactive $targetGuid 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "Ultimate Performance power plan is now ACTIVE." -ForegroundColor Green
} else {
    Write-Host "Ultimate Performance scheme not supported, falling back to High Performance." -ForegroundColor Yellow
    $null = powercfg /setactive $highPerfGuid 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "High Performance power plan is now ACTIVE." -ForegroundColor Green
    }
}

Write-Host "==========================================================" -ForegroundColor Green
