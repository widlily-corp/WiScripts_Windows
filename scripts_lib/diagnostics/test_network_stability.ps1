param(
    [int]$Count = 10,
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

# Bounded jitter & latency engine (1000ms per-packet timeout, 3500ms max target budget)
function Get-JitterStats([string]$HostTarget, [int]$PacketCount, [int]$MaxTargetTimeoutMs = 3500) {
    Write-Host "  Testing $HostTarget ($PacketCount packets)..." -NoNewline -ForegroundColor DarkGray
    
    $pinger = [System.Net.NetworkInformation.Ping]::new()
    $latencies = [System.Collections.Generic.List[double]]::new()
    $sent = 0
    $consecutiveFailures = 0
    $swTarget = [System.Diagnostics.Stopwatch]::StartNew()
    $perPacketTimeoutMs = 1000

    for ($i = 0; $i -lt $PacketCount; $i++) {
        if ($swTarget.ElapsedMilliseconds -ge $MaxTargetTimeoutMs) {
            break
        }

        $sent++
        try {
            $reply = $pinger.Send($HostTarget, $perPacketTimeoutMs)
            if ($reply.Status -eq [System.Net.NetworkInformation.IPStatus]::Success) {
                $latencies.Add([double]$reply.RoundtripTime)
                $consecutiveFailures = 0
            } else {
                $consecutiveFailures++
            }
        } catch {
            $consecutiveFailures++
        }

        # Early exit on confirmed dead target (2 consecutive timeouts and >=2000ms elapsed)
        if ($latencies.Count -eq 0 -and $consecutiveFailures -ge 2 -and $swTarget.ElapsedMilliseconds -ge 2000) {
            break
        }

        if ($i -lt ($PacketCount - 1)) {
            Start-Sleep -Milliseconds 60
        }
    }
    $swTarget.Stop()
    $pinger.Dispose()

    $received = $latencies.Count
    $lossPct = if ($sent -gt 0) { [math]::Round((($sent - $received) / $sent) * 100, 1) } else { 100 }

    if ($received -eq 0) {
        Write-Host " [NO REPLY in $($swTarget.ElapsedMilliseconds)ms]" -ForegroundColor Red
        return [PSCustomObject]@{
            MinMs = "N/A"
            MaxMs = "N/A"
            AvgMs = "N/A"
            JitterMs = "N/A"
            Loss = "100%"
            Status = "CRITICAL"
        }
    }

    $min = ($latencies | Measure-Object -Minimum).Minimum
    $max = ($latencies | Measure-Object -Maximum).Maximum
    $avg = ($latencies | Measure-Object -Average).Average

    $jitterSum = 0
    for ($j = 1; $j -lt $latencies.Count; $j++) {
        $jitterSum += [math]::Abs($latencies[$j] - $latencies[$j - 1])
    }
    $jitter = if ($latencies.Count -gt 1) { [math]::Round($jitterSum / ($latencies.Count - 1), 2) } else { 0 }

    Write-Host " [DONE in $($swTarget.ElapsedMilliseconds)ms]" -ForegroundColor Green

    $status = if ($lossPct -gt 5 -or $jitter -gt 30) { "BAD" } elseif ($lossPct -gt 0 -or $jitter -gt 15) { "WARN" } else { "EXCELLENT" }

    return [PSCustomObject]@{
        MinMs = "$min ms"
        MaxMs = "$max ms"
        AvgMs = "$([math]::Round($avg, 1)) ms"
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

exit 0
