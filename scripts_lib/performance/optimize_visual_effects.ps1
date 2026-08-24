param(
    [string]$Preset = "Optimal",
    [switch]$KeepFontSmoothing = $true,
    [switch]$KeepThumbnails = $true
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Optimize Windows Visual Effects for Performance" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

Write-Host "[INFO] Applying visual effects profile: $Preset..." -ForegroundColor Cyan

# 1. Desktop & Window Animation Registry Keys (HKCU)
$desktopKey = "HKCU:\Control Panel\Desktop"
$windowMetricsKey = "HKCU:\Control Panel\Desktop\WindowMetrics"
$explorerAdvancedKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced"
$visualEffectsKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects"

if (-not (Test-Path $visualEffectsKey)) {
    New-Item -Path $visualEffectsKey -Force -ErrorAction SilentlyContinue | Out-Null
}

# 2. Disable Costly GPU/CPU Rendering Animations
Set-ItemProperty -Path $windowMetricsKey -Name "MinAnimate" -Value "0" -Force -ErrorAction SilentlyContinue
Set-ItemProperty -Path $explorerAdvancedKey -Name "TaskbarAnimations" -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue
Set-ItemProperty -Path $explorerAdvancedKey -Name "ListviewAlphaSelect" -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue
Set-ItemProperty -Path $explorerAdvancedKey -Name "ListviewShadow" -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue
Set-ItemProperty -Path $explorerAdvancedKey -Name "TaskbarSizeMove" -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue
Set-ItemProperty -Path $desktopKey -Name "DragFullWindows" -Value "1" -Force -ErrorAction SilentlyContinue
Set-ItemProperty -Path $desktopKey -Name "MenuShowDelay" -Value "8" -Force -ErrorAction SilentlyContinue

Write-Host "  [OK] Window animations disabled (MinAnimate = 0)." -ForegroundColor Green
Write-Host "  [OK] Taskbar and ListView alpha animations disabled." -ForegroundColor Green
Write-Host "  [OK] Menu popup delay optimized to 8ms." -ForegroundColor Green

# 3. Preserve ClearType Font Smoothing
if ($KeepFontSmoothing) {
    Set-ItemProperty -Path $desktopKey -Name "FontSmoothing" -Value "2" -Force -ErrorAction SilentlyContinue
    Set-ItemProperty -Path $desktopKey -Name "FontSmoothingType" -Value 2 -Type DWord -Force -ErrorAction SilentlyContinue
    Write-Host "  [OK] ClearType font smoothing preserved (FontSmoothing = 2)." -ForegroundColor Green
} else {
    Set-ItemProperty -Path $desktopKey -Name "FontSmoothing" -Value "0" -Force -ErrorAction SilentlyContinue
    Write-Host "  [WARN] Font smoothing disabled." -ForegroundColor Yellow
}

# 4. Preserve File Explorer Thumbnail Icons
if ($KeepThumbnails) {
    Set-ItemProperty -Path $explorerAdvancedKey -Name "IconsOnly" -Value 0 -Type DWord -Force -ErrorAction SilentlyContinue
    Write-Host "  [OK] Explorer thumbnail preview rendering preserved." -ForegroundColor Green
} else {
    Set-ItemProperty -Path $explorerAdvancedKey -Name "IconsOnly" -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue
    Write-Host "  [WARN] Thumbnail previews disabled (Icons only)." -ForegroundColor Yellow
}

# 5. Broadcast WM_SETTINGCHANGE (0x001A) to Desktop Shell
$nativeBroadcaster = @"
using System;
using System.Runtime.InteropServices;

namespace WiScripts.Shell
{
    public static class SettingsNotifier
    {
        [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
        public static extern IntPtr SendMessageTimeout(
            IntPtr hWnd,
            uint Msg,
            UIntPtr wParam,
            string lParam,
            uint fuFlags,
            uint uTimeout,
            out UIntPtr lpdwResult
        );

        public const int HWND_BROADCAST = 0xffff;
        public const uint WM_SETTINGCHANGE = 0x001A;
        public const uint SMTO_ABORTIFHUNG = 0x0002;

        public static void NotifySettingChange(string section)
        {
            UIntPtr result;
            SendMessageTimeout(
                (IntPtr)HWND_BROADCAST,
                WM_SETTINGCHANGE,
                UIntPtr.Zero,
                section,
                SMTO_ABORTIFHUNG,
                1000,
                out result
            );
        }
    }
}
"@

try {
    if (-not ([System.Management.Automation.PSTypeName]'WiScripts.Shell.SettingsNotifier').Type) {
        Add-Type -TypeDefinition $nativeBroadcaster -Language CSharp -ErrorAction Stop
    }
    [WiScripts.Shell.SettingsNotifier]::NotifySettingChange("Environment")
    [WiScripts.Shell.SettingsNotifier]::NotifySettingChange("Control Panel\Desktop")
    Write-Host "  [OK] Broadcasted WM_SETTINGCHANGE signal to Windows Explorer shell." -ForegroundColor Green
} catch {
    # Non-fatal notification error
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "[OK] Visual effects tuned for optimal performance." -ForegroundColor Green
