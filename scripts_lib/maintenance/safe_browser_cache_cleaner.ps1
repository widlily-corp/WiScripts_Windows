param(
    [string]$TargetBrowsers = "All",
    [switch]$CloseRunningBrowsers,
    [switch]$DryRun
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Safe Web Browser Cache Cleaner" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Optionally close running browser processes
if ($CloseRunningBrowsers) {
    Write-Host "[INFO] Checking active web browser processes..." -ForegroundColor Cyan
    $browserProcessNames = @("chrome", "msedge", "brave", "browser", "firefox")
    $foundProcs = @()
    foreach ($procName in $browserProcessNames) {
        $procs = Get-Process -Name $procName -ErrorAction SilentlyContinue
        if ($procs) {
            $foundProcs += $procName
            if ($DryRun) {
                Write-Host "  [DRY-RUN] Would terminate active process: $procName (PIDs: $(($procs | Select-Object -ExpandProperty Id) -join ', '))" -ForegroundColor Yellow
            } else {
                $procs | Stop-Process -Force -ErrorAction SilentlyContinue
                Write-Host "  [OK] Terminated active process: $procName" -ForegroundColor Yellow
            }
        }
    }
    if (-not $DryRun -and $foundProcs.Count -gt 0) {
        Start-Sleep -Milliseconds 1000
    }
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

# High-performance .NET batch file enumeration and deletion
function Clear-CacheDirectoryFast {
    param(
        [string]$DirectoryPath,
        [ref]$ReclaimedBytes,
        [ref]$DeletedCount,
        [bool]$IsDryRun
    )

    if (-not [System.IO.Directory]::Exists($DirectoryPath)) { return }

    # 1. Enumerate and delete files in current folder
    try {
        $files = [System.IO.Directory]::EnumerateFiles($DirectoryPath)
        foreach ($filePath in $files) {
            try {
                $fi = [System.IO.FileInfo]::new($filePath)
                $len = $fi.Length
                if (-not $IsDryRun) {
                    [System.IO.File]::Delete($filePath)
                }
                $ReclaimedBytes.Value += [uint64]$len
                $DeletedCount.Value++

                # Batch progress reporting every 2500 files to avoid terminal flooding while keeping UI responsive
                if ($DeletedCount.Value % 2500 -eq 0) {
                    $curMb = [math]::Round($ReclaimedBytes.Value / 1MB, 1)
                    $actionVerb = if ($IsDryRun) { "scanned" } else { "purged" }
                    Write-Host "    ... $actionVerb $($DeletedCount.Value) files ($curMb MB)" -ForegroundColor DarkGray
                }
            } catch {
                # Locked file in use by active browser or permission constraint, skip safely
            }
        }
    } catch {
        # Directory access error, skip safely
    }

    # 2. Recurse into subdirectories
    try {
        $subDirs = [System.IO.Directory]::EnumerateDirectories($DirectoryPath)
        foreach ($subDir in $subDirs) {
            Clear-CacheDirectoryFast -DirectoryPath $subDir -ReclaimedBytes $ReclaimedBytes -DeletedCount $DeletedCount -IsDryRun $IsDryRun
            if (-not $IsDryRun) {
                try {
                    # Purge empty subdirectory if all child files were cleaned
                    [System.IO.Directory]::Delete($subDir, $false)
                } catch {
                    # Subdirectory not empty due to locked files or access denied, ignore
                }
            }
        }
    } catch {
        # Subdirectory access error, skip safely
    }
}

$totalReclaimedBytes = [uint64]0
$totalPurgedFiles = 0

foreach ($browser in $browserDefinitions) {
    if ($TargetBrowsers -ne "All" -and $browser.Key -ne $TargetBrowsers -and $browser.Name -notlike "*$TargetBrowsers*") {
        continue
    }

    Write-Host "`n[INFO] Scanning $($browser.Name) cache folders..." -ForegroundColor Cyan
    $browserFreed = [uint64]0
    $browserDeletedFiles = 0

    foreach ($basePattern in $browser.BasePaths) {
        $resolvedBases = Resolve-Path -Path $basePattern -ErrorAction SilentlyContinue
        if (-not $resolvedBases) { continue }

        foreach ($base in $resolvedBases) {
            foreach ($sub in $browser.CacheSubDirs) {
                $targetDir = [System.IO.Path]::Combine($base.Path, $sub)
                if ([System.IO.Directory]::Exists($targetDir)) {
                    Clear-CacheDirectoryFast `
                        -DirectoryPath $targetDir `
                        -ReclaimedBytes ([ref]$browserFreed) `
                        -DeletedCount ([ref]$browserDeletedFiles) `
                        -IsDryRun ([bool]$DryRun)
                }
            }
        }
    }

    $freedMb = [math]::Round($browserFreed / 1MB, 2)
    $totalReclaimedBytes += $browserFreed
    $totalPurgedFiles += $browserDeletedFiles

    if ($DryRun) {
        Write-Host "  [DRY-RUN] $($browser.Name): Would reclaim $freedMb MB ($browserDeletedFiles files)." -ForegroundColor Yellow
    } else {
        Write-Host "  [OK] $($browser.Name): Reclaimed $freedMb MB ($browserDeletedFiles files purged)." -ForegroundColor Green
    }
}

$totalMb = [math]::Round($totalReclaimedBytes / 1MB, 2)
Write-Host "==========================================================" -ForegroundColor Green
if ($DryRun) {
    Write-Host "[DRY-RUN] Browser cache scan completed. Total space that would be freed: $totalMb MB ($totalPurgedFiles files)." -ForegroundColor Yellow
} else {
    Write-Host "[OK] Browser cache cleanup completed. Total space freed: $totalMb MB ($totalPurgedFiles files purged)." -ForegroundColor Green
}

exit 0
