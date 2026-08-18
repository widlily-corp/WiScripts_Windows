param()

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    throw "Registering a scheduled task requires Administrator privileges. Please run PowerShell as Administrator."
}

$taskName = "AutoPowerProfileSwitcher"
$targetDir = if ($env:ProgramData) { Join-Path $env:ProgramData "WiScripts" } else { Join-Path $env:LOCALAPPDATA "WiScripts" }

if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir -Force -ErrorAction SilentlyContinue | Out-Null
}

$managerScript = Join-Path $targetDir "power_switch_manager.ps1"

$managerContent = @'
# WiScripts Auto Power Profile Switcher
try {
    Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
    $status = [System.Windows.Forms.SystemInformation]::PowerLineStatus
} catch {
    $status = "Unknown"
}

$ultimatePerfGUID = "e9a42b02-d5df-448d-aa00-03f14749eb61"
$highPerfGUID     = "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c"
$powerSaverGUID   = "a1841308-3541-4fab-bc81-f71556f20b4a"
$balancedGUID     = "381b4222-f694-41f0-9685-ff5bb260df2e"

if ($status -eq "Offline") {
    $res = powercfg /setactive $powerSaverGUID 2>&1
    if ($LASTEXITCODE -ne 0) {
        powercfg /setactive $balancedGUID 2>$null
    }
    powercfg /setdcvalueindex SCHEME_CURRENT SUB_PROCESSOR PROCTHROTTLEMAX 95 2>$null
    powercfg /setactive SCHEME_CURRENT 2>$null
} else {
    powercfg -duplicatescheme $ultimatePerfGUID 2>$null | Out-Null
    $res = powercfg /setactive $ultimatePerfGUID 2>&1
    if ($LASTEXITCODE -ne 0) {
        powercfg /setactive $highPerfGUID 2>$null
    }
    powercfg /setacvalueindex SCHEME_CURRENT SUB_PROCESSOR PROCTHROTTLEMAX 100 2>$null
    powercfg /setactive SCHEME_CURRENT 2>$null
}
'@

Set-Content -Path $managerScript -Value $managerContent -Encoding UTF8 -Force

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Removed existing task '$taskName'."
}

$xml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Triggers>
    <EventTrigger>
      <Enabled>true</Enabled>
      <Subscription>&lt;QueryList&gt;&lt;Query Id="0" Path="System"&gt;&lt;Select Path="System"&gt;*[System[Provider[@Name='Microsoft-Windows-Kernel-Power'] and (EventID=105)]]&lt;/Select&gt;&lt;/Query&gt;&lt;/QueryList&gt;</Subscription>
    </EventTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>S-1-5-18</UserId>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>false</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>true</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT1H</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>PowerShell.exe</Command>
      <Arguments>-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "$managerScript"</Arguments>
    </Exec>
  </Actions>
</Task>
"@

$tempXml = if ($env:TEMP) { $env:TEMP } else { $env:USERPROFILE }
$xmlPath = Join-Path $tempXml "PowerTask.xml"
$xml | Out-File $xmlPath -Encoding UTF8
Register-ScheduledTask -Xml (Get-Content $xmlPath -Raw) -TaskName $taskName -Force -ErrorAction SilentlyContinue | Out-Null
Remove-Item $xmlPath -ErrorAction SilentlyContinue

Write-Host "Task '$taskName' successfully registered." -ForegroundColor Green
Write-Host "Deployed manager script to: $managerScript" -ForegroundColor Cyan
Write-Host "Triggers automatically on AC/Battery switch (Kernel-Power Event 105)."
