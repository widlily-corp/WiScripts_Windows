param(
    [string]$TargetBrowsers = "All",
    [switch]$CloseRunningBrowsers
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Safe Web Browser Cache Cleaner" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Optionally close running browser processes
if ($CloseRunningBrowsers) {
    Write-Host "[INFO] Closing active web browser processes..." -ForegroundColor Cyan
    $browserProcessNames = @("chrome", "msedge", "brave", "browser", "firefox")
    foreach ($procName in $browserProcessNames) {
        $procs = Get-Process -Name $procName -ErrorAction SilentlyContinue
        if ($procs) {
            $procs | Stop-Process -Force -ErrorAction SilentlyContinue
            Write-Host "  [OK] Terminated active process: $procName" -ForegroundColor Yellow
        }
    }
    Start-Sleep -Milliseconds 1000
}

$localApp = $env:LOCALAPPDATA
$roamingApp = $env:APPDATA

# Define strictly safe cache subdirectories (excluding Cookies, Login Data, Bookmarks, History, Sessions)
$browserDefinitions = @(
    @{
        Name = "Google Chrome"
        Key = "Chrome"
        BasePaths = @(
            "$localApp\Google\Chrome\User Data\Default",
            "$localApp\Google\Chrome\User Data\Profile *"
        )
        CacheSubDirs = @("Cache\Cache_Data", "Code Cache", "GPUCache", "DawnCache", "ShaderCache", "GrShaderCache", "Crashpad\reports")
    },
    @{
        Name = "Microsoft Edge"
        Key = "Edge"
        BasePaths = @(
            "$localApp\Microsoft\Edge\User Data\Default",
            "$localApp\Microsoft\Edge\User Data\Profile *"
        )
        CacheSubDirs = @("Cache\Cache_Data", "Code Cache", "GPUCache", "DawnCache", "ShaderCache", "GrShaderCache", "Crashpad\reports")
    },
    @{
        Name = "Brave Browser"
        Key = "Brave"
        BasePaths = @(
            "$localApp\BraveSoftware\Brave-Browser\User Data\Default",
            "$localApp\BraveSoftware\Brave-Browser\User Data\Profile *"
        )
        CacheSubDirs = @("Cache\Cache_Data", "Code Cache", "GPUCache", "DawnCache", "ShaderCache", "GrShaderCache", "Crashpad\reports")
    },
    @{
        Name = "Yandex Browser"
        Key = "Yandex"
        BasePaths = @(
            "$localApp\Yandex\YandexBrowser\User Data\Default",
            "$localApp\Yandex\YandexBrowser\User Data\Profile *"
        )
        CacheSubDirs = @("Cache\Cache_Data", "Code Cache", "GPUCache", "DawnCache", "ShaderCache", "GrShaderCache")
    },
    @{
        Name = "Mozilla Firefox"
        Key = "Firefox"
        BasePaths = @(
            "$localApp\Mozilla\Firefox\Profiles\*"
        )
        CacheSubDirs = @("cache2\entries", "startupCache", "jumpListCache", "shader-cache")
    }
)

$totalReclaimedBytes = [uint64]0

foreach ($browser in $browserDefinitions) {
    if ($TargetBrowsers -ne "All" -and $browser.Key -ne $TargetBrowsers -and $browser.Name -notlike "*$TargetBrowsers*") {
        continue
    }

    Write-Host "`n[INFO] Scanning $($browser.Name) cache folders..." -ForegroundColor Cyan
    $browserFreed = [uint64]0
    $deletedFiles = 0

    foreach ($basePattern in $browser.BasePaths) {
        $resolvedBases = Resolve-Path -Path $basePattern -ErrorAction SilentlyContinue
        if (-not $resolvedBases) { continue }

        foreach ($base in $resolvedBases) {
            foreach ($sub in $browser.CacheSubDirs) {
                $targetDir = Join-Path -Path $base.Path -ChildPath $sub
                if (Test-Path $targetDir) {
                    $items = Get-ChildItem -Path $targetDir -Recurse -File -Force -ErrorAction SilentlyContinue
                    if ($items) {
                        foreach ($f in $items) {
                            try {
                                $len = $f.Length
                                Remove-Item -Path $f.FullName -Force -ErrorAction Stop
                                $browserFreed += [uint64]$len
                                $deletedFiles++
                            } catch {
                                # Locked file in use by active browser, skip safely
                            }
                        }
                    }
                }
            }
        }
    }

    $freedMb = [math]::Round($browserFreed / 1MB, 2)
    $totalReclaimedBytes += $browserFreed
    Write-Host "  [OK] $($browser.Name): Reclaimed $freedMb MB ($deletedFiles files purged)." -ForegroundColor Green
}

$totalMb = [math]::Round($totalReclaimedBytes / 1MB, 2)
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "[OK] Browser cache cleanup completed. Total space freed: $totalMb MB." -ForegroundColor Green
