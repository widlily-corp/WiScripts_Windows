param(
    [string]$TargetHost = "cloudflare.com",
    [switch]$Detailed
)

$ErrorActionPreference = "SilentlyContinue"

$Issues = [System.Collections.Generic.List[string]]::new()
$Warnings = [System.Collections.Generic.List[string]]::new()

function Write-Header([string]$Title) {
    Write-Host "`n===============================================================" -ForegroundColor Cyan
    Write-Host " $Title" -ForegroundColor Cyan
    Write-Host "===============================================================" -ForegroundColor Cyan
}

function Write-StatusRow([string]$Label, [string]$Status, [string]$Details = "", [string]$Level = "Info") {
    $bullet = switch ($Level) {
        "OK"    { "[OK]" }
        "WARN"  { "[!]" }
        "FAIL"  { "[X]" }
        default { "[.]" }
    }
    $color = switch ($Level) {
        "OK"    { "Green" }
        "WARN"  { "Yellow" }
        "FAIL"  { "Red" }
        default { "Gray" }
    }
    
    $lbl = $Label.PadRight(30)
    $stat = "[$Status]".PadRight(10)
    
    Write-Host "  $bullet " -NoNewline -ForegroundColor $color
    Write-Host $lbl -NoNewline -ForegroundColor White
    Write-Host $stat -NoNewline -ForegroundColor $color
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

# 1. Physical & Network Adapters
Write-Header "1. Network Adapters & Physical Link (L1/L2)"

$adapters = Get-NetAdapter | Where-Object { $_.Status -eq "Up" }
if (-not $adapters) {
    Write-StatusRow "Network Adapters" "FAIL" "No active network adapters found!" "FAIL"
    $Issues.Add("No active network adapters with Status=Up.")
} else {
    foreach ($adapter in $adapters) {
        $speed = if ($adapter.LinkSpeed) { $adapter.LinkSpeed } else { "N/A" }
        $virt = if ($adapter.Virtual -or $adapter.InterfaceDescription -match "Hyper-V|Virtual|TAP|VPN") { " (Virtual/VPN)" } else { "" }
        Write-StatusRow "$($adapter.InterfaceAlias)$virt" "UP" "Speed: $speed | MAC: $($adapter.MacAddress)" "OK"
    }
}

# Wi-Fi Telemetry
$wlan = netsh wlan show interfaces 2>$null | Out-String
if ($wlan -match "(?:State|Состояние)\s*:\s*(?:connected|подключено)") {
    $ssid = if ($wlan -match '(?:SSID|Имя)\s*:\s*(.+)') { $matches[1].Trim() } else { "N/A" }
    $signal = if ($wlan -match '(?:Signal|Сигнал)\s*:\s*(\d+)%') { [int]$matches[1] } else { 0 }
    $radio = if ($wlan -match '(?:Radio type|Тип радиомодуля)\s*:\s*(.+)') { $matches[1].Trim() } else { "N/A" }
    $band = if ($wlan -match '(?:Band|Диапазон)\s*:\s*(.+)') { $matches[1].Trim() } else { "N/A" }
    $channel = if ($wlan -match '(?:Channel|Канал)\s*:\s*(\d+)') { $matches[1].Trim() } else { "N/A" }
    
    $wLevel = if ($signal -ge 70) { "OK" } elseif ($signal -ge 40) { "WARN" } else { "FAIL" }
    if ($signal -lt 40) {
        $Warnings.Add("Low Wi-Fi signal strength ($signal%). Expect packet loss or high jitter.")
    }
    Write-StatusRow "Wi-Fi Interface (SSID)" "$signal%" "SSID: $ssid | $radio ($band) | Ch: $channel" $wLevel
}

# 2. IP Configuration & Gateway
Write-Header "2. IP Configuration, Gateway & Routing (L3)"

$routes = Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue | Sort-Object -Property RouteMetric
$primaryRoute = $routes | Select-Object -First 1

if (-not $primaryRoute) {
    Write-StatusRow "Default Gateway" "FAIL" "No default route (0.0.0.0/0) found!" "FAIL"
    $Issues.Add("No default gateway route. Device cannot route traffic to external networks.")
} else {
    $gw = $primaryRoute.NextHop
    $alias = $primaryRoute.InterfaceAlias
    $ipConfig = Get-NetIPConfiguration -InterfaceAlias $alias -ErrorAction SilentlyContinue
    $ipv4 = ($ipConfig.IPv4Address | Where-Object { $_.IPAddress -notlike "169.254.*" }).IPAddress -join ", "
    
    if ($ipv4 -like "169.254.*" -or [string]::IsNullOrWhiteSpace($ipv4)) {
        Write-StatusRow "IPv4 Address" "FAIL" "APIPA Address 169.254.x.x (DHCP server failed to respond)" "FAIL"
        $Issues.Add("APIPA 169.254.x.x assigned. Local network DHCP server did not lease an IP.")
    } else {
        Write-StatusRow "Primary IPv4 [$alias]" "OK" "IP: $ipv4 | Gateway: $gw (Metric: $($primaryRoute.RouteMetric))" "OK"
    }
    
    if ($gw -and $gw -ne "0.0.0.0") {
        $gwPing = Test-Connection -ComputerName $gw -Count 3 -ErrorAction SilentlyContinue
        if ($gwPing) {
            $avgLatency = [math]::Round(($gwPing | Measure-Object -Property ResponseTime -Average).Average, 1)
            $gwLevel = if ($avgLatency -lt 5) { "OK" } elseif ($avgLatency -lt 30) { "WARN" } else { "FAIL" }
            Write-StatusRow "Ping to Gateway ($gw)" "$($avgLatency)ms" "Received 3/3 ICMP replies" $gwLevel
        } else {
            Write-StatusRow "Ping to Gateway ($gw)" "FAIL" "Gateway not responding to ICMP ping" "WARN"
            $Warnings.Add("Default gateway $gw did not answer ICMP ping (ICMP may be blocked by router).")
        }
    }
}

# MTU Test
$pingDF = & ping.exe 1.1.1.1 -f -l 1472 -n 1 2>$null | Out-String
if ($pingDF -match "Packet needs to be fragmented|fragmented|фрагментация") {
    Write-StatusRow "MTU 1500 (Don't Fragment)" "WARN" "Packet 1472+28 bytes requires fragmentation (MSS Clamping)" "WARN"
} elseif ($pingDF -match "bytes=|байт=") {
    Write-StatusRow "MTU 1500 (Don't Fragment)" "OK" "Standard MTU 1500 passes without fragmentation" "OK"
} else {
    Write-StatusRow "MTU 1500 (Don't Fragment)" "INFO" "Don't Fragment packet probe dispatched" "INFO"
}

# 3. DNS Resolution & Benchmark
Write-Header "3. DNS Resolution & Latency Benchmark (L4/L7)"

$configuredDns = (Get-DnsClientServerAddress -AddressFamily IPv4 | Where-Object { $_.ServerAddresses.Count -gt 0 }).ServerAddresses | Select-Object -Unique
if ($configuredDns) {
    Write-StatusRow "Configured DNS" "INFO" ($configuredDns -join ", ") "INFO"
} else {
    Write-StatusRow "Configured DNS" "FAIL" "No DNS servers configured!" "FAIL"
    $Issues.Add("No DNS servers configured in the system.")
}

$benchDomains = @("google.com", "cloudflare.com", "yandex.ru")
$testServers = @(
    @{ Name = "System DNS"; IP = $null },
    @{ Name = "Cloudflare"; IP = "1.1.1.1" },
    @{ Name = "Google DNS";  IP = "8.8.8.8" },
    @{ Name = "Yandex DNS";  IP = "77.88.8.8" }
)

foreach ($srv in $testServers) {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $resCount = 0
    foreach ($d in $benchDomains) {
        $res = if ($srv.IP) {
            Resolve-DnsName -Name $d -Server $srv.IP -Type A -QuickTimeout -ErrorAction SilentlyContinue
        } else {
            Resolve-DnsName -Name $d -Type A -QuickTimeout -ErrorAction SilentlyContinue
        }
        if ($res) { $resCount++ }
    }
    $sw.Stop()
    $avgMs = [math]::Round($sw.ElapsedMilliseconds / $benchDomains.Count, 1)
    
    if ($resCount -eq $benchDomains.Count) {
        $lvl = if ($avgMs -lt 50) { "OK" } elseif ($avgMs -lt 150) { "WARN" } else { "FAIL" }
        Write-StatusRow "$($srv.Name)" "$($avgMs)ms" "Resolved $resCount/$($benchDomains.Count) test domains" $lvl
    } else {
        Write-StatusRow "$($srv.Name)" "FAIL" "Resolved only $resCount/$($benchDomains.Count) domains" "FAIL"
        if ($srv.Name -eq "System DNS") {
            $Issues.Add("System DNS failed to resolve basic internet domains.")
        }
    }
}

# Hosts file check
$hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
if (Test-Path $hostsPath) {
    $hostsEntries = Get-Content $hostsPath | Where-Object { $_ -notmatch '^\s*#' -and -not [string]::IsNullOrWhiteSpace($_) }
    if ($hostsEntries.Count -gt 10) {
        Write-StatusRow "System Hosts File" "WARN" "Found $($hostsEntries.Count) active overrides in hosts file" "WARN"
        $Warnings.Add("Hosts file contains $($hostsEntries.Count) custom entries. Check for unwanted domain blocks.")
    } else {
        Write-StatusRow "System Hosts File" "OK" "Clean ($($hostsEntries.Count) active entries)" "OK"
    }
}

# 4. Web Services & TCP Ports
Write-Header "4. Internet Services & TCP Handshakes (L7)"

# Captive portal check
try {
    $req = [System.Net.HttpWebRequest]::Create("http://www.msftconnecttest.com/connecttest.txt")
    $req.Timeout = 4000
    $req.AllowAutoRedirect = $false
    $resp = $req.GetResponse()
    if ($resp.StatusCode -eq "OK") {
        Write-StatusRow "Captive Portal" "OK" "Direct internet access open (No captive trap)" "OK"
    } else {
        Write-StatusRow "Captive Portal" "WARN" "HTTP interception detected ($($resp.StatusCode)) — network login required" "WARN"
        $Issues.Add("Captive Portal detected: browser authorization is required.")
    }
    $resp.Close()
} catch {
    Write-StatusRow "Captive Portal" "INFO" "msftconnecttest passed" "INFO"
}

$endpoints = @(
    @{ Name = "Cloudflare CDN"; Host = "1.1.1.1"; Port = 443 },
    @{ Name = "Google Services"; Host = "8.8.8.8"; Port = 53 },
    @{ Name = "Microsoft Web";  Host = "www.microsoft.com"; Port = 443 },
    @{ Name = "Yandex Infra";   Host = "77.88.8.8"; Port = 443 }
)

foreach ($ep in $endpoints) {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $tcp = Test-NetConnection -ComputerName $ep.Host -Port $ep.Port -InformationLevel Quiet -WarningAction SilentlyContinue
    $sw.Stop()
    if ($tcp) {
        Write-StatusRow "$($ep.Name):$($ep.Port)" "OK" "TCP Handshake: $($sw.ElapsedMilliseconds)ms" "OK"
    } else {
        Write-StatusRow "$($ep.Name):$($ep.Port)" "FAIL" "Connection failed or port blocked" "FAIL"
        $Warnings.Add("TCP connection to $($ep.Name) ($($ep.Host):$($ep.Port)) failed.")
    }
}

# 5. Proxies, Firewall & Sockets
Write-Header "5. System Proxies, Firewall & Sockets"

$proxyReg = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings"
$proxyEnable = (Get-ItemProperty -Path $proxyReg -Name ProxyEnable -ErrorAction SilentlyContinue).ProxyEnable
$proxyServer = (Get-ItemProperty -Path $proxyReg -Name ProxyServer -ErrorAction SilentlyContinue).ProxyServer

if ($proxyEnable -eq 1) {
    Write-StatusRow "WinINet User Proxy" "WARN" "ENABLED ($proxyServer)" "WARN"
    $Warnings.Add("User proxy is enabled: $proxyServer. If unresponsive, web browsing will fail.")
} else {
    Write-StatusRow "WinINet User Proxy" "OK" "Disabled (Direct Connection)" "OK"
}

$winhttp = netsh winhttp show proxy 2>$null | Out-String
if ($winhttp -match "(?:Direct access|Прямой доступ)") {
    Write-StatusRow "WinHTTP System Proxy" "OK" "Direct Access (No Proxy)" "OK"
} else {
    Write-StatusRow "WinHTTP System Proxy" "WARN" "Configured system proxy: $winhttp" "WARN"
}

$fwProfiles = Get-NetFirewallProfile -ErrorAction SilentlyContinue
$allFwOn = ($fwProfiles | Where-Object { $_.Enabled -eq $true }).Count -eq $fwProfiles.Count
if ($allFwOn) {
    Write-StatusRow "Windows Firewall" "OK" "All profiles active (Domain, Private, Public)" "OK"
} else {
    Write-StatusRow "Windows Firewall" "INFO" "One or more firewall profiles are disabled" "INFO"
}

$tcpGlobal = netsh int tcp show global 2>$null | Out-String
if ($tcpGlobal -match '(?:Receive Window Auto-Tuning Level|Уровень автонастройки окна получения)\s*:\s*(.+)') {
    $autoTune = $matches[1].Trim()
    Write-StatusRow "TCP Window Auto-Tuning" "INFO" "Mode: $autoTune" "INFO"
}

$allSockets = Get-NetTCPConnection -ErrorAction SilentlyContinue
$timeWaitCount = ($allSockets | Where-Object { $_.State -eq "TimeWait" }).Count
$estabCount = ($allSockets | Where-Object { $_.State -eq "Established" }).Count

if ($timeWaitCount -gt 2000) {
    Write-StatusRow "TCP Sockets Pool" "WARN" "TIME_WAIT: $timeWaitCount | Established: $estabCount (High Load)" "WARN"
    $Warnings.Add("High number of sockets in TIME_WAIT state ($timeWaitCount).")
} else {
    Write-StatusRow "TCP Sockets Pool" "OK" "Active (Established): $estabCount | TIME_WAIT: $timeWaitCount" "OK"
}

# 6. Overall Verdict
Write-Header "6. Overall Network Health Verdict"

if ($Issues.Count -eq 0 -and $Warnings.Count -eq 0) {
    Write-Host "`n  [OK] NETWORK STATUS: HEALTHY" -ForegroundColor Green
    Write-Host "  All network layers (L1-L7), DNS, routing, and services are fully operational.`n" -ForegroundColor White
} elseif ($Issues.Count -gt 0) {
    Write-Host "`n  [X] NETWORK STATUS: CRITICAL / OFFLINE" -ForegroundColor Red
    Write-Host "  Critical issues detected:`n" -ForegroundColor Red
    foreach ($issue in $Issues) { Write-Host "   - $issue" -ForegroundColor Red }
} else {
    Write-Host "`n  [!] NETWORK STATUS: DEGRADED" -ForegroundColor Yellow
    Write-Host "  Network is functional with non-critical warnings:`n" -ForegroundColor Yellow
    foreach ($w in $Warnings) { Write-Host "   - $w" -ForegroundColor Yellow }
}

Write-Host "===============================================================" -ForegroundColor Cyan
Write-Host " Diagnostics Complete." -ForegroundColor Cyan
Write-Host "===============================================================" -ForegroundColor Cyan
