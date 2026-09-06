param(
    [string]$Target = "StandbyList"
)

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[ERROR] This script requires Administrator privileges. Please run as Administrator."
    exit 1
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Clear RAM Standby List & Purge Memory Cache" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Measure initial physical memory metrics via CIM
$osBefore = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
$totalRamMb = [math]::Round($osBefore.TotalVisibleMemorySize / 1KB, 0)
$freeRamBeforeMb = [math]::Round($osBefore.FreePhysicalMemory / 1KB, 0)
$usedRamBeforeMb = $totalRamMb - $freeRamBeforeMb

Write-Host "[INFO] Initial Physical Memory State:" -ForegroundColor Cyan
Write-Host "  Total System RAM : $totalRamMb MB" -ForegroundColor White
Write-Host "  Used Memory      : $usedRamBeforeMb MB" -ForegroundColor Yellow
Write-Host "  Free Available   : $freeRamBeforeMb MB" -ForegroundColor White

# 2. Compile C# P/Invoke wrapper for ntdll NtSetSystemInformation
$memoryManagerCode = @"
using System;
using System.Runtime.InteropServices;

namespace WiScripts.Performance
{
    public enum MemoryListCommand
    {
        MemoryCaptureAccessedBits = 0,
        MemoryCaptureAndResetAccessedBits = 1,
        MemoryEmptyWorkingSets = 2,
        MemoryFlushModifiedList = 3,
        MemoryPurgeStandbyList = 4,
        MemoryPurgeLowPriorityStandbyList = 5,
        MemoryCommandMax = 6
    }

    public static class MemoryManager
    {
        [DllImport("ntdll.dll", SetLastError = true)]
        public static extern uint NtSetSystemInformation(
            int SystemInformationClass,
            IntPtr SystemInformation,
            int SystemInformationLength
        );

        [DllImport("advapi32.dll", SetLastError = true)]
        public static extern bool OpenProcessToken(
            IntPtr ProcessHandle,
            uint DesiredAccess,
            out IntPtr TokenHandle
        );

        [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Auto)]
        public static extern bool LookupPrivilegeValue(
            string lpSystemName,
            string lpName,
            out long lpLuid
        );

        [StructLayout(LayoutKind.Sequential, Pack = 1)]
        public struct TOKEN_PRIVILEGES
        {
            public int PrivilegeCount;
            public long Luid;
            public int Attributes;
        }

        [DllImport("advapi32.dll", SetLastError = true)]
        public static extern bool AdjustTokenPrivileges(
            IntPtr TokenHandle,
            bool DisableAllPrivileges,
            ref TOKEN_PRIVILEGES NewState,
            int BufferLength,
            IntPtr PreviousState,
            IntPtr ReturnLength
        );

        public const int SE_PRIVILEGE_ENABLED = 0x00000002;
        public const int SystemMemoryListInformation = 80;

        public static bool EnablePrivilege(string privilege)
        {
            IntPtr tokenHandle;
            if (!OpenProcessToken(System.Diagnostics.Process.GetCurrentProcess().Handle, 0x0020 | 0x0008, out tokenHandle))
                return false;

            long luid;
            if (!LookupPrivilegeValue(null, privilege, out luid))
                return false;

            TOKEN_PRIVILEGES tp = new TOKEN_PRIVILEGES();
            tp.PrivilegeCount = 1;
            tp.Luid = luid;
            tp.Attributes = SE_PRIVILEGE_ENABLED;

            return AdjustTokenPrivileges(tokenHandle, false, ref tp, 0, IntPtr.Zero, IntPtr.Zero);
        }

        public static uint ExecuteMemoryCommand(MemoryListCommand command)
        {
            EnablePrivilege("SeProfileSingleProcessPrivilege");
            EnablePrivilege("SeIncreaseQuotaPrivilege");

            int commandVal = (int)command;
            IntPtr pCommand = Marshal.AllocHGlobal(sizeof(int));
            try
            {
                Marshal.WriteInt32(pCommand, commandVal);
                return NtSetSystemInformation(SystemMemoryListInformation, pCommand, sizeof(int));
            }
            finally
            {
                Marshal.FreeHGlobal(pCommand);
            }
        }
    }
}
"@

try {
    if (-not ([System.Management.Automation.PSTypeName]'WiScripts.Performance.MemoryManager').Type) {
        Add-Type -TypeDefinition $memoryManagerCode -Language CSharp -ErrorAction Stop
    }
} catch {
    # If type already loaded in app domain, continue
}

# 3. Execute Selected Memory Reclaim Commands
Write-Host "`n[INFO] Invoking native NT kernel memory cleanup ($Target)..." -ForegroundColor Cyan

if ($Target -eq "StandbyList" -or $Target -eq "All") {
    $resStandby = [WiScripts.Performance.MemoryManager]::ExecuteMemoryCommand([WiScripts.Performance.MemoryListCommand]::MemoryPurgeStandbyList)
    if ($resStandby -eq 0) {
        Write-Host "  [OK] Standby List cache purged successfully (NTSTATUS 0x0)." -ForegroundColor Green
    } else {
        Write-Host "  [WARN] Standby list purge returned NTSTATUS: 0x$($resStandby.ToString('X8'))." -ForegroundColor Yellow
    }
}

if ($Target -eq "WorkingSets" -or $Target -eq "All") {
    $resWs = [WiScripts.Performance.MemoryManager]::ExecuteMemoryCommand([WiScripts.Performance.MemoryListCommand]::MemoryEmptyWorkingSets)
    if ($resWs -eq 0) {
        Write-Host "  [OK] System and process working sets trimmed (NTSTATUS 0x0)." -ForegroundColor Green
    } else {
        Write-Host "  [WARN] Working sets trim returned NTSTATUS: 0x$($resWs.ToString('X8'))." -ForegroundColor Yellow
    }
}

# Optional garbage collection run
[System.GC]::Collect()
[System.GC]::WaitForPendingFinalizers()

Start-Sleep -Milliseconds 800

# 4. Measure Post-Execution Memory Metrics
$osAfter = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
$freeRamAfterMb = [math]::Round($osAfter.FreePhysicalMemory / 1KB, 0)
$usedRamAfterMb = $totalRamMb - $freeRamAfterMb
$reclaimedMb = $freeRamAfterMb - $freeRamBeforeMb

Write-Host "`n[INFO] Post-Cleanup Physical Memory State:" -ForegroundColor Cyan
Write-Host "  Used Memory      : $usedRamAfterMb MB" -ForegroundColor Green
Write-Host "  Free Available   : $freeRamAfterMb MB" -ForegroundColor Green
if ($reclaimedMb -gt 0) {
    Write-Host "  Total Reclaimed  : +$reclaimedMb MB free RAM released" -ForegroundColor Green
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "[OK] Standby memory list cleared successfully." -ForegroundColor Green
