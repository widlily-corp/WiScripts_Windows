param(
    [string]$TargetHost = "1.1.1.1",
    [int]$PacketCount = 10,
    [switch]$CheckMTU
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " WiScripts: Network Latency, Jitter & MTU Diagnostics" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Clamp packet count to safe boundary (3..50)
if ($PacketCount -lt 3) { $PacketCount = 3 }
if ($PacketCount -gt 50) { $PacketCount = 50 }

# 1. Discover Default Gateway
$gateway = $null
try {
    $routes = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue
    if ($routes) {
        $gateway = ($routes | Select-Object -First 1).NextHop
    }
} catch {
    # Ignore routing query failure
}

$targets = @()
if ($gateway -and $gateway -ne "0.0.0.0") {
    $targets += [PSCustomObject]@{ Label = "Local Gateway"; Host = $gateway }
}
$targets += [PSCustomObject]@{ Label = "National DNS"; Host = "77.88.8.8" }
$targets += [PSCustomObject]@{ Label = "Global Anycast / Target"; Host = $TargetHost }

function Test-NodeLatency {
    param([string]$HostName, [string]$NodeLabel, [int]$Count)
    
    Write-Host "`n[Benchmarking $NodeLabel -> $HostName ($Count ICMP probes)]" -ForegroundColor Yellow
    
    $pinger = New-Object System.Net.NetworkInformation.Ping
    $latencies = @()
    $lostPackets = 0
    
    for ($i = 1; $i -le $Count; $i++) {
        try {
            $reply = $pinger.Send($HostName, 1500)
            if ($reply.Status -eq [System.Net.NetworkInformation.IPStatus]::Success) {
                $latencies += $reply.RoundtripTime
            } else {
                $lostPackets++
            }
        } catch {
            $lostPackets++
        }
        Start-Sleep -Milliseconds 60
    }
    
    $received = $latencies.Count
    $lossRate = [math]::Round(($lostPackets / $Count) * 100, 1)
    
    if ($received -eq 0) {
        Write-Host "  [FAIL] 100% Packet Loss - Node unreachable." -ForegroundColor Red
        return
    }
    
    $min = ($latencies | Measure-Object -Minimum).Minimum
    $max = ($latencies | Measure-Object -Maximum).Maximum
    $avg = [math]::Round(($latencies | Measure-Object -Average).Average, 2)
    
    # Calculate Jitter (Mean Absolute Successive Difference)
    $jitter = 0.0
    if ($latencies.Count -gt 1) {
        $diffSum = 0
        for ($j = 0; $j -lt ($latencies.Count - 1); $j++) {
            $diffSum += [math]::Abs($latencies[$j + 1] - $latencies[$j])
        }
        $jitter = [math]::Round($diffSum / ($latencies.Count - 1), 2)
    }
    
    $statusColor = "Green"
    if ($lossRate -gt 0 -or $avg -gt 100 -or $jitter -gt 20) {
        $statusColor = "Yellow"
    }
    if ($lossRate -gt 10 -or $avg -gt 250) {
        $statusColor = "Red"
    }
    
    Write-Host "  Min Latency  : $min ms" -ForegroundColor White
    Write-Host "  Avg Latency  : $avg ms" -ForegroundColor $statusColor
    Write-Host "  Max Latency  : $max ms" -ForegroundColor White
    Write-Host "  Jitter (Dev) : $jitter ms" -ForegroundColor $statusColor
    Write-Host "  Packet Loss  : $lossRate% ($lostPackets/$Count lost)" -ForegroundColor $statusColor
}

foreach ($target in $targets) {
    Test-NodeLatency -HostName $target.Host -NodeLabel $target.Label -Count $PacketCount
}

# 2. DNS Resolution Benchmark
Write-Host "`n[DNS Resolution Latency Benchmark]" -ForegroundColor Cyan
$dnsTestDomains = @("google.com", "cloudflare.com", "yandex.ru", "github.com")
foreach ($domain in $dnsTestDomains) {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $resolved = [System.Net.Dns]::GetHostAddresses($domain)
        $sw.Stop()
        $addrStr = ($resolved | Select-Object -First 2 | ForEach-Object { $_.IPAddressToString }) -join ", "
        Write-Host "  $domain -> $addrStr ($($sw.ElapsedMilliseconds) ms)" -ForegroundColor Green
    } catch {
        $sw.Stop()
        Write-Host "  $domain -> Resolution Failed ($($sw.ElapsedMilliseconds) ms)" -ForegroundColor Red
    }
}

# 3. Path MTU Discovery Test
if ($CheckMTU) {
    Write-Host "`n[Path MTU / Fragmentation Benchmark (Don't Fragment Test)]" -ForegroundColor Cyan
    $testSizes = @(1500, 1492, 1472, 1460, 1400)
    $maxValidMtu = 0
    
    foreach ($size in $testSizes) {
        $payloadSize = $size - 28 # Subtract 20-byte IP header + 8-byte ICMP header
        if ($payloadSize -le 0) { continue }
        
        $pingArgs = "-n 1 -f -l $payloadSize $TargetHost"
        $pingProc = Start-Process -FilePath "ping.exe" -ArgumentList $pingArgs -NoNewWindow -Wait -PassThru -ErrorAction SilentlyContinue
        
        if ($pingProc.ExitCode -eq 0) {
            Write-Host "  [OK] Packet Size: $size bytes (Payload: $payloadSize B) -> No fragmentation" -ForegroundColor Green
            if ($size -gt $maxValidMtu) { $maxValidMtu = $size }
        } else {
            Write-Host "  [WARN] Packet Size: $size bytes (Payload: $payloadSize B) -> Packet fragmented or dropped" -ForegroundColor Yellow
        }
    }
    
    if ($maxValidMtu -gt 0) {
        Write-Host "`n  Recommended Optimum MTU: $maxValidMtu bytes" -ForegroundColor Cyan
    }
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "[OK] Network latency and diagnostic benchmark completed." -ForegroundColor Green
