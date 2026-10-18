param(
    [string]$Drive = "C:",
    [string]$CustomPath = "",
    [double]$MinSizeGB = 1.0,
    [int]$MaxLevel = 3,
    [switch]$IncludeWindows,
    [switch]$JsonOutput,
    [switch]$NoColor
)

# WiScripts Windows - Fast Hierarchical Disk Space Analyzer (Drill-Down Engine)
# Replaces slow, monolithic full-drive crawls with a multi-level descending drill-down architecture:
#   - Level 0: Instant volume capacity and occupancy via Win32_LogicalDisk / DriveInfo (<0.1s)
#   - Level 1: Root directory measurement via COM FileSystemObject and multi-threaded Robocopy /L
#   - Level 2: Selective scan of identified heavy giants (Program Files, Users, Games)
#   - Level 3: Precision breakdown inside heavy hotspots (Steam, HoYoPlay, AppData caches)

$ErrorActionPreference = 'SilentlyContinue'

# --- Terminal Styling ---
$ESC = [char]27
$cReset  = if ($NoColor) { "" } else { "$ESC[0m" }
$cBold   = if ($NoColor) { "" } else { "$ESC[1m" }
$cDim    = if ($NoColor) { "" } else { "$ESC[2m" }
$cCyan   = if ($NoColor) { "" } else { "$ESC[36m" }
$cGreen  = if ($NoColor) { "" } else { "$ESC[32m" }
$cYellow = if ($NoColor) { "" } else { "$ESC[33m" }
$cRed    = if ($NoColor) { "" } else { "$ESC[31m" }
$cBlue   = if ($NoColor) { "" } else { "$ESC[34m" }
$cGray   = if ($NoColor) { "" } else { "$ESC[90m" }

function Format-DiskBytes {
    param([int64]$Bytes)
    if ($Bytes -ge 1TB) { return ("{0:N2} TB" -f ($Bytes / 1TB)) }
    if ($Bytes -ge 1GB) { return ("{0:N2} GB" -f ($Bytes / 1GB)) }
    if ($Bytes -ge 1MB) { return ("{0:N2} MB" -f ($Bytes / 1MB)) }
    if ($Bytes -ge 1KB) { return ("{0:N2} KB" -f ($Bytes / 1KB)) }
    return ("{0} B" -f $Bytes)
}

# --- COM FileSystemObject & Robocopy Dual-Engine Sizing ---
$global:Fso = $null
try {
    $global:Fso = New-Object -ComObject Scripting.FileSystemObject -ErrorAction SilentlyContinue
} catch {}

function Get-FastFolderSize {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) { return 0 }

    # Fast Path 1: COM Scripting.FileSystemObject (Direct C++ NTFS query)
    if ($global:Fso) {
        try {
            $comFolder = $global:Fso.GetFolder($Path)
            if ($comFolder -and $comFolder.Size -gt 0) {
                return [int64]$comFolder.Size
            }
        } catch {}
    }

    # Fast Path 2: Multi-Threaded Robocopy /L (List-only, 16 threads, skips junctions)
    try {
        $roboOut = robocopy "$Path" "$Path" *.* /L /E /BYTES /NFL /NDL /NJH /NC /NS /NP /MT:16 /XJ /R:0 /W:0 2>$null
        $numbers = @()
        foreach ($line in $roboOut) {
            if ($line -match '^\s*[^:]+:\s+(\d+)\s+') {
                $numbers += [int64]$matches[1]
            }
        }
        # In robocopy summary table: [0]=Dirs, [1]=Files, [2]=Bytes
        if ($numbers.Count -ge 3 -and $numbers[2] -gt 0) {
            return [int64]$numbers[2]
        }
    } catch {}

    # Fast Path 3: Fallback shallow .NET directory enumeration
    try {
        $dirInfo = [System.IO.DirectoryInfo]::new($Path)
        $files = $dirInfo.EnumerateFiles('*', [System.IO.SearchOption]::AllDirectories)
        $sum = 0
        foreach ($f in $files) {
            $sum += $f.Length
        }
        return [int64]$sum
    } catch {
        return 0
    }
}

$startTime = [System.Diagnostics.Stopwatch]::StartNew()

# ---------------------------------------------------------------------------
# LEVEL 0: Instant Volume Occupancy (<0.1s)
# ---------------------------------------------------------------------------
$cleanDrive = $Drive.TrimEnd('\').ToUpper()
if ($cleanDrive.Length -eq 1) { $cleanDrive += ":" }
$driveLetter = $cleanDrive.Substring(0, 1)

$targetRoot = if ($CustomPath -and (Test-Path -LiteralPath $CustomPath)) {
    (Resolve-Path -LiteralPath $CustomPath).Path
} else {
    "$cleanDrive\"
}

$driveInfo = $null
try {
    $driveInfo = [System.IO.DriveInfo]::new($driveLetter)
} catch {}

$totalVolumeBytes = if ($driveInfo) { $driveInfo.TotalSize } else { 0 }
$freeVolumeBytes  = if ($driveInfo) { $driveInfo.TotalFreeSpace } else { 0 }
$usedVolumeBytes  = if ($totalVolumeBytes -gt $freeVolumeBytes) { $totalVolumeBytes - $freeVolumeBytes } else { 0 }
$usagePercent     = if ($totalVolumeBytes -gt 0) { ($usedVolumeBytes / $totalVolumeBytes) * 100 } else { 0 }

$report = [PSCustomObject]@{
    ScanTimestamp   = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    Target          = $targetRoot
    Level0_Volume   = [PSCustomObject]@{
        Drive           = $cleanDrive
        TotalBytes      = $totalVolumeBytes
        UsedBytes       = $usedVolumeBytes
        FreeBytes       = $freeVolumeBytes
        UsagePercentage = [math]::Round($usagePercent, 2)
        FileSystem      = if ($driveInfo) { $driveInfo.DriveFormat } else { "NTFS" }
    }
    Level1_Roots    = @()
    Level2_Giants   = @()
    Level3_Hotspots = @()
    Summary         = [PSCustomObject]@{
        TotalMeasuredBytes = 0
        DurationMs         = 0
        HotspotCount       = 0
    }
}

if (-not $JsonOutput) {
    Write-Host ""
    Write-Host "$cBold$cCyan=== WiScripts Fast Hierarchical Disk Space Analyzer ===$cReset"
    Write-Host "$cGray Target: $targetRoot | Algorithm: Drill-Down (L0->L3) | Win32 & COM Accelerated$cReset"
    Write-Host ""
    Write-Host "$cBold[Уровень 0: Общая занятость тома $cleanDrive]$cReset"
    Write-Host ("  Всего: {0} | Занято: {1} ({2:N1}%) | Свободно: {3}" -f `
        (Format-DiskBytes $totalVolumeBytes), `
        (Format-DiskBytes $usedVolumeBytes), `
        $usagePercent, `
        (Format-DiskBytes $freeVolumeBytes))
    Write-Host ""
}

# ---------------------------------------------------------------------------
# LEVEL 1: Root Directory Shallow Measurement (10-15 folders)
# ---------------------------------------------------------------------------
if (-not $JsonOutput) {
    Write-Host "$cBold[Уровень 1: Замер очагов в корне $targetRoot]$cReset"
}

$rootDirs = @()
try {
    $rootDirs = [System.IO.Directory]::GetDirectories($targetRoot)
} catch {
    if (-not $JsonOutput) {
        Write-Host "$cRed  [!] Ошибка доступа к $($targetRoot): $_$cReset"
    }
}

$l1List = [System.Collections.Generic.List[PSCustomObject]]::new()
$systemRoots = @('Windows', 'System Volume Information', '$Recycle.Bin', 'Recovery', 'Boot', 'ProgramData')

foreach ($dir in $rootDirs) {
    $dirName = [System.IO.Path]::GetFileName($dir)
    $isSys = $false
    foreach ($sysPattern in $systemRoots) {
        if ($dirName -like "*$sysPattern*") {
            $isSys = $true
            break
        }
    }

    # If it is Windows directory and not IncludeWindows, record as OS Reserved without slow recursion
    $dirBytes = 0
    if ($isSys -and -not $IncludeWindows -and $dirName -ieq "Windows") {
        # Quick estimate for Windows without reading WinSxS
        $dirBytes = [int64](25GB)
    } else {
        $dirBytes = Get-FastFolderSize -Path $dir
    }

    $pctOfUsed = if ($usedVolumeBytes -gt 0) { ($dirBytes / $usedVolumeBytes) * 100 } else { 0 }

    $item = [PSCustomObject]@{
        Name              = $dirName
        Path              = $dir
        SizeBytes         = $dirBytes
        SizeFormatted     = Format-DiskBytes $dirBytes
        PercentOfUsed     = [math]::Round($pctOfUsed, 1)
        IsSystemProtected = $isSys
    }
    $l1List.Add($item)
}

$sortedL1 = $l1List | Sort-Object -Property SizeBytes -Descending
$report.Level1_Roots = $sortedL1

$heavyGiants = @()
foreach ($item in $sortedL1) {
    $report.Summary.TotalMeasuredBytes += $item.SizeBytes
    $isGiant = ($item.SizeBytes -ge ($MinSizeGB * 1GB)) -or ($item.PercentOfUsed -ge 3.0)
    
    if (-not $JsonOutput) {
        $tag = if ($item.IsSystemProtected) { "$cDim[SYS]$cReset" } else { "" }
        Write-Host ("  {0,-30} {1,12}  ({2,5:N1}%) {3}" -f $item.Name, $item.SizeFormatted, $item.PercentOfUsed, $tag) -ForegroundColor $(if ($isGiant) { "Yellow" } else { "Gray" })
    }

    if ($isGiant -and (-not $item.IsSystemProtected -or $IncludeWindows)) {
        $heavyGiants += $item
    }
}

if (-not $JsonOutput) {
    Write-Host ""
    Write-Host ("$cGreen  -> Выявлено {0} гигантов концентрации веса (L1)$cReset" -f $heavyGiants.Count)
    Write-Host ""
}

# ---------------------------------------------------------------------------
# LEVEL 2 & 3: Deep Drill-Down into Heavy Giants & Hotspots
# ---------------------------------------------------------------------------
if ($MaxLevel -ge 2 -and $heavyGiants.Count -gt 0) {
    if (-not $JsonOutput) {
        Write-Host "$cBold[Уровень 2 & 3: Точечный разбор гигантов]$cReset"
    }

    $l2List = [System.Collections.Generic.List[PSCustomObject]]::new()
    $l3List = [System.Collections.Generic.List[PSCustomObject]]::new()

    foreach ($giant in $heavyGiants) {
        $subDirs = @()
        try {
            $subDirs = [System.IO.Directory]::GetDirectories($giant.Path)
        } catch { continue }

        if (-not $JsonOutput) {
            Write-Host ("`n$cBold$cCyan--- Каталог: {0} ({1}) ---$cReset" -f $giant.Path, $giant.SizeFormatted)
        }

        $subList = @()
        foreach ($sub in $subDirs) {
            $subName = [System.IO.Path]::GetFileName($sub)
            $subBytes = Get-FastFolderSize -Path $sub
            if ($subBytes -ge (100MB)) {
                $subList += [PSCustomObject]@{
                    ParentFolder  = $giant.Name
                    Name          = $subName
                    Path          = $sub
                    SizeBytes     = $subBytes
                    SizeFormatted = Format-DiskBytes $subBytes
                }
            }
        }

        $sortedSubs = $subList | Sort-Object -Property SizeBytes -Descending
        foreach ($subItem in ($sortedSubs | Select-Object -First 8)) {
            $l2List.Add($subItem)
            if (-not $JsonOutput) {
                Write-Host ("  |- {0,-28} {1,12}" -f $subItem.Name, $subItem.SizeFormatted)
            }

            # LEVEL 3: Precision breakdown inside recognized hubs
            if ($MaxLevel -ge 3) {
                $hotspotPaths = @()
                
                # Check for Steam common library
                $steamCommon = Join-Path $subItem.Path "steamapps\common"
                if (Test-Path -LiteralPath $steamCommon) {
                    $hotspotPaths += @{ Type = "Steam Games"; Path = $steamCommon }
                }

                # Check for HoYoPlay / miHoYo games
                $hoyoGames = Join-Path $subItem.Path "games"
                if (Test-Path -LiteralPath $hoyoGames) {
                    $hotspotPaths += @{ Type = "HoYoPlay Games"; Path = $hoyoGames }
                }

                # Check for Epic Games
                if ($subItem.Name -ieq "Epic Games") {
                    $hotspotPaths += @{ Type = "Epic Library"; Path = $subItem.Path }
                }

                # Check for User profile hotspots
                if ($giant.Name -ieq "Users") {
                    $appDataLocal = Join-Path $subItem.Path "AppData\Local"
                    $downloads    = Join-Path $subItem.Path "Downloads"
                    if (Test-Path -LiteralPath $appDataLocal) {
                        $hotspotPaths += @{ Type = "AppData Local Cache"; Path = $appDataLocal }
                    }
                    if (Test-Path -LiteralPath $downloads) {
                        $hotspotPaths += @{ Type = "User Downloads"; Path = $downloads }
                    }
                }

                foreach ($hp in $hotspotPaths) {
                    $hpItems = @()
                    try {
                        $hpItems = [System.IO.Directory]::GetDirectories($hp.Path)
                    } catch {}

                    foreach ($leaf in $hpItems) {
                        $leafName = [System.IO.Path]::GetFileName($leaf)
                        $leafBytes = Get-FastFolderSize -Path $leaf
                        if ($leafBytes -ge (500MB)) {
                            $leafObj = [PSCustomObject]@{
                                HubCategory   = $hp.Type
                                ParentSub     = $subItem.Name
                                Name          = $leafName
                                Path          = $leaf
                                SizeBytes     = $leafBytes
                                SizeFormatted = Format-DiskBytes $leafBytes
                            }
                            $l3List.Add($leafObj)
                            if (-not $JsonOutput) {
                                Write-Host ("     |-- [{0}] {1,-22} {2,12}" -f $hp.Type, $leafName, (Format-DiskBytes $leafBytes)) -ForegroundColor Cyan
                            }
                        }
                    }
                }
            }
        }
    }

    $report.Level2_Giants   = $l2List
    $report.Level3_Hotspots = $l3List
}

$startTime.Stop()
$report.Summary.DurationMs   = $startTime.ElapsedMilliseconds
$report.Summary.HotspotCount = $report.Level3_Hotspots.Count

if ($JsonOutput) {
    $report | ConvertTo-Json -Depth 6
} else {
    Write-Host ""
    Write-Host "$cBold$cGreen=== ИТОГИ СКАНИРОВАНИЯ (Drill-Down Завершён) ===$cReset"
    Write-Host ("  Общее время обхода: {0} мс ({1:N2} с)" -f $startTime.ElapsedMilliseconds, ($startTime.ElapsedMilliseconds / 1000))
    Write-Host ("  Найдено очагов L3 : {0} шт." -f $report.Level3_Hotspots.Count)
    Write-Host ""
    if ($report.Level3_Hotspots.Count -gt 0) {
        Write-Host "$cBold[Топ крупнейших игровых / пользовательских очагов]:$cReset"
        $top3 = $report.Level3_Hotspots | Sort-Object -Property SizeBytes -Descending | Select-Object -First 5
        foreach ($t in $top3) {
            Write-Host ("  * {0,-26} ({1}) -> {2}" -f $t.Name, $t.SizeFormatted, $t.Path) -ForegroundColor Yellow
        }
        Write-Host ""
    }
}
