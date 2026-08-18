# Release Notes — WiScripts Windows v1.1.0

We are pleased to announce the release of **WiScripts Windows v1.1.0**! 🚀

This release introduces comprehensive full-stack network diagnostics, real-time internet latency and jitter benchmarking, a massively expanded verified scripts catalog (27 entries), and critical execution fixes for the Script Runner engine.

---

## 🌟 What's New in v1.1.0

### 1. 🌐 Enterprise Network Diagnostics & Jitter Benchmark Suite
- **Full-Stack L1-L7 Network Health Audit (`diag-deep-network-audit`)**:
  - Wi-Fi 6E/CIM radio telemetry (SSID, signal strength %, frequency band, channel, 802.11ax/ac protocol).
  - Multi-hop IPv4/IPv6 routing audit with primary gateway latency and MTU 1500 (Don't Fragment) discovery.
  - Multi-provider DNS resolution benchmark (System DNS vs Cloudflare `1.1.1.1` vs Google `8.8.8.8` vs Yandex `77.88.8.8`).
  - Active hosts file integrity validation, HTTP Captive Portal trap detection, TCP port probing (443, 53), and WinINet/WinHTTP proxy inspection.
  - Automated diagnostic verdict engine (`HEALTHY`, `DEGRADED`, `CRITICAL`).
- **Multi-Hop Stability & Packet Loss Benchmark (`diag-network-stability-jitter`)**:
  - Real-time ICMP telemetry capturing Min, Avg, Max latency, standard deviation jitter, and packet loss % across Gateway, National DNS, and Global CDN endpoints.

### 2. 📚 Expanded Verified Online Scripts Library Catalog (27 Verified Scripts)
- Catalog expanded from 15 to **27 verified production-ready automation scripts** across all 5 categories:
  - **Network**: Complete stack reset, system hosts restoration, QUIC/HTTP3 disable workaround, Yandex routing repair, LAN sharing configuration.
  - **Maintenance**: Deep system recovery & CBS component repair.
  - **Performance**: High-performance AC profile, Battery Saver profile, dynamic AC/Battery scheduled auto-switcher, Windows OS latency & privacy tweaks.
  - **Diagnostics**: Deep network audit, stability jitter benchmark, process-mapped socket telemetry, battery capacity report.
- **Strict Integrity Verification**: Every script in `manifest.json` v1.1.2 is cryptographically verified via individual `SHA-256` hashes and signed metadata.

### 3. 🛠️ Script Runner Engine & AST Execution Fixes
- **Eliminated PowerShell Parameter AST Parser Glitch**:
  - Resolved `UnexpectedAttribute: [CmdletBinding()]` and `UnexpectedToken: param` runtime error by replacing header injection with clean UTF-8 BOM binary stream writing.
- **Language-Agnostic Windows Compatibility**:
  - Replaced localized regex parsers in power configuration scripts with direct `SCHEME_CURRENT` targeting, guaranteeing flawless operation on multilingual Windows environments.
- **Dynamic Path Resolution**:
  - Migrated hardcoded paths across automation scripts to dynamic `$PSScriptRoot` resolution.
- **Pre-Flight Privilege Guards**:
  - Hardened all scripts with graceful elevation checks, preventing unhandled exceptions and red error dumps when executing without administrative privileges.

---

## 📦 Release Artifacts & Compatibility
- **Supported Operating Systems**: Windows 10 (1809+) & Windows 11 (all versions including 23H2 / 24H2).
- **Architecture**: x86_64 (64-bit native).
- **Distributions**:
  - `WiScripts_1.1.0_x64-setup.exe` (NSIS Installer with auto-updater support)
  - `WiScripts_1.1.0_x64_Portable.zip` (Standalone portable zero-install package)

---

## 🛠️ Commit Log Highlights
- `feat(scripts-lib): expand online scripts catalog to 27 verified entries`
- `fix(script-runner): eliminate unexpected cmdletbinding parser error during script execution`
- `fix(scripts-lib): harden elevation guards, fix localized regexes, and resolve path dependencies`
- `chore(release): bump version to 1.1.0 and publish release notes`
