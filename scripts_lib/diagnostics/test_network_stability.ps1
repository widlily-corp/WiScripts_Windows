param(
    [int]$Count = 4,
    [string]$RemoteHost = "1.1.1.1"
)

$ErrorActionPreference = "SilentlyContinue"

Write-Host "`n===============================================================" -ForegroundColor Cyan
Write-Host "      INTERNET STABILITY, JITTER & PACKET LOSS BENCHMARK       " -ForegroundColor White
Write-Host "===============================================================" -ForegroundColor Cyan

$routes = Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue | Sort-Object -Property RouteMetric
$primaryGw = ($routes | Select-Object -First 1).NextHop

$targets = [System.Collections.Generic.List[PSCustomObject]]::new()
if ($primaryGw -and $primaryGw -ne "0.0.0.0") {
    $targets.Add([PSCustomObject]@{ Label = "1. Local Gateway (Router)"; Target = $primaryGw })
}
$targets.Add([PSCustomObject]@{ Label = "2. Regional DNS (Yandex)"; Target = "77.88.8.8" })
$targets.Add([PSCustomObject]@{ Label = "3. Global CDN (Cloudflare)"; Target = $RemoteHost })

function Get-JitterStats([string]$HostTarget, [int]$PacketCount) {
    Write-Host "  Testing $HostTarget ($PacketCount packets)..." -NoNewline -ForegroundColor DarkGray
    
    $pings = Test-Connection -ComputerName $HostTarget -Count $PacketCount -ErrorAction SilentlyContinue
    $received = ($pings | Measure-Object).Count
    $lossPct = [math]::Round((($PacketCount - $received) / $PacketCount) * 100, 1)
    
    if ($received -eq 0) {
        Write-Host " [NO REPLY]" -ForegroundColor Red
        return [PSCustomObject]@{
            MinMs = "N/A"
            MaxMs = "N/A"
            AvgMs = "N/A"
            JitterMs = "N/A"
            Loss = "100%"
            Status = "CRITICAL"
        }
    }
    
    $latencies = $pings | ForEach-Object { [double]$_.ResponseTime }
    $stats = $latencies | Measure-Object -Minimum -Maximum -Average
    
    $jitterSum = 0
    for ($i = 1; $i -lt $latencies.Count; $i++) {
        $jitterSum += [math]::Abs($latencies[$i] - $latencies[$i - 1])
    }
    $jitter = if ($latencies.Count -gt 1) { [math]::Round($jitterSum / ($latencies.Count - 1), 2) } else { 0 }
    
    Write-Host " [DONE]" -ForegroundColor Green
    
    $status = if ($lossPct -gt 5 -or $jitter -gt 30) { "BAD" } elseif ($lossPct -gt 0 -or $jitter -gt 15) { "WARN" } else { "EXCELLENT" }
    
    return [PSCustomObject]@{
        MinMs = "$($stats.Minimum) ms"
        MaxMs = "$($stats.Maximum) ms"
        AvgMs = "$([math]::Round($stats.Average, 1)) ms"
        JitterMs = "$jitter ms"
        Loss = "$lossPct %"
        Status = $status
    }
}

$results = foreach ($t in $targets) {
    $res = Get-JitterStats -HostTarget $t.Target -PacketCount $Count
    [PSCustomObject]@{
        "Target Node"     = "$($t.Label) [$($t.Target)]"
        "Min"             = $res.MinMs
        "Avg"             = $res.AvgMs
        "Max"             = $res.MaxMs
        "Jitter"          = $res.JitterMs
        "Packet Loss"     = $res.Loss
        "Quality"         = $res.Status
    }
}

Write-Host "`n"
$results | Format-Table -AutoSize

Write-Host "Quality Benchmarks:" -ForegroundColor DarkGray
Write-Host "  * Jitter < 5ms: Ideal for Gaming / WebRTC / VoIP Calls" -ForegroundColor DarkGray
Write-Host "  * Jitter > 20ms or Loss > 1%: Unstable Wi-Fi or ISP congestion" -ForegroundColor DarkGray
Write-Host "===============================================================" -ForegroundColor Cyan
