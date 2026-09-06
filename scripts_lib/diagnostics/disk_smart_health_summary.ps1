param(
    [switch]$IncludePartitions
)

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[INFO] Running in Standard User mode. Storage device summary is available without elevation." -ForegroundColor Cyan
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Physical Disk SMART Health & Drive Diagnostics" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Query physical disks via Storage module
$disks = Get-PhysicalDisk -ErrorAction SilentlyContinue

if (-not $disks -or $disks.Count -eq 0) {
    Write-Host "[WARN] No physical disks discovered via Get-PhysicalDisk cmdlet." -ForegroundColor Yellow
    exit 0
}

# Query WMI SMART failure prediction flags
$smartFlags = @{}
try {
    $smartWmi = Get-CimInstance -Namespace "root\wmi" -ClassName "MSStorageDriver_FailurePredictStatus" -ErrorAction SilentlyContinue
    if ($smartWmi) {
        foreach ($s in $smartWmi) {
            $instanceName = $s.InstanceName
            $smartFlags[$instanceName] = $s.PredictFailure
        }
    }
} catch {
    # Non-fatal if WMI namespace is unpopulated
}

$diskIndex = 0
foreach ($disk in $disks) {
    $diskIndex++
    $friendlyName = if ($disk.FriendlyName) { $disk.FriendlyName } else { "Physical Disk #$diskIndex" }
    $mediaType    = if ($disk.MediaType) { $disk.MediaType } else { "Unspecified" }
    $busType      = if ($disk.BusType) { $disk.BusType } else { "Unknown" }
    $healthStatus = if ($disk.HealthStatus) { $disk.HealthStatus } else { "Unknown" }
    $opStatus     = if ($disk.OperationalStatus) { ($disk.OperationalStatus -join ", ") } else { "OK" }
    
    # Calculate disk capacity
    $sizeBytes = [uint64]0
    if ($disk.Size) {
        $sizeBytes = [uint64]$disk.Size
    }
    
    $sizeFormatted = "0 GB"
    if ($sizeBytes -ge 1TB) {
        $sizeFormatted = "$([math]::Round($sizeBytes / 1TB, 2)) TB"
    } elseif ($sizeBytes -ge 1GB) {
        $sizeFormatted = "$([math]::Round($sizeBytes / 1GB, 1)) GB"
    }
    
    # Health status badge
    $healthColor = "Green"
    $healthBadge = "[OK] Healthy"
    if ($healthStatus -eq "Warning") {
        $healthColor = "Yellow"
        $healthBadge = "[WARN] Warning"
    } elseif ($healthStatus -eq "Unhealthy") {
        $healthColor = "Red"
        $healthBadge = "[FAIL] Degraded/Unhealthy"
    }

    Write-Host "`n[$diskIndex] Physical Drive: $friendlyName" -ForegroundColor Cyan
    Write-Host "  Health Status      : $healthBadge" -ForegroundColor $healthColor
    Write-Host "  Media Type         : $mediaType" -ForegroundColor White
    Write-Host "  Interface / Bus    : $busType" -ForegroundColor White
    Write-Host "  Storage Capacity   : $sizeFormatted" -ForegroundColor White
    Write-Host "  Operational Status : $opStatus" -ForegroundColor White

    # Query Extended Storage Reliability Counters if available
    try {
        $reliability = Get-StorageReliabilityCounter -PhysicalDisk $disk -ErrorAction SilentlyContinue
        if ($reliability) {
            if ($reliability.Temperature -and $reliability.Temperature -gt 0 -and $reliability.Temperature -lt 150) {
                Write-Host "  Drive Temperature  : $($reliability.Temperature) °C" -ForegroundColor White
            }
            if ($reliability.Wear -ne $null -and $reliability.Wear -ge 0) {
                Write-Host "  Flash Wear Level   : $($reliability.Wear)%" -ForegroundColor White
            }
            if ($reliability.ReadErrorsTotal -ne $null) {
                Write-Host "  Read Errors Total  : $($reliability.ReadErrorsTotal)" -ForegroundColor White
            }
            if ($reliability.WriteErrorsTotal -ne $null) {
                Write-Host "  Write Errors Total : $($reliability.WriteErrorsTotal)" -ForegroundColor White
            }
            if ($reliability.PowerOnHours -ne $null -and $reliability.PowerOnHours -gt 0) {
                $days = [math]::Round($reliability.PowerOnHours / 24, 0)
                Write-Host "  Power-On Hours     : $($reliability.PowerOnHours) hrs (~$days days)" -ForegroundColor White
            }
        }
    } catch {
        # Optional telemetry
    }

    # Query partitions and mapped volumes if requested
    if ($IncludePartitions) {
        try {
            $diskObj = Get-Disk -Number $disk.DeviceId -ErrorAction SilentlyContinue
            if ($diskObj) {
                $partStyle = $diskObj.PartitionStyle
                Write-Host "  Partition Style    : $partStyle" -ForegroundColor Gray
                
                $partitions = Get-Partition -DiskNumber $disk.DeviceId -ErrorAction SilentlyContinue
                if ($partitions) {
                    foreach ($p in $partitions) {
                        $driveLetter = if ($p.DriveLetter) { "$($p.DriveLetter):" } else { "System/Hidden" }
                        $partSize = if ($p.Size) { "$([math]::Round($p.Size / 1GB, 1)) GB" } else { "N/A" }
                        Write-Host "    -> Partition $($p.PartitionNumber) [$driveLetter] Size: $partSize ($($p.Type))" -ForegroundColor DarkGray
                    }
                }
            }
        } catch {
            # Non-fatal partition lookup failure
        }
    }
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "[OK] Disk SMART health analysis completed." -ForegroundColor Green
