<#
.SYNOPSIS
    Тест стабильности интернет-соединения: Packet Loss, Jitter и Latency Benchmark.
.DESCRIPTION
    Отправляет серию ICMP пакетов по 3 ключевым узлам:
    1. Локальный основной шлюз (Роутер по наименьшей метрике маршрута)
    2. Региональный DNS (Yandex 77.88.8.8)
    3. Международный CDN (Cloudflare 1.1.1.1)
    Рассчитывает Min/Avg/Max задержку, джиттер (вариацию задержки) и процент потерь.
.PARAMETER Count
    Количество пакетов на каждый узел (по умолчанию 10).
#>

[CmdletBinding()]
param(
    [int]$Count = 10,
    [string]$RemoteHost = "1.1.1.1"
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "SilentlyContinue"

Write-Host "`n===============================================================" -ForegroundColor Cyan
Write-Host "      INTERNET STABILITY, JITTER & PACKET LOSS BENCHMARK       " -ForegroundColor White
Write-Host "===============================================================" -ForegroundColor Cyan

# Поиск основного физического шлюза по минимальной метрике
$routes = Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue | Sort-Object -Property RouteMetric
$primaryGw = ($routes | Select-Object -First 1).NextHop

$targets = [System.Collections.Generic.List[PSCustomObject]]::new()
if ($primaryGw -and $primaryGw -ne "0.0.0.0") {
    $targets.Add([PSCustomObject]@{ Label = "1. Основной шлюз (Router)"; Target = $primaryGw })
}
$targets.Add([PSCustomObject]@{ Label = "2. Региональный узел (Yandex)"; Target = "77.88.8.8" })
$targets.Add([PSCustomObject]@{ Label = "3. Международный CDN (Cloudflare)"; Target = $RemoteHost })

function Get-JitterStats([string]$HostTarget, [int]$PacketCount) {
    Write-Host "  Тестирование $HostTarget ($PacketCount пакетов)..." -NoNewline -ForegroundColor DarkGray
    
    $pings = Test-Connection -ComputerName $HostTarget -Count $PacketCount -ErrorAction SilentlyContinue
    $received = ($pings | Measure-Object).Count
    $lossPct = [math]::Round((($PacketCount - $received) / $PacketCount) * 100, 1)
    
    if ($received -eq 0) {
        Write-Host " [НЕТ ОТВЕТА]" -ForegroundColor Red
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
    
    # Вычисление джиттера (среднее абсолютное отклонение последовательных пакетов)
    $jitterSum = 0
    for ($i = 1; $i -lt $latencies.Count; $i++) {
        $jitterSum += [math]::Abs($latencies[$i] - $latencies[$i - 1])
    }
    $jitter = if ($latencies.Count -gt 1) { [math]::Round($jitterSum / ($latencies.Count - 1), 2) } else { 0 }
    
    Write-Host " [ГОТОВО]" -ForegroundColor Green
    
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
        "Узел назначения" = "$($t.Label) [$($t.Target)]"
        "Min"             = $res.MinMs
        "Avg"             = $res.AvgMs
        "Max"             = $res.MaxMs
        "Джиттер (Jitter)"= $res.JitterMs
        "Потери (Loss)"   = $res.Loss
        "Оценка"          = $res.Status
    }
}

Write-Host "`n"
$results | Format-Table -AutoSize

Write-Host "Ориентиры качества:" -ForegroundColor DarkGray
Write-Host "  - Джиттер < 5ms: идеальное качество для игр / WebRTC / звонков" -ForegroundColor DarkGray
Write-Host "  - Джиттер > 20ms или Loss > 1%: нестабильный Wi-Fi или перегрузка канала" -ForegroundColor DarkGray
Write-Host "===============================================================" -ForegroundColor Cyan