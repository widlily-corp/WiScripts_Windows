param(
    [switch]$Detailed
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Graphics Hardware & GPU Telemetry" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Query installed display controllers via CIM
$adapters = Get-CimInstance -ClassName Win32_VideoController -ErrorAction SilentlyContinue

if (-not $adapters -or $adapters.Count -eq 0) {
    Write-Host "[WARN] No active display adapters detected via Win32_VideoController." -ForegroundColor Yellow
    exit 0
}

$adapterIndex = 1
foreach ($gpu in $adapters) {
    $gpuName = if ($gpu.Name) { $gpu.Name } else { "Generic Display Adapter" }
    $processor = if ($gpu.VideoProcessor) { $gpu.VideoProcessor } else { "N/A" }
    $driverVer = if ($gpu.DriverVersion) { $gpu.DriverVersion } else { "N/A" }
    $driverDate = if ($gpu.DriverDate) { (Get-Date $gpu.DriverDate).ToString("yyyy-MM-dd") } else { "N/A" }
    $status = if ($gpu.Status) { $gpu.Status } else { "Unknown" }
    
    # Calculate VRAM with 64-bit uint conversion
    $rawRam = [uint64]0
    if ($gpu.AdapterRAM) {
        $rawRam = [uint64]$gpu.AdapterRAM
    }
    
    $vramFormatted = "N/A"
    if ($rawRam -gt 0) {
        if ($rawRam -ge 1GB) {
            $vramFormatted = "$([math]::Round($rawRam / 1GB, 2)) GB"
        } else {
            $vramFormatted = "$([math]::Round($rawRam / 1MB, 0)) MB"
        }
    }
    
    # Resolution and refresh rate
    $resH = $gpu.CurrentHorizontalResolution
    $resV = $gpu.CurrentVerticalResolution
    $refresh = $gpu.CurrentRefreshRate
    
    $displayMode = "Not Connected / Headless"
    if ($resH -and $resV) {
        $displayMode = "${resH}x${resV} @ ${refresh}Hz"
    }

    Write-Host "`n[GPU #$adapterIndex] $gpuName" -ForegroundColor Yellow
    Write-Host "  Processor        : $processor" -ForegroundColor White
    Write-Host "  Dedicated VRAM   : $vramFormatted" -ForegroundColor White
    Write-Host "  Driver Version   : $driverVer (Released: $driverDate)" -ForegroundColor White
    Write-Host "  Active Mode      : $displayMode" -ForegroundColor White
    Write-Host "  Hardware Status  : $status" -ForegroundColor White
    
    if ($Detailed) {
        $pnpId = if ($gpu.PNPDeviceID) { $gpu.PNPDeviceID } else { "N/A" }
        $bitsPerPixel = if ($gpu.CurrentBitsPerPixel) { "$($gpu.CurrentBitsPerPixel) bits" } else { "N/A" }
        $compat = if ($gpu.AdapterCompatibility) { $gpu.AdapterCompatibility } else { "N/A" }
        
        Write-Host "  Device ID        : $pnpId" -ForegroundColor Gray
        Write-Host "  Color Depth      : $bitsPerPixel" -ForegroundColor Gray
        Write-Host "  Compatibility    : $compat" -ForegroundColor Gray
    }
    
    $adapterIndex++
}

# Check for DirectX Version in Registry
try {
    $dxKey = Get-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\DirectX" -ErrorAction SilentlyContinue
    if ($dxKey -and $dxKey.Version) {
        Write-Host "`n[INFO] Installed DirectX Version: $($dxKey.Version)" -ForegroundColor Cyan
    }
} catch {
    # Ignore registry read errors
}

# Check for NVIDIA Telemetry via nvidia-smi
$nvidiaSmiPaths = @(
    "nvidia-smi.exe",
    "$env:ProgramFiles\NVIDIA Corporation\NVSMI\nvidia-smi.exe",
    "$env:SystemDrive\Windows\System32\DriverStore\FileRepository\nv*\nvidia-smi.exe"
)

$nvidiaSmi = $null
foreach ($pathCandidate in $nvidiaSmiPaths) {
    $cmd = Get-Command $pathCandidate -ErrorAction SilentlyContinue
    if ($cmd) {
        $nvidiaSmi = $cmd.Source
        break
    }
    $resolved = Resolve-Path $pathCandidate -ErrorAction SilentlyContinue
    if ($resolved) {
        $nvidiaSmi = $resolved.Path
        break
    }
}

if ($nvidiaSmi) {
    Write-Host "`n[INFO] Querying live NVIDIA GPU Telemetry via nvidia-smi..." -ForegroundColor Cyan
    try {
        $smiOutput = & $nvidiaSmi --query-gpu=name,temperature.gpu,utilization.gpu,utilization.memory,memory.used,memory.total,power.draw --format=csv,noheader,nounits 2>$null
        if ($smiOutput) {
            foreach ($line in $smiOutput) {
                $parts = $line.Split(',') | ForEach-Object { $_.Trim() }
                if ($parts.Count -ge 7) {
                    Write-Host "  GPU Model        : $($parts[0])" -ForegroundColor Green
                    Write-Host "  Core Temperature : $($parts[1]) °C" -ForegroundColor Green
                    Write-Host "  GPU Core Load    : $($parts[2])%" -ForegroundColor Green
                    Write-Host "  VRAM Utilization : $($parts[3])%" -ForegroundColor Green
                    Write-Host "  Memory Allocated : $($parts[4]) MB / $($parts[5]) MB" -ForegroundColor Green
                    Write-Host "  Power Draw       : $($parts[6]) W" -ForegroundColor Green
                }
            }
        }
    } catch {
        # Silent fallback
    }
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "[OK] GPU telemetry collection completed." -ForegroundColor Green
