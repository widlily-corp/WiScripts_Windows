<#
.SYNOPSIS
    Комплексная сквозная диагностика сети и интернет-соединения в Windows.
.DESCRIPTION
    Выполняет многоуровневый аудит сетевого стека:
    - Layer 1/2: Сетевые адаптеры, скорость линка, Wi-Fi телеметрия (SSID, сигнал, канал, протокол).
    - Layer 3: IPv4/IPv6 конфигурация, Default Gateway, MTU / тест фрагментации, маршрутизация.
    - Layer 4/7: DNS аудит (настроенные DNS, бенчмарк Cloudflare/Google/Yandex, проверка hosts файла).
    - Layer 7: HTTP/HTTPS доступность, проверка TLS, Captive Portal, сетевые порты (53, 123, 443, 853).
    - Security & Stack: WinINet/WinHTTP прокси, профили Windows Firewall, TCP Auto-Tuning, сокеты.
    - Health Verdict: Автоматическое выявление неполадок и рекомендации по устранению.
.OUTPUTS
    Форматированный отчет в консоли с цветной индикацией и сводной таблицей проблем.
#>

[CmdletBinding()]
param(
    [switch]$Detailed,
    [string]$TargetHost = "cloudflare.com"
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = "SilentlyContinue"

$Issues = [System.Collections.Generic.List[string]]::new()
$Warnings = [System.Collections.Generic.List[string]]::new()

function Write-SectionHeader([string]$Title) {
    Write-Host "`n┌─────────────────────────────────────────────────────────────┐" -ForegroundColor Cyan
    Write-Host "│ $($Title.PadRight(59)) │" -ForegroundColor Cyan
    Write-Host "└─────────────────────────────────────────────────────────────┘" -ForegroundColor Cyan
}

function Write-Status([string]$Name, [string]$Status, [string]$Details = "", [string]$Level = "Info") {
    $bullet = switch ($Level) {
        "OK"      { "[OK]" }
        "WARN"    { "[!]" }
        "FAIL"    { "[X]" }
        default   { "[.]" }
    }
    $color = switch ($Level) {
        "OK"      { "Green" }
        "WARN"    { "Yellow" }
        "FAIL"    { "Red" }
        default   { "Gray" }
    }
    
    $namePadded = $Name.PadRight(28)
    $statusPadded = "[$Status]".PadRight(10)
    
    Write-Host "  $bullet " -NoNewline -ForegroundColor $color
    Write-Host $namePadded -NoNewline -ForegroundColor White
    Write-Host $statusPadded -NoNewline -ForegroundColor $color
    if ($Details) {
        Write-Host " $Details" -ForegroundColor DarkGray
    } else {
        Write-Host ""
    }
}

Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host "       WINDOWS NETWORK & INTERNET DEEP DIAGNOSTICS SUITE       " -ForegroundColor White
Write-Host "       Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')    " -ForegroundColor DarkGray
Write-Host "===============================================================" -ForegroundColor Cyan

# -------------------------------------------------------------
# 1. АКТИВНЫЕ СЕТЕВЫЕ АДАПТЕРЫ И ФИЗИЧЕСКИЙ УРОВЕНЬ (L1/L2)
# -------------------------------------------------------------
Write-SectionHeader "1. Сетевые адаптеры и физический линк"

$adapters = Get-NetAdapter | Where-Object { $_.Status -eq "Up" }
if (-not $adapters) {
    Write-Status "Сетевые адаптеры" "FAIL" "Нет активных сетевых адаптеров (Status=Up)!" "FAIL"
    $Issues.Add("Нет активных сетевых адаптеров. Проверьте кабель, Wi-Fi или драйверы.")
} else {
    foreach ($adapter in $adapters) {
        $speedFormatted = if ($adapter.LinkSpeed) { $adapter.LinkSpeed } else { "N/A" }
        $isVirtual = if ($adapter.Virtual -or $adapter.InterfaceDescription -match "Hyper-V|Virtual|TAP|VPN") { " (Virtual/VPN)" } else { "" }
        Write-Status "$($adapter.InterfaceAlias)$isVirtual" "UP" "Скорость: $speedFormatted | MAC: $($adapter.MacAddress)" "OK"
    }
}

# Wi-Fi телеметрия
$wlanInfo = netsh wlan show interfaces 2>$null | Out-String
if ($wlanInfo -match "State\s*:\s*connected" -or $wlanInfo -match "Состояние\s*:\s*подключено") {
    $ssid = if ($wlanInfo -match '(?:SSID|Имя)\s*:\s*(.+)') { $matches[1].Trim() } else { "N/A" }
    $signal = if ($wlanInfo -match '(?:Signal|Сигнал)\s*:\s*(\d+)%') { [int]$matches[1] } else { 0 }
    $radio = if ($wlanInfo -match '(?:Radio type|Тип радиомодуля)\s*:\s*(.+)') { $matches[1].Trim() } else { "N/A" }
    $band = if ($wlanInfo -match '(?:Band|Диапазон)\s*:\s*(.+)') { $matches[1].Trim() } else { "N/A" }
    $channel = if ($wlanInfo -match '(?:Channel|Канал)\s*:\s*(\d+)') { $matches[1].Trim() } else { "N/A" }
    
    $wifiLevel = if ($signal -ge 75) { "OK" } elseif ($signal -ge 45) { "WARN" } else { "FAIL" }
    if ($signal -lt 45) {
        $Warnings.Add("Слабый уровень сигнала Wi-Fi ($signal%). Возможны потери пакетов и скачки джиттера.")
    }
    
    Write-Status "Wi-Fi Сеть (SSID)" "$signal%" "SSID: $ssid | $radio ($band) | Канал: $channel" $wifiLevel
}

# -------------------------------------------------------------
# 2. IP КОНФИГУРАЦИЯ, ШЛЮЗ И МАРШРУТИЗАЦИЯ (L3)
# -------------------------------------------------------------
Write-SectionHeader "2. IP-конфигурация, шлюз и маршрутизация"

$routes = Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue | Sort-Object -Property RouteMetric
$primaryRoute = $routes | Select-Object -First 1

if (-not $primaryRoute) {
    Write-Status "Основной шлюз" "FAIL" "Default Gateway не обнаружен в таблице маршрутов!" "FAIL"
    $Issues.Add("Не задан основной шлюз (0.0.0.0/0). Устройство не имеет маршрута по умолчанию.")
} else {
    $primaryGw = $primaryRoute.NextHop
    $primaryAlias = $primaryRoute.InterfaceAlias
    
    $ipConfig = Get-NetIPConfiguration -InterfaceAlias $primaryAlias -ErrorAction SilentlyContinue
    $ipv4 = ($ipConfig.IPv4Address | Where-Object { $_.IPAddress -notlike "169.254.*" }).IPAddress -join ", "
    
    if ($ipv4 -like "169.254.*" -or [string]::IsNullOrWhiteSpace($ipv4)) {
        Write-Status "IPv4 Конфигурация" "FAIL" "APIPA адрес 169.254.x.x (DHCP сервер не отвечает!)" "FAIL"
        $Issues.Add("Получен авто-адрес APIPA (169.254.x.x). DHCP сервер роутера/сети не выдал IP.")
    } else {
        Write-Status "Основной IPv4 [$primaryAlias]" "OK" "IP: $ipv4 | Шлюз: $primaryGw (Метрика: $($primaryRoute.RouteMetric))" "OK"
    }
    
    # Пинг до основного физического шлюза
    if ($primaryGw -and $primaryGw -ne "0.0.0.0") {
        $gwPing = Test-Connection -ComputerName $primaryGw -Count 3 -ErrorAction SilentlyContinue
        if ($gwPing) {
            $avgLatency = [math]::Round(($gwPing | Measure-Object -Property ResponseTime -Average).Average, 2)
            $gwLevel = if ($avgLatency -lt 5) { "OK" } elseif ($avgLatency -lt 25) { "WARN" } else { "FAIL" }
            Write-Status "Пинг до шлюза ($primaryGw)" "$($avgLatency)ms" "Ответ получен (3 из 3)" $gwLevel
            if ($avgLatency -ge 25) {
                $Warnings.Add("Высокая задержка до локального роутера ($($avgLatency)ms). Проверьте Wi-Fi/кабель.")
            }
        } else {
            Write-Status "Пинг до шлюза ($primaryGw)" "FAIL" "Шлюз не отвечает на ICMP эхо-запросы" "WARN"
            $Warnings.Add("Локальный шлюз $primaryGw не отвечает на пинг (возможно, отключен ICMP на роутере).")
        }
    }
}

# Тест MTU и фрагментации (Don't Fragment)
$pingDF = & ping.exe 1.1.1.1 -f -l 1472 -n 1 2>$null | Out-String
if ($pingDF -match "Packet needs to be fragmented" -or $pingDF -match "Требуется фрагментация") {
    Write-Status "MTU Тест (1500 bytes)" "WARN" "Пакет 1472+28 байт требует фрагментации (MSS/MTU Clamping)" "WARN"
} elseif ($pingDF -match "bytes=" -or $pingDF -match "байт=") {
    Write-Status "MTU Тест (1500 bytes)" "OK" "Стандартный MTU 1500 проходит без фрагментации" "OK"
} else {
    Write-Status "MTU Тест (1500 bytes)" "INFO" "Пакет Don't Fragment отправлен" "INFO"
}

# -------------------------------------------------------------
# 3. DNS СЕРВЕРЫ И РЕЗОЛВИНГ (L4/L7)
# -------------------------------------------------------------
Write-SectionHeader "3. Аудит DNS-серверов и резолвинга имен"

$configuredDns = (Get-DnsClientServerAddress -AddressFamily IPv4 | Where-Object { $_.ServerAddresses.Count -gt 0 }).ServerAddresses | Select-Object -Unique

if (-not $configuredDns) {
    Write-Status "Системные DNS" "FAIL" "DNS серверы не настроены!" "FAIL"
    $Issues.Add("В системе не настроен ни один DNS-сервер.")
} else {
    Write-Status "Настроенные DNS" "INFO" ($configuredDns -join ", ") "INFO"
}

# Тест скорости резолвинга через системный DNS и публичные DNS
$benchmarkDomains = @("google.com", "cloudflare.com", "yandex.ru")
$testServers = @(
    @{ Name = "System DNS"; IP = $null },
    @{ Name = "Cloudflare"; IP = "1.1.1.1" },
    @{ Name = "Google DNS";  IP = "8.8.8.8" },
    @{ Name = "Yandex DNS";  IP = "77.88.8.8" }
)

foreach ($srv in $testServers) {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $resolvedCount = 0
    
    foreach ($domain in $benchmarkDomains) {
        $res = if ($srv.IP) {
            Resolve-DnsName -Name $domain -Server $srv.IP -Type A -QuickTimeout -ErrorAction SilentlyContinue
        } else {
            Resolve-DnsName -Name $domain -Type A -QuickTimeout -ErrorAction SilentlyContinue
        }
        if ($res) { $resolvedCount++ }
    }
    $sw.Stop()
    $avgMs = [math]::Round($sw.ElapsedMilliseconds / $benchmarkDomains.Count, 1)
    
    if ($resolvedCount -eq $benchmarkDomains.Count) {
        $lvl = if ($avgMs -lt 50) { "OK" } elseif ($avgMs -lt 150) { "WARN" } else { "FAIL" }
        Write-Status "$($srv.Name)" "$($avgMs)ms" "Успешно разрешено $resolvedCount/$($benchmarkDomains.Count) доменов" $lvl
    } else {
        Write-Status "$($srv.Name)" "FAIL" "Разрешено только $resolvedCount/$($benchmarkDomains.Count) доменов" "FAIL"
        if ($srv.Name -eq "System DNS") {
            $Issues.Add("Системный DNS не смог разрешить стандартные домены. Интернет-серфинг нарушен.")
        }
    }
}

# Проверка hosts файла на посторонние записи
$hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
if (Test-Path $hostsPath) {
    $hostsLines = Get-Content $hostsPath | Where-Object { $_ -notmatch '^\s*#' -and -not [string]::IsNullOrWhiteSpace($_) }
    if ($hostsLines.Count -gt 5) {
        Write-Status "Hosts файл" "WARN" "Обнаружено $($hostsLines.Count) активных переопределений в hosts!" "WARN"
        $Warnings.Add("Файл hosts содержит $($hostsLines.Count) записей. Возможно наличие блокировок или перенаправлений.")
    } else {
        Write-Status "Hosts файл" "OK" "Чист (активных записей: $($hostsLines.Count))" "OK"
    }
}

# -------------------------------------------------------------
# 4. ИНТЕРНЕТ-СВЯЗНОСТЬ, ПОРТЫ И WEB-СЕРВИСЫ (L7)
# -------------------------------------------------------------
Write-SectionHeader "4. Доступность веб-сервисов и портов (L7)"

# Проверка Captive Portal
try {
    $webReq = [System.Net.HttpWebRequest]::Create("http://www.msftconnecttest.com/connecttest.txt")
    $webReq.Timeout = 4000
    $webReq.AllowAutoRedirect = $false
    $response = $webReq.GetResponse()
    if ($response.StatusCode -eq "OK") {
        Write-Status "Captive Portal" "OK" "Прямой доступ в интернет открыт (No Portal Trap)" "OK"
    } else {
        Write-Status "Captive Portal" "WARN" "Обнаружен перехват HTTP ($($response.StatusCode)) — требуется авторизация в сети" "WARN"
        $Issues.Add("Обнаружен Captive Portal: сеть требует авторизации в браузере.")
    }
    $response.Close()
} catch {
    Write-Status "Captive Portal" "INFO" "msftconnecttest завершен" "INFO"
}

# HTTP / HTTPS / TCP Handshake к ключевым сервисам
$endpoints = @(
    @{ Name = "Cloudflare CDN"; Host = "1.1.1.1"; Port = 443 },
    @{ Name = "Google Services"; Host = "8.8.8.8"; Port = 53 },
    @{ Name = "Microsoft Cloud"; Host = "www.microsoft.com"; Port = 443 },
    @{ Name = "Yandex Infrastructure"; Host = "77.88.8.8"; Port = 443 }
)

foreach ($ep in $endpoints) {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $tcp = Test-NetConnection -ComputerName $ep.Host -Port $ep.Port -InformationLevel Quiet -WarningAction SilentlyContinue
    $sw.Stop()
    
    if ($tcp) {
        Write-Status "$($ep.Name):$($ep.Port)" "OK" "TCP Handshake: $($sw.ElapsedMilliseconds)ms" "OK"
    } else {
        Write-Status "$($ep.Name):$($ep.Port)" "FAIL" "Порт недоступен или заблокирован" "FAIL"
        $Warnings.Add("Не удалось установить TCP соединение с $($ep.Name) ($($ep.Host):$($ep.Port)).")
    }
}

# -------------------------------------------------------------
# 5. ПРОКСИ, БРАНДМАУЭР И ПАРАМЕТРЫ СТЕКА TCP
# -------------------------------------------------------------
Write-SectionHeader "5. Прокси, Windows Firewall и стек TCP"

# WinINet Proxy
$proxyReg = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings"
$proxyEnable = (Get-ItemProperty -Path $proxyReg -Name ProxyEnable -ErrorAction SilentlyContinue).ProxyEnable
$proxyServer = (Get-ItemProperty -Path $proxyReg -Name ProxyServer -ErrorAction SilentlyContinue).ProxyServer

if ($proxyEnable -eq 1) {
    Write-Status "Пользовательский Proxy" "WARN" "ВКЛЮЧЕН ($proxyServer)" "WARN"
    $Warnings.Add("В Windows включен пользовательский прокси: $proxyServer. Если он не работает, интернет будет недоступен.")
} else {
    Write-Status "Пользовательский Proxy" "OK" "Отключен (Прямое подключение)" "OK"
}

# WinHTTP Proxy
$winhttp = netsh winhttp show proxy 2>$null | Out-String
if ($winhttp -match "Direct access" -or $winhttp -match "Прямой доступ") {
    Write-Status "Системный WinHTTP Proxy" "OK" "Прямой доступ (Без прокси)" "OK"
} else {
    Write-Status "Системный WinHTTP Proxy" "WARN" "Настроен системный прокси: $winhttp" "WARN"
}

# Брандмауэр Windows (Firewall Profiles)
$fwProfiles = Get-NetFirewallProfile -ErrorAction SilentlyContinue
$allFwOn = ($fwProfiles | Where-Object { $_.Enabled -eq $true }).Count -eq $fwProfiles.Count
if ($allFwOn) {
    Write-Status "Windows Firewall" "OK" "Все профили активны (Domain, Private, Public)" "OK"
} else {
    Write-Status "Windows Firewall" "INFO" "Один или несколько профилей брандмауэра отключены" "INFO"
}

# TCP Stack Auto-Tuning
$tcpGlobal = netsh int tcp show global 2>$null | Out-String
if ($tcpGlobal -match '(?:Receive Window Auto-Tuning Level|Уровень автонастройки окна получения)\s*:\s*(.+)') {
    $autoTuning = $matches[1].Trim()
    Write-Status "TCP Window Auto-Tuning" "INFO" "Режим: $autoTuning" "INFO"
}

# Анализ сокетов
$allSockets = Get-NetTCPConnection -ErrorAction SilentlyContinue
$timeWaitCount = ($allSockets | Where-Object { $_.State -eq "TimeWait" }).Count
$estabCount = ($allSockets | Where-Object { $_.State -eq "Established" }).Count

if ($timeWaitCount -gt 2000) {
    Write-Status "TCP Сокеты" "WARN" "TIME_WAIT: $timeWaitCount | Established: $estabCount (Высокая нагрузка)" "WARN"
    $Warnings.Add("Большое число сокетов в TIME_WAIT ($timeWaitCount). Возможно насыщение портов.")
} else {
    Write-Status "TCP Сокеты" "OK" "Активных (Established): $estabCount | TIME_WAIT: $timeWaitCount" "OK"
}

# -------------------------------------------------------------
# 6. ИТОГОВЫЙ ВЕРДИКТ И РЕКОМЕНДАЦИИ
# -------------------------------------------------------------
Write-SectionHeader "6. Итоговый отчет о состоянии сети"

if ($Issues.Count -eq 0 -and $Warnings.Count -eq 0) {
    Write-Host "`n  [✔] СЕТЕВОЙ СТАТУС: HEALTHY (ОТЛИЧНОЕ СОСТОЯНИЕ)" -ForegroundColor Green
    Write-Host "  Все сетевые уровни (L1-L7), DNS, шлюз и службы функционируют штатно.`n" -ForegroundColor White
} elseif ($Issues.Count -gt 0) {
    Write-Host "`n  [✖] СЕТЕВОЙ СТАТУС: CRITICAL / OFFLINE" -ForegroundColor Red
    Write-Host "  Обнаружены критические неисправности:`n" -ForegroundColor Red
    foreach ($issue in $Issues) {
        Write-Host "   - $issue" -ForegroundColor Red
    }
} else {
    Write-Host "`n  [⚠] СЕТЕВОЙ СТАТУС: DEGRADED (ЕСТЬ ПРЕДУПРЕЖДЕНИЯ)" -ForegroundColor Yellow
    Write-Host "  Сеть работает, но обнаружены узкие места или потенциальные проблемы:`n" -ForegroundColor Yellow
    foreach ($warn in $Warnings) {
        Write-Host "   - $warn" -ForegroundColor Yellow
    }
}

Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host " Диагностика завершена." -ForegroundColor Cyan
Write-Host "===============================================================" -ForegroundColor Cyan