/**
 * WiScripts Windows v1.3.0 — Comprehensive E2E Test Harness
 * Authoritative test utilities, assertion engine, crypto validation,
 * SCM / Registry / Storage / Profile / Kernel / Memory / Network / Hardware simulators,
 * and Mock IPC infrastructure for R1 through R5.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// --- 1. Robust Assertion Engine (AAA Pattern) ---
export const assert = {
  equal(actual, expected, message = '') {
    if (actual !== expected) {
      throw new Error(`AssertionFailed: ${message} (Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
    }
  },

  deepEqual(actual, expected, message = '') {
    const actStr = JSON.stringify(actual);
    const expStr = JSON.stringify(expected);
    if (actStr !== expStr) {
      throw new Error(`AssertionFailed: ${message}\nExpected: ${expStr}\nGot: ${actStr}`);
    }
  },

  ok(value, message = '') {
    if (!value) {
      throw new Error(`AssertionFailed: ${message} (Value is falsy: ${value})`);
    }
  },

  isTrue(value, message = '') {
    if (value !== true) {
      throw new Error(`AssertionFailed: ${message} (Expected true, got ${value})`);
    }
  },

  isFalse(value, message = '') {
    if (value !== false) {
      throw new Error(`AssertionFailed: ${message} (Expected false, got ${value})`);
    }
  },

  includes(container, item, message = '') {
    if (typeof container === 'string') {
      if (!container.includes(item)) {
        throw new Error(`AssertionFailed: ${message} (String '${container}' does not include '${item}')`);
      }
    } else if (Array.isArray(container)) {
      if (!container.includes(item)) {
        throw new Error(`AssertionFailed: ${message} (Array does not include element ${JSON.stringify(item)})`);
      }
    } else {
      throw new Error(`AssertionFailed: ${message} (Invalid container for includes check)`);
    }
  },

  match(str, regex, message = '') {
    if (!regex.test(str)) {
      throw new Error(`AssertionFailed: ${message} (String '${str}' does not match regex ${regex})`);
    }
  },

  greaterThanOrEqual(actual, expected, message = '') {
    if (actual < expected) {
      throw new Error(`AssertionFailed: ${message} (Expected ${actual} >= ${expected})`);
    }
  },

  lessThanOrEqual(actual, expected, message = '') {
    if (actual > expected) {
      throw new Error(`AssertionFailed: ${message} (Expected ${actual} <= ${expected})`);
    }
  },

  throws(fn, expectedErrPattern = null, message = '') {
    let threw = false;
    let errObj = null;
    try {
      fn();
    } catch (e) {
      threw = true;
      errObj = e;
    }
    if (!threw) {
      throw new Error(`AssertionFailed: ${message} (Function expected to throw error, but succeeded)`);
    }
    if (expectedErrPattern) {
      const errMsg = errObj ? errObj.message || String(errObj) : '';
      if (typeof expectedErrPattern === 'string' && !errMsg.includes(expectedErrPattern)) {
        throw new Error(`AssertionFailed: ${message} (Error message '${errMsg}' does not include '${expectedErrPattern}')`);
      } else if (expectedErrPattern instanceof RegExp && !expectedErrPattern.test(errMsg)) {
        throw new Error(`AssertionFailed: ${message} (Error message '${errMsg}' does not match regex ${expectedErrPattern})`);
      }
    }
  },

  async throwsAsync(fn, expectedErrPattern = null, message = '') {
    let threw = false;
    let errObj = null;
    try {
      await fn();
    } catch (e) {
      threw = true;
      errObj = e;
    }
    if (!threw) {
      throw new Error(`AssertionFailed: ${message} (Async function expected to throw error, but succeeded)`);
    }
    if (expectedErrPattern) {
      const errMsg = errObj ? errObj.message || String(errObj) : '';
      if (typeof expectedErrPattern === 'string' && !errMsg.includes(expectedErrPattern)) {
        throw new Error(`AssertionFailed: ${message} (Error message '${errMsg}' does not include '${expectedErrPattern}')`);
      } else if (expectedErrPattern instanceof RegExp && !expectedErrPattern.test(errMsg)) {
        throw new Error(`AssertionFailed: ${message} (Error message '${errMsg}' does not match regex ${expectedErrPattern})`);
      }
    }
  }
};

// --- 2. Cryptographic Utilities ---
export function computeSha256(content) {
  const hash = crypto.createHash('sha256');
  if (typeof content === 'string') {
    hash.update(content, 'utf8');
  } else if (Buffer.isBuffer(content)) {
    hash.update(content);
  } else {
    hash.update(JSON.stringify(content), 'utf8');
  }
  return hash.digest('hex');
}

export function compute4KbPartialHash(buffer) {
  const sliceLen = Math.min(buffer.length, 4096);
  const slice = buffer.subarray(0, sliceLen);
  return computeSha256(slice);
}

// --- 3. 2-Stage Storage Hashing Engine ---
export class StorageDeduplicationEngine {
  constructor(userProfileRoot = 'C:\\Users\\TestUser') {
    this.userProfileRoot = path.normalize(userProfileRoot).toLowerCase();
  }

  validatePath(targetPath) {
    const norm = path.normalize(targetPath).toLowerCase();
    if (norm === this.userProfileRoot || norm.startsWith(this.userProfileRoot + path.sep)) {
      return path.normalize(targetPath);
    }
    throw new Error(`Security Violation: Target path '${targetPath}' is outside USERPROFILE ('${this.userProfileRoot}')`);
  }

  scanDuplicates(virtualFiles) {
    // Phase 1: Group by file size (> 0)
    const sizeMap = new Map();
    for (const file of virtualFiles) {
      this.validatePath(file.path);
      const sz = file.contentBuffer ? file.contentBuffer.length : file.sizeBytes;
      if (sz > 0) {
        if (!sizeMap.has(sz)) sizeMap.set(sz, []);
        sizeMap.get(sz).push(file);
      }
    }

    // Phase 1b: 4KB partial hash for size collisions
    const partialMap = new Map();
    for (const [sz, files] of sizeMap.entries()) {
      if (files.length > 1) {
        for (const file of files) {
          const partialHash = compute4KbPartialHash(file.contentBuffer || Buffer.alloc(Math.min(sz, 4096), file.path));
          const key = `${sz}_${partialHash}`;
          if (!partialMap.has(key)) partialMap.set(key, []);
          partialMap.get(key).push(file);
        }
      }
    }

    // Phase 2: Full SHA-256 for partial collisions
    const duplicateGroups = [];
    for (const [key, files] of partialMap.entries()) {
      if (files.length > 1) {
        const fullHashMap = new Map();
        for (const file of files) {
          const fullHash = computeSha256(file.contentBuffer || Buffer.alloc(file.sizeBytes, file.path));
          if (!fullHashMap.has(fullHash)) fullHashMap.set(fullHash, []);
          fullHashMap.get(fullHash).push(file);
        }

        for (const [fullHash, matchingFiles] of fullHashMap.entries()) {
          if (matchingFiles.length > 1) {
            duplicateGroups.push({
              hash: fullHash,
              sizeBytes: matchingFiles[0].contentBuffer ? matchingFiles[0].contentBuffer.length : matchingFiles[0].sizeBytes,
              files: matchingFiles.map(f => ({
                path: f.path,
                sizeBytes: f.contentBuffer ? f.contentBuffer.length : f.sizeBytes,
                modifiedTimestamp: f.modifiedTimestamp || Date.now()
              }))
            });
          }
        }
      }
    }

    return duplicateGroups;
  }
}

// --- 4. Uninstaller Date Parsing & Sorting Engine ---
export function parseInstallDate(dateStr) {
  if (dateStr === null || dateStr === undefined) return 0;
  if (typeof dateStr === 'number') {
    return isNaN(dateStr) || dateStr < 0 ? 0 : dateStr;
  }
  const s = String(dateStr).trim();
  if (!s) return 0;

  // 1. Compact YYYYMMDD (e.g., 20240229)
  const compactMatch = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (compactMatch) {
    const year = parseInt(compactMatch[1], 10);
    const month = parseInt(compactMatch[2], 10);
    const day = parseInt(compactMatch[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(year, month - 1, day);
      const ts = d.getTime();
      return isNaN(ts) ? 0 : ts;
    }
  }

  // 2. YYYY-MM-DD or YYYY/MM/DD or YYYY.MM.DD
  const isoMatch = /^(\d{4})[-/. ](\d{1,2})[-/. ](\d{1,2})$/.exec(s);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(year, month - 1, day);
      const ts = d.getTime();
      return isNaN(ts) ? 0 : ts;
    }
  }

  // 3. DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY (European)
  const euroMatch = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s);
  if (euroMatch) {
    const day = parseInt(euroMatch[1], 10);
    const month = parseInt(euroMatch[2], 10);
    const year = parseInt(euroMatch[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(year, month - 1, day);
      const ts = d.getTime();
      return isNaN(ts) ? 0 : ts;
    }
  }

  // 4. Standard Date.parse fallback
  const parsed = Date.parse(s);
  return isNaN(parsed) ? 0 : parsed;
}

export function formatAppSize(sizeKb) {
  if (!sizeKb || sizeKb <= 0) return 'Unknown';
  if (sizeKb < 1024) {
    return `${sizeKb} KB`;
  } else if (sizeKb < 1024 * 1024) {
    return `${(sizeKb / 1024).toFixed(1)} MB`;
  }
  return `${(sizeKb / (1024 * 1024)).toFixed(2)} GB`;
}

// --- 5. Win32 SCM Service State Simulator ---
export class Win32ScmSimulator {
  constructor() {
    this.services = new Map([
      ['DiagTrack', { startType: 2, status: 'RUNNING' }],
      ['dmwappushservice', { startType: 2, status: 'RUNNING' }],
      ['SysMain', { startType: 2, status: 'RUNNING' }],
      ['WSearch', { startType: 2, status: 'RUNNING' }],
      ['Fax', { startType: 3, status: 'STOPPED' }],
      ['WerSvc', { startType: 3, status: 'STOPPED' }],
      ['XblAuthManager', { startType: 3, status: 'STOPPED' }],
      ['XblGameSave', { startType: 3, status: 'STOPPED' }],
      ['RemoteRegistry', { startType: 4, status: 'STOPPED' }],
      ['SCardSvr', { startType: 3, status: 'STOPPED' }],
      ['Spooler', { startType: 2, status: 'RUNNING' }]
    ]);
  }

  queryServiceStartType(name) {
    if (!this.services.has(name)) {
      throw new Error(`OpenServiceW failed: ERROR_SERVICE_DOES_NOT_EXIST (1060) for '${name}'`);
    }
    return this.services.get(name).startType;
  }

  isServiceDisabled(name) {
    return this.queryServiceStartType(name) === 4;
  }

  configureService(name, targetStartType) {
    if (!this.services.has(name)) {
      throw new Error(`OpenServiceW failed: ERROR_SERVICE_DOES_NOT_EXIST (1060) for '${name}'`);
    }
    const svc = this.services.get(name);
    svc.startType = targetStartType;
    if (targetStartType === 4) {
      svc.status = 'STOPPED';
    }
    return true;
  }

  stopService(name) {
    if (!this.services.has(name)) {
      throw new Error(`OpenServiceW failed: ERROR_SERVICE_DOES_NOT_EXIST (1060) for '${name}'`);
    }
    const svc = this.services.get(name);
    svc.status = 'STOPPED';
    return true;
  }

  startService(name) {
    if (!this.services.has(name)) {
      throw new Error(`OpenServiceW failed: ERROR_SERVICE_DOES_NOT_EXIST (1060) for '${name}'`);
    }
    const svc = this.services.get(name);
    svc.status = 'RUNNING';
    return true;
  }
}

// --- 6. `.wiscripts` Profile Schema & Validation Engine ---
export class ProfileValidationEngine {
  static validate(profile) {
    const errors = [];
    if (!profile || typeof profile !== 'object') {
      return { isValid: false, errors: ['Profile root must be a valid JSON object'] };
    }

    if (profile.format !== 'wiscripts-configuration-profile') {
      errors.push("Invalid format header: expected 'wiscripts-configuration-profile'");
    }
    if (!profile.schemaVersion || !/^\d+\.\d+\.\d+$/.test(profile.schemaVersion)) {
      errors.push('Invalid or missing schemaVersion');
    }
    if (!profile.metadata || !profile.metadata.id || !profile.metadata.name) {
      errors.push('Profile metadata missing required id or name');
    }
    if (!profile.optimizations || !Array.isArray(profile.optimizations.enabledRuleIds)) {
      errors.push('Profile missing optimizations.enabledRuleIds array');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  static computeChecksum(profile) {
    const copy = JSON.parse(JSON.stringify(profile));
    delete copy.integrity;
    return computeSha256(copy);
  }
}

// --- 7. Command Palette Indexer & Fuzzy Search Engine ---
export class CommandPaletteEngine {
  constructor() {
    this.index = [];
    this.buildIndex();
  }

  buildIndex() {
    // 25 Navigation Tabs (21 original + 4 major subsystems)
    const tabs = [
      { id: 'dashboard', title: 'Dashboard', category: 'Navigation', keywords: ['system', 'metrics', 'overview', 'telemetry'] },
      { id: 'gaming_latency', title: 'Gaming Low-Latency & DPC Analyzer', category: 'Navigation', keywords: ['dpc', 'isr', 'latency', 'timer', 'game boost', 'gaming', 'fps'] },
      { id: 'smart_ram', title: 'Smart RAM & Standby List Memory Purger', category: 'Navigation', keywords: ['ram', 'memory', 'standby list', 'purge', 'working set', 'auto-trim'] },
      { id: 'network_shield', title: 'Live Network Traffic & Process Firewall Shield', category: 'Navigation', keywords: ['network', 'firewall', 'sockets', 'connections', 'block', 'traffic', 'shield'] },
      { id: 'hardware_health', title: 'Hardware NVMe SMART & Battery/Power Analytics', category: 'Navigation', keywords: ['nvme', 'smart', 'storage', 'battery', 'power', 'wear', 'temperature'] },
      { id: 'script_runner', title: 'Script Runner & Library', category: 'Navigation', keywords: ['scripts', 'powershell', 'online library', 'code'] },
      { id: 'audio_manager', title: 'Audio Manager', category: 'Navigation', keywords: ['sound', 'volume', 'mixer', 'endpoints'] },
      { id: 'governor', title: 'Resource Governor & ProFlow', category: 'Navigation', keywords: ['cpu', 'affinity', 'priority', 'ram trim'] },
      { id: 'optimization', title: 'Optimization & Tweaks', category: 'Navigation', keywords: ['debloat', 'telemetry', 'privacy', 'tweaks'] },
      { id: 'package_manager', title: 'Package Manager', category: 'Navigation', keywords: ['winget', 'software', 'install', 'update'] },
      { id: 'app_uninstaller', title: 'App Uninstaller & Debloat', category: 'Navigation', keywords: ['uninstall', 'uwp', 'clean apps'] },
      { id: 'presets', title: '1-Click Presets & Profiles', category: 'Navigation', keywords: ['profiles', 'gaming', 'privacy', 'wiscripts'] },
      { id: 'system_cleaner', title: 'System & Disk Cleaner', category: 'Navigation', keywords: ['temp', 'junk', 'cache', 'clean'] },
      { id: 'storage_utilities', title: 'Storage Utilities & Disk Space Analyzer', category: 'Navigation', keywords: ['duplicates', 'large files', '2-stage hash', 'disk space analyzer', 'analyzer', 'disk space', 'tree explorer', 'storage'] },
      { id: 'startup', title: 'Startup Apps', category: 'Navigation', keywords: ['autostart', 'boot', 'run keys'] },
      { id: 'scheduler', title: 'Task Scheduler', category: 'Navigation', keywords: ['tasks', 'scheduled', 'telemetry tasks'] },
      { id: 'autoruns', title: 'Deep Autoruns & Security', category: 'Navigation', keywords: ['sysinternals', 'drivers', 'quarantine'] },
      { id: 'dns_context', title: 'DNS & Context Menu', category: 'Navigation', keywords: ['dns', 'cloudflare', 'classic menu'] },
      { id: 'driver_backup', title: 'Driver Backup & Export', category: 'Navigation', keywords: ['drivers', 'dism', 'backup'] },
      { id: 'diagnostics', title: 'System Diagnostics', category: 'Navigation', keywords: ['sfc', 'dism', 'battery', 'network'] },
      { id: 'odt', title: 'Office Deployment Tool', category: 'Navigation', keywords: ['office', 'xml', 'deployment'] },
      { id: 'activation', title: 'Activation Hub (MAS)', category: 'Navigation', keywords: ['mas', 'hwid', 'kms38'] },
      { id: 'restore_points', title: 'System Restore Points', category: 'Navigation', keywords: ['vss', 'restore point', 'shadow copy'] },
      { id: 'state_engine', title: 'StateEngine & Rollback', category: 'Navigation', keywords: ['delta', 'rollback', 'snapshot'] },
      { id: 'settings', title: 'App Settings', category: 'Navigation', keywords: ['theme', 'dry-run', 'language', 'updates'] }
    ];

    for (const t of tabs) {
      this.index.push({
        id: `tab_${t.id}`,
        type: 'tab',
        title: t.title,
        category: t.category,
        keywords: t.keywords,
        action: { type: 'navigate', tab: t.id }
      });
    }

    // Windows 11 24H2 & Flagship Tweaks
    const tweaks = [
      { id: 'win11_disable_copilot', title: 'Disable Windows Copilot & Recall AI', category: 'Windows 11 24H2', keywords: ['copilot', 'ai', 'recall', 'sidebar'] },
      { id: 'win11_disable_recall_ai', title: 'Disable Windows Recall AI Snapshot', category: 'Windows 11 24H2', keywords: ['recall', 'snapshots', 'ai analysis'] },
      { id: 'win11_disable_start_recommendations', title: 'Disable Start Menu Recommendations & Ads', category: 'Windows 11 24H2', keywords: ['start', 'iris', 'ads', 'recommended'] },
      { id: 'telemetry_diagtrack', title: 'Disable DiagTrack Telemetry Service', category: 'Telemetry', keywords: ['diagtrack', 'telemetry', 'service'] },
      { id: 'services_sysmain', title: 'Disable SysMain (Superfetch) Service', category: 'Services', keywords: ['sysmain', 'superfetch', 'ssd'] },
      { id: 'ui_show_file_extensions', title: 'Show File Extensions in Explorer', category: 'UI Tweaks', keywords: ['extensions', 'explorer', 'files'] }
    ];

    for (const tw of tweaks) {
      this.index.push({
        id: `tweak_${tw.id}`,
        type: 'tweak',
        title: tw.title,
        category: tw.category,
        keywords: tw.keywords,
        action: { type: 'toggle_tweak', tweakId: tw.id }
      });
    }

    // Scripts Library Entries
    const scripts = [
      { id: 'maint-clear-wu-cache', title: 'Purge Windows Update Cache', category: 'Script Library', keywords: ['windows update', 'software distribution', 'wuauserv'] },
      { id: 'maint-clean-winsxs', title: 'Clean Component Store (WinSxS DISM)', category: 'Script Library', keywords: ['winsxs', 'dism', 'cleanup'] },
      { id: 'net-flush-dns-winsock', title: 'Flush DNS & Reset Winsock Catalog', category: 'Script Library', keywords: ['dns', 'winsock', 'flush'] },
      { id: 'sec-harden-smb-netbios', title: 'Disable SMBv1 & Legacy NetBIOS', category: 'Script Library', keywords: ['smb', 'netbios', 'security'] },
      { id: 'perf-ultimate-power-plan', title: 'Activate Ultimate Performance Power Scheme', category: 'Script Library', keywords: ['power', 'ultimate performance', 'powercfg'] }
    ];

    for (const sc of scripts) {
      this.index.push({
        id: `script_${sc.id}`,
        type: 'script',
        title: sc.title,
        category: sc.category,
        keywords: sc.keywords,
        action: { type: 'open_script', scriptId: sc.id }
      });
    }
  }

  search(query) {
    if (!query || !query.trim()) {
      return this.index.slice(0, 10);
    }
    const q = query.trim().toLowerCase();
    const scored = [];

    for (const item of this.index) {
      let score = 0;
      const titleLower = item.title.toLowerCase();
      if (titleLower === q) score += 100;
      else if (titleLower.startsWith(q)) score += 50;
      else if (titleLower.includes(q)) score += 25;

      for (const kw of item.keywords) {
        if (kw.toLowerCase() === q) score += 40;
        else if (kw.toLowerCase().includes(q)) score += 15;
      }

      if (score > 0) {
        scored.push({ item, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.map(s => s.item);
  }
}

// --- 8. Simulator Engines for R1–R5 Subsystems ---

/**
 * 8.1 KernelLatencySimulator (R1: Gaming Low-Latency & DPC Analyzer)
 * Simulates DPC/ISR latency estimation, timer resolution adjustments (NtSetTimerResolution),
 * and Game Boost process priority elevation with non-essential service suspension.
 */
export class KernelLatencySimulator {
  constructor() {
    this.defaultResolution100ns = 156250; // 15.625ms (default Windows resolution)
    this.minResolution100ns = 156250;     // 15.625ms (coarse platform max)
    this.maxResolution100ns = 5000;       // 0.5ms (fine precision NtSetTimerResolution)
    this.currentResolution100ns = 156250;
    this.isBoostActive = false;
    this.boostedPid = null;
    this.targetProcessName = null;
    this.suspendedServices = [];
    this.toggleHistory = [];
    this.driverTelemetry = [
      { driverName: 'ndis.sys', latencyUs: 38 },
      { driverName: 'nvlddmkm.sys', latencyUs: 74 },
      { driverName: 'tcpip.sys', latencyUs: 18 },
      { driverName: 'ntoskrnl.exe', latencyUs: 22 }
    ];
  }

  setResolution(resolution100ns, isElevated = true) {
    if (!isElevated) {
      throw new Error('AccessDenied: Adjusting timer resolution requires elevation (SeProfileSingleProcessPrivilege)');
    }
    // Clamp between high precision (5000) and standard (156250)
    const clamped = Math.max(this.maxResolution100ns, Math.min(this.minResolution100ns, resolution100ns));
    this.currentResolution100ns = clamped;
    return this.getTimerResolutionInfo();
  }

  getTimerResolutionInfo() {
    return {
      currentResolution100ns: this.currentResolution100ns,
      minResolution100ns: this.minResolution100ns,
      maxResolution100ns: this.maxResolution100ns,
      isHighPrecision: this.currentResolution100ns <= 10000 // <= 1.0ms
    };
  }

  getLatencyMetrics() {
    const maxDriverLatency = Math.max(...this.driverTelemetry.map(d => d.latencyUs), 0);
    const avgLatency = Math.round(this.driverTelemetry.reduce((acc, d) => acc + d.latencyUs, 0) / Math.max(1, this.driverTelemetry.length));
    return {
      currentLatencyUs: avgLatency,
      maxLatencyUs: maxDriverLatency,
      dpcCount: 482910,
      isrCount: 194302,
      driverLatencies: [...this.driverTelemetry],
      timerResolution100ns: this.currentResolution100ns,
      isKernelDriverLoaded: true,
      status: avgLatency < 500 ? 'OPTIMAL' : 'DEGRADED'
    };
  }

  toggleGameBoost(targetPid = null, enable = true, isElevated = true, scm = null) {
    if (!isElevated) {
      throw new Error('AccessDenied: Game Boost requires administrator privileges (SeProfileSingleProcessPrivilege)');
    }

    if (enable) {
      if (targetPid !== null && targetPid <= 0) {
        throw new Error(`InvalidProcessId: Target PID must be positive, got ${targetPid}`);
      }
      this.isBoostActive = true;
      this.boostedPid = targetPid || 4108;
      this.targetProcessName = targetPid === 999999 ? 'UnknownGame.exe' : (targetPid ? 'CyberGame2077.exe' : 'ActiveForegroundApp.exe');
      this.currentResolution100ns = 5000; // 0.5ms precision
      this.suspendedServices = ['DiagTrack', 'dmwappushservice', 'SysMain', 'Fax', 'WerSvc'];
      if (scm) {
        for (const s of this.suspendedServices) {
          try { scm.stopService(s); } catch (_) {}
        }
      }
    } else {
      this.isBoostActive = false;
      this.boostedPid = null;
      this.targetProcessName = null;
      this.currentResolution100ns = this.defaultResolution100ns;
      this.suspendedServices = [];
    }

    this.toggleHistory.push({ timestamp: Date.now(), enable, pid: this.boostedPid });
    return this.getGameBoostStatus();
  }

  getGameBoostStatus() {
    return {
      isActive: this.isBoostActive,
      boostedPid: this.boostedPid,
      targetProcessName: this.targetProcessName,
      suspendedServices: [...this.suspendedServices],
      timerResolutionAdjusted: this.currentResolution100ns === 5000,
      currentResolution100ns: this.currentResolution100ns
    };
  }
}

/**
 * 8.2 NativeMemoryPurgerSimulator (R2: Smart RAM & Standby List Purger)
 * Simulates NT standby list purge (NtSetSystemInformation), working set trimming (EmptyWorkingSet),
 * process exclusion whitelist, and background auto-trimmer threshold evaluator.
 */
export class NativeMemoryPurgerSimulator {
  constructor(totalMb = 16384) {
    this.totalMb = totalMb;
    this.inUseMb = 9216;
    this.standbyMb = 4096;
    this.modifiedMb = 512;
    this.freeMb = this.totalMb - (this.inUseMb + this.standbyMb + this.modifiedMb);
    this.purgeHistory = [];
    this.maxHistoryEntries = 1000;
    this.systemWhitelistedPids = new Set([4, 400, 500, 600, 1000]);
    this.systemWhitelistedNames = new Set(['csrss.exe', 'lsass.exe', 'smss.exe', 'services.exe', 'explorer.exe']);
    this.autoTrimmerConfig = {
      enabled: false,
      thresholdPercent: 80,
      checkIntervalSec: 60,
      minFreedMbThreshold: 512,
      excludedPids: [],
      excludedProcessNames: ['chrome.exe', 'code.exe']
    };
  }

  getMemoryBreakdown() {
    const usedMb = this.inUseMb + this.modifiedMb;
    const usagePercent = Math.round((usedMb / this.totalMb) * 100);
    return {
      totalMb: this.totalMb,
      inUseMb: this.inUseMb,
      standbyMb: this.standbyMb,
      modifiedMb: this.modifiedMb,
      freeMb: this.freeMb,
      usagePercent
    };
  }

  purgeStandby(mode = 'normal', isElevated = true) {
    if (!isElevated) {
      throw new Error('AccessDenied: Standby list purge requires SeProfileSingleProcessPrivilege');
    }
    const reclaimRatio = mode === 'aggressive' ? 1.0 : 0.92;
    const freedMb = Math.round(this.standbyMb * reclaimRatio);
    this.standbyMb -= freedMb;
    this.freeMb += freedMb;

    const record = {
      timestamp: new Date().toISOString(),
      type: 'standby_list',
      mode,
      freedMb,
      durationMs: 14
    };
    this.addHistory(record);

    return {
      success: true,
      freedMb,
      remainingStandbyMb: this.standbyMb,
      durationMs: 14
    };
  }

  purgeWorkingSets(excludedPids = [], isElevated = true) {
    if (!isElevated) {
      throw new Error('AccessDenied: Working set purge requires SeIncreaseQuotaPrivilege');
    }
    const excludedSet = new Set([...this.systemWhitelistedPids, ...(excludedPids || [])]);
    const totalProcesses = 64;
    const trimmedCount = Math.max(1, totalProcesses - excludedSet.size);
    const freedMb = Math.round(Math.min(this.inUseMb * 0.25, 3500));
    
    this.inUseMb -= freedMb;
    this.freeMb += freedMb;

    const record = {
      timestamp: new Date().toISOString(),
      type: 'working_sets',
      freedMb,
      processesTrimmed: trimmedCount,
      durationMs: 28
    };
    this.addHistory(record);

    return {
      success: true,
      freedMb,
      processesTrimmed: trimmedCount,
      excludedCount: excludedSet.size,
      durationMs: 28
    };
  }

  configureAutoTrimmer(config) {
    if (!config || typeof config !== 'object') {
      throw new Error('InvalidAutoTrimmerConfig: Configuration object required');
    }
    let threshold = typeof config.thresholdPercent === 'number' ? config.thresholdPercent : this.autoTrimmerConfig.thresholdPercent;
    // Boundary clamp between 0% and 100%
    threshold = Math.max(0, Math.min(100, threshold));
    this.autoTrimmerConfig = {
      ...this.autoTrimmerConfig,
      ...config,
      thresholdPercent: threshold
    };
    return { ...this.autoTrimmerConfig };
  }

  getAutoTrimmerConfig() {
    return { ...this.autoTrimmerConfig };
  }

  checkAndAutoTrim() {
    const current = this.getMemoryBreakdown();
    if (this.autoTrimmerConfig.enabled && current.usagePercent >= this.autoTrimmerConfig.thresholdPercent) {
      const standbyRes = this.purgeStandby('normal', true);
      const wsRes = this.purgeWorkingSets(this.autoTrimmerConfig.excludedPids, true);
      const totalFreedMb = standbyRes.freedMb + wsRes.freedMb;
      return { triggered: true, freedMb: totalFreedMb, currentUsagePercent: this.getMemoryBreakdown().usagePercent };
    }
    return { triggered: false, freedMb: 0, currentUsagePercent: current.usagePercent };
  }

  addHistory(record) {
    if (this.purgeHistory.length >= this.maxHistoryEntries) {
      this.purgeHistory.shift();
    }
    this.purgeHistory.push(record);
  }
}

/**
 * 8.3 NetworkFirewallSimulator (R3: Live Network Traffic & Process Firewall Shield)
 * Simulates TCP/UDP socket telemetry (GetExtendedTcpTable/GetExtendedUdpTable), PID process mapping,
 * bandwidth calculation, and Windows Defender Firewall inbound/outbound blocking rules.
 */
export class NetworkFirewallSimulator {
  constructor() {
    this.connections = [
      {
        protocol: 'TCP',
        localAddress: '127.0.0.1',
        localPort: 1420,
        remoteAddress: '0.0.0.0',
        remotePort: 0,
        state: 'LISTEN',
        pid: 4812,
        processName: 'wiscripts-windows.exe',
        processPath: 'C:\\Program Files\\WiScripts\\wiscripts-windows.exe',
        uploadBps: 1024,
        downloadBps: 2048
      },
      {
        protocol: 'TCP',
        localAddress: '192.168.1.105',
        localPort: 52344,
        remoteAddress: '140.82.121.4',
        remotePort: 443,
        state: 'ESTABLISHED',
        pid: 9120,
        processName: 'git.exe',
        processPath: 'C:\\Program Files\\Git\\cmd\\git.exe',
        uploadBps: 15420,
        downloadBps: 124500
      },
      {
        protocol: 'TCP',
        localAddress: '192.168.1.105',
        localPort: 54112,
        remoteAddress: '198.51.100.44',
        remotePort: 8080,
        state: 'ESTABLISHED',
        pid: 6644,
        processName: 'suspicious_miner.exe',
        processPath: 'C:\\Users\\TestUser\\AppData\\Local\\Temp\\suspicious_miner.exe',
        uploadBps: 98000,
        downloadBps: 45000
      },
      {
        protocol: 'UDP',
        localAddress: '0.0.0.0',
        localPort: 5353,
        remoteAddress: '0.0.0.0',
        remotePort: 0,
        state: 'LISTEN',
        pid: 1240,
        processName: 'svchost.exe',
        processPath: 'C:\\Windows\\System32\\svchost.exe',
        uploadBps: 0,
        downloadBps: 0
      },
      {
        protocol: 'TCP',
        localAddress: '0.0.0.0',
        localPort: 0,
        remoteAddress: '0.0.0.0',
        remotePort: 0,
        state: 'LISTEN',
        pid: 0,
        processName: 'System Idle Process',
        processPath: '',
        uploadBps: 0,
        downloadBps: 0
      }
    ];
    this.firewallRules = new Map();
  }

  validatePath(procPath) {
    if (!procPath || typeof procPath !== 'string' || procPath.trim() === '') {
      throw new Error('InvalidPath: Process path cannot be empty');
    }
    if (procPath.includes('..') || procPath.includes('/../') || procPath.includes('\\..\\')) {
      throw new Error(`PathTraversalDetected: Path '${procPath}' contains forbidden relative traversal sequences`);
    }
    return procPath;
  }

  getActiveConnections(filter = {}) {
    let result = [...this.connections];
    if (filter.protocol) {
      result = result.filter(c => c.protocol.toUpperCase() === filter.protocol.toUpperCase());
    }
    if (filter.pid !== undefined && filter.pid !== null) {
      result = result.filter(c => c.pid === filter.pid);
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      result = result.filter(c => c.processName.toLowerCase().includes(q) || c.processPath.toLowerCase().includes(q) || String(c.remotePort).includes(q) || c.remoteAddress.includes(q));
    }
    return result;
  }

  blockProcess(processPath, ruleName = null, isElevated = true) {
    this.validatePath(processPath);
    if (!isElevated) {
      throw new Error('AccessDenied: Modifying Windows Defender Firewall rules requires administrator privileges');
    }
    const procName = path.basename(processPath);
    const resolvedRuleName = ruleName || `WiScripts_Block_${procName}`;

    const rule = {
      ruleName: resolvedRuleName,
      processPath,
      processName: procName,
      direction: 'Both',
      action: 'Block',
      isEnabled: true,
      createdAt: new Date().toISOString()
    };
    this.firewallRules.set(resolvedRuleName, rule);

    // Terminate matching connections
    this.connections = this.connections.filter(c => c.processPath.toLowerCase() !== processPath.toLowerCase());

    return {
      success: true,
      ruleName: resolvedRuleName,
      processPath,
      processName: procName,
      direction: 'Both',
      action: 'Block'
    };
  }

  unblockProcess(ruleNameOrPath, isElevated = true) {
    if (!isElevated) {
      throw new Error('AccessDenied: Modifying Windows Defender Firewall rules requires administrator privileges');
    }
    let removedCount = 0;
    if (this.firewallRules.has(ruleNameOrPath)) {
      this.firewallRules.delete(ruleNameOrPath);
      removedCount = 1;
    } else {
      for (const [key, rule] of this.firewallRules.entries()) {
        if (rule.processPath.toLowerCase() === ruleNameOrPath.toLowerCase() || rule.processName.toLowerCase() === ruleNameOrPath.toLowerCase()) {
          this.firewallRules.delete(key);
          removedCount++;
        }
      }
    }
    return {
      success: true,
      ruleName: ruleNameOrPath,
      removedRulesCount: removedCount,
      message: removedCount > 0 ? `Removed ${removedCount} firewall rule(s)` : 'No active rule found'
    };
  }

  getFirewallRules() {
    return Array.from(this.firewallRules.values());
  }

  getBlockedProcesses() {
    return Array.from(new Set(Array.from(this.firewallRules.values()).map(r => r.processPath)));
  }
}

/**
 * 8.4 HardwareTelemetrySimulator (R4: Hardware NVMe SMART & Battery/Power Analytics)
 * Simulates NVMe SMART health logs (IOCTL_STORAGE_QUERY_PROPERTY), temperature, TBW,
 * laptop battery wear level, discharge rate, and Windows Ultimate Performance power scheme activation.
 */
export class HardwareTelemetrySimulator {
  constructor() {
    this.systemType = 'laptop'; // 'laptop' | 'desktop'
    this.devices = [
      {
        deviceId: '\\\\.\\PhysicalDrive0',
        model: 'Samsung SSD 990 PRO 2TB',
        interfaceType: 'NVMe',
        healthPercentage: 99,
        temperatureC: 41,
        totalBytesWrittenTb: 14.8,
        spareCapacityPercent: 100,
        powerOnHours: 1840,
        criticalWarnings: 0,
        firmwareVersion: '1B2QJXD7',
        isHealthy: true
      },
      {
        deviceId: '\\\\.\\PhysicalDrive1',
        model: 'Crucial MX500 1TB',
        interfaceType: 'SATA',
        healthPercentage: 94,
        temperatureC: 36,
        totalBytesWrittenTb: 48.2,
        spareCapacityPercent: 98,
        powerOnHours: 8900,
        criticalWarnings: 0,
        firmwareVersion: 'M3CR046',
        isHealthy: true
      }
    ];
    this.battery = {
      batteryPresent: true,
      powerSource: 'Battery',
      chargePercent: 88,
      wearLevelPercent: 6.5,
      designCapacityMwh: 70000,
      fullChargeCapacityMwh: 65450,
      cycleCount: 142,
      dischargeRateMw: 14500,
      estimatedRemainingMinutes: 270,
      isCharging: false
    };
    this.powerSchemes = [
      { guid: '381b4222-f694-41f0-9685-ff5bb260df2e', name: 'Balanced', description: 'Automatically balances performance with energy consumption.', isActive: true, isUltimatePerformance: false },
      { guid: '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c', name: 'High Performance', description: 'Favors performance, but may use more energy.', isActive: false, isUltimatePerformance: false },
      { guid: 'a1841308-3541-4fab-bc81-f71556f20b4a', name: 'Power Saver', description: 'Saves power by reducing computer performance.', isActive: false, isUltimatePerformance: false },
      { guid: 'e9a42b02-d5df-448d-aa00-03f14749eb61', name: 'Ultimate Performance', description: 'Provides ultimate performance on higher end PCs.', isActive: false, isUltimatePerformance: true }
    ];
  }

  setSystemType(type) {
    this.systemType = type;
    if (type === 'desktop') {
      this.battery = {
        batteryPresent: false,
        powerSource: 'AC',
        chargePercent: 100,
        wearLevelPercent: 0,
        designCapacityMwh: 0,
        fullChargeCapacityMwh: 0,
        cycleCount: 0,
        dischargeRateMw: 0,
        estimatedRemainingMinutes: 0,
        isCharging: false
      };
    } else {
      this.battery = {
        batteryPresent: true,
        powerSource: 'Battery',
        chargePercent: 88,
        wearLevelPercent: 6.5,
        designCapacityMwh: 70000,
        fullChargeCapacityMwh: 65450,
        cycleCount: 142,
        dischargeRateMw: 14500,
        estimatedRemainingMinutes: 270,
        isCharging: false
      };
    }
  }

  getStorageDevices() {
    return this.devices.map(d => {
      const isTempWarning = d.temperatureC < 0 || d.temperatureC > 80;
      return {
        ...d,
        sensorWarning: isTempWarning ? 'Abnormal temperature detected' : null
      };
    });
  }

  getBatteryAnalytics() {
    let calculatedWear = 0;
    if (this.battery.batteryPresent && this.battery.designCapacityMwh > 0) {
      calculatedWear = Number((((this.battery.designCapacityMwh - this.battery.fullChargeCapacityMwh) / this.battery.designCapacityMwh) * 100).toFixed(1));
    }
    return {
      ...this.battery,
      wearLevelPercent: calculatedWear
    };
  }

  getPowerSchemes() {
    return [...this.powerSchemes];
  }

  setActivePowerScheme(guid) {
    const found = this.powerSchemes.find(p => p.guid.toLowerCase() === guid.toLowerCase());
    if (!found) {
      throw new Error(`PowerSchemeNotFound: GUID '${guid}' does not match any registered power scheme`);
    }
    for (const p of this.powerSchemes) {
      p.isActive = (p.guid.toLowerCase() === guid.toLowerCase());
    }
    return true;
  }

  enableUltimatePerformance() {
    const ultGuid = 'e9a42b02-d5df-448d-aa00-03f14749eb61';
    let ult = this.powerSchemes.find(p => p.guid.toLowerCase() === ultGuid);
    if (!ult) {
      ult = {
        guid: ultGuid,
        name: 'Ultimate Performance',
        description: 'Provides ultimate performance on higher end PCs.',
        isActive: false,
        isUltimatePerformance: true
      };
      this.powerSchemes.push(ult);
    }
    this.setActivePowerScheme(ultGuid);
    return { ...ult, isActive: true };
  }
}

// --- 8b. Disk Space Analyzer & Safe Deletion Subsystem Simulators ---

export const PROTECTED_SYSTEM_PATHS = [
  'c:\\windows',
  'c:\\windows\\system32',
  'c:\\windows\\syswow64',
  'c:\\windows\\winsxs',
  'c:\\windows\\systemapps',
  'c:\\windows\\boot',
  'c:\\boot',
  'c:\\recovery',
  'c:\\$windows.~bt',
  'c:\\$windows.~ws',
  'c:\\system volume information',
  'c:\\$recycle.bin',
  'd:\\system volume information',
  'd:\\$recycle.bin',
  'e:\\system volume information',
  'e:\\$recycle.bin',
  'c:\\program files',
  'c:\\program files (x86)',
  'c:\\programdata\\microsoft\\windows',
  'c:\\users\\default',
  'c:\\users\\public'
];

export function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(Number(bytes)) / Math.log(k));
  if (i < 0 || !isFinite(i)) return '0 B';
  const idx = Math.min(i, sizes.length - 1);
  const val = (Number(bytes) / Math.pow(k, idx)).toFixed(2);
  return `${parseFloat(val)} ${sizes[idx]}`;
}

export function formatTabularBytes(bytes) {
  return `${Number(bytes).toLocaleString('en-US').replace(/,/g, ' ')} B`;
}

export class VirtualFilesystemSimulator {
  constructor() {
    this.drives = new Map();
    this.nodes = new Map(); // normalized path lowercased -> Node
    this.recycleBin = [];
    this.initDefaultDrives();
  }

  initDefaultDrives() {
    this.addDrive('C', {
      name: 'Local Disk (C:)',
      mountPoint: 'C:\\',
      totalBytes: 512110190592, // 512 GB
      freeBytes: 128849018880,  // 120 GB
      fileSystem: 'NTFS',
      isSystem: true
    });
    this.addDrive('D', {
      name: 'Secondary Data (D:)',
      mountPoint: 'D:\\',
      totalBytes: 1024220381184, // 1 TB
      freeBytes: 644245094400,   // 600 GB
      fileSystem: 'NTFS',
      isSystem: false
    });
  }

  normalizePath(rawPath) {
    if (!rawPath || typeof rawPath !== 'string') return '';
    let p = rawPath.trim();
    if (p.startsWith('\\\\?\\')) {
      p = p.substring(4);
    }
    p = p.replace(/\//g, '\\');
    if (/^[a-zA-Z]:/.test(p)) {
      p = p[0].toUpperCase() + p.substring(1);
    }
    p = p.replace(/\\+/g, '\\');

    const parts = p.split('\\');
    const resolved = [];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part === '.' || (part === '' && i > 0 && i === parts.length - 1)) {
        continue;
      }
      if (part === '..') {
        if (resolved.length > 1) {
          resolved.pop();
        }
        continue;
      }
      if (part !== '' || i === 0) {
        resolved.push(part);
      }
    }

    let out = resolved.join('\\');
    if (/^[A-Z]:$/.test(out)) {
      out += '\\';
    }
    return out;
  }

  getDrives() {
    return Array.from(this.drives.values());
  }

  addDrive(letter, info = {}) {
    const key = letter.toUpperCase();
    const driveObj = {
      id: key,
      name: info.name || `Drive (${key}:)`,
      mountPoint: `${key}:\\`,
      totalBytes: info.totalBytes || 512110190592,
      freeBytes: info.freeBytes || 128849018880,
      fileSystem: info.fileSystem || 'NTFS',
      isSystem: info.isSystem !== undefined ? info.isSystem : key === 'C'
    };
    this.drives.set(key, driveObj);
    const rootPath = `${key}:\\`;
    this.mkdir(rootPath);
  }

  mkdir(dirPath, options = {}) {
    const norm = this.normalizePath(dirPath);
    if (!norm) return null;
    const key = norm.toLowerCase();
    if (this.nodes.has(key)) {
      const existing = this.nodes.get(key);
      if (options.isAccessDenied !== undefined) existing.isAccessDenied = options.isAccessDenied;
      return existing;
    }

    const parentPath = this.getParentPath(norm);
    if (parentPath && parentPath !== norm) {
      this.mkdir(parentPath);
    }

    const nodeName = this.getNodeName(norm);
    const node = {
      id: `dir_${Math.random().toString(36).substring(2, 9)}`,
      name: nodeName || norm,
      path: norm,
      isDirectory: true,
      sizeBytes: 0,
      fileCount: 0,
      folderCount: 0,
      modifiedTimestamp: options.modifiedTimestamp || Math.floor(Date.now() / 1000),
      isReadOnly: options.isReadOnly || false,
      isLocked: options.isLocked || false,
      isAccessDenied: options.isAccessDenied || false,
      symlinkTarget: options.symlinkTarget || null,
      children: new Map()
    };
    this.nodes.set(key, node);

    if (parentPath && parentPath !== norm) {
      const parentNode = this.nodes.get(parentPath.toLowerCase());
      if (parentNode) {
        parentNode.children.set(nodeName.toLowerCase(), node);
      }
    }
    return node;
  }

  writeFile(filePath, sizeBytes = 0, options = {}) {
    const norm = this.normalizePath(filePath);
    if (!norm) return null;
    const parentPath = this.getParentPath(norm);
    if (parentPath) {
      this.mkdir(parentPath);
    }
    const nodeName = this.getNodeName(norm);
    const ext = path.extname(nodeName).replace(/^\./, '').toLowerCase();

    const node = {
      id: `file_${Math.random().toString(36).substring(2, 9)}`,
      name: nodeName,
      path: norm,
      isDirectory: false,
      sizeBytes: Number(sizeBytes),
      fileCount: 0,
      folderCount: 0,
      extension: ext,
      modifiedTimestamp: options.modifiedTimestamp || Math.floor(Date.now() / 1000),
      isReadOnly: options.isReadOnly || false,
      isLocked: options.isLocked || false,
      isAccessDenied: options.isAccessDenied || false,
      symlinkTarget: options.symlinkTarget || null,
      children: new Map()
    };
    const key = norm.toLowerCase();
    this.nodes.set(key, node);

    if (parentPath) {
      const parentNode = this.nodes.get(parentPath.toLowerCase());
      if (parentNode) {
        parentNode.children.set(nodeName.toLowerCase(), node);
      }
    }
    return node;
  }

  addSymlink(linkPath, targetPath) {
    const normLink = this.normalizePath(linkPath);
    const normTarget = this.normalizePath(targetPath);
    return this.mkdir(normLink, { symlinkTarget: normTarget });
  }

  getNode(pathStr) {
    const norm = this.normalizePath(pathStr);
    return this.nodes.get(norm.toLowerCase()) || null;
  }

  getParentPath(normPath) {
    if (/^[A-Z]:\\$/.test(normPath)) return null;
    const lastSlash = normPath.lastIndexOf('\\');
    if (lastSlash === -1) return null;
    if (lastSlash === 2 && normPath[1] === ':') {
      return normPath.substring(0, 3);
    }
    return normPath.substring(0, lastSlash);
  }

  getNodeName(normPath) {
    if (/^[A-Z]:\\$/.test(normPath)) return normPath;
    const lastSlash = normPath.lastIndexOf('\\');
    if (lastSlash === -1) return normPath;
    return normPath.substring(lastSlash + 1);
  }

  deleteNode(pathStr, permanent = false) {
    const norm = this.normalizePath(pathStr);
    const key = norm.toLowerCase();
    const node = this.nodes.get(key);
    if (!node) return false;

    const parentPath = this.getParentPath(norm);
    if (parentPath) {
      const parentNode = this.nodes.get(parentPath.toLowerCase());
      if (parentNode) {
        parentNode.children.delete(node.name.toLowerCase());
      }
    }

    const keysToRemove = [];
    const collectKeys = (currPath) => {
      const k = currPath.toLowerCase();
      keysToRemove.push(k);
      for (const [nKey] of this.nodes.entries()) {
        if (nKey.startsWith(k + '\\')) {
          keysToRemove.push(nKey);
        }
      }
    };
    collectKeys(norm);

    for (const k of keysToRemove) {
      const n = this.nodes.get(k);
      if (n) {
        if (!permanent) {
          this.recycleBin.push({ ...n, deletedAt: Date.now() });
        }
        this.nodes.delete(k);
      }
    }
    return true;
  }

  populateSampleDrive(driveLetter = 'C') {
    const root = `${driveLetter.toUpperCase()}:\\`;
    this.mkdir(root);

    this.mkdir(`${root}Windows`);
    this.mkdir(`${root}Windows\\System32`);
    this.writeFile(`${root}Windows\\System32\\ntoskrnl.exe`, 10485760); // 10MB
    this.writeFile(`${root}Windows\\System32\\kernel32.dll`, 2097152);  // 2MB
    this.mkdir(`${root}Windows\\WinSxS`);
    this.writeFile(`${root}Windows\\WinSxS\\manifest.xml`, 5242880);   // 5MB

    this.mkdir(`${root}System Volume Information`);
    this.writeFile(`${root}System Volume Information\\tracking.log`, 1024);
    this.mkdir(`${root}Boot`);
    this.writeFile(`${root}Boot\\BCD`, 262144);
    this.mkdir(`${root}$Recycle.Bin`);

    this.mkdir(`${root}Program Files`);
    this.mkdir(`${root}Program Files\\WiScripts`);
    this.writeFile(`${root}Program Files\\WiScripts\\wiscripts.exe`, 26214400); // 25MB

    this.mkdir(`${root}Users`);
    this.mkdir(`${root}Users\\TestUser`);
    this.mkdir(`${root}Users\\TestUser\\Documents`);
    this.writeFile(`${root}Users\\TestUser\\Documents\\report.docx`, 1048576); // 1MB
    this.writeFile(`${root}Users\\TestUser\\Documents\\data.xlsx`, 2097152);   // 2MB

    this.mkdir(`${root}Users\\TestUser\\Downloads`);
    this.writeFile(`${root}Users\\TestUser\\Downloads\\installer.exe`, 52428800); // 50MB
    this.writeFile(`${root}Users\\TestUser\\Downloads\\archive.zip`, 104857600);  // 100MB

    this.mkdir(`${root}Users\\TestUser\\Projects`);
    this.mkdir(`${root}Users\\TestUser\\Projects\\WebApp`);
    this.mkdir(`${root}Users\\TestUser\\Projects\\WebApp\\node_modules`);
    this.writeFile(`${root}Users\\TestUser\\Projects\\WebApp\\node_modules\\bundle.js`, 41943040); // 40MB
    this.writeFile(`${root}Users\\TestUser\\Projects\\WebApp\\package.json`, 2048);

    this.mkdir(`${root}Users\\TestUser\\AppData\\Local\\Temp`);
    this.writeFile(`${root}Users\\TestUser\\AppData\\Local\\Temp\\cache.tmp`, 15728640); // 15MB
  }
}

export class DiskDeletionEngineSimulator {
  constructor(vfs = new VirtualFilesystemSimulator()) {
    this.vfs = vfs;
    this.deletionLog = [];
  }

  validateDeletionGuardrail(rawPath) {
    const norm = this.vfs.normalizePath(rawPath);
    const pathLower = norm.toLowerCase();

    // Check root drive e.g. "C:\" or "C:"
    if (/^[a-z]:\\?$/i.test(pathLower) || pathLower.startsWith('\\\\?\\')) {
      throw new Error(`Security Violation: Cannot delete root drive directory '${norm}'`);
    }

    // Block C:\Users root folder itself (exact match only)
    if (pathLower === 'c:\\users' || pathLower === 'c:\\users\\') {
      throw new Error(`Security Violation: Deletion of critical Windows system directory '${norm}' is blocked`);
    }

    for (const protectedPath of PROTECTED_SYSTEM_PATHS) {
      const protLower = protectedPath.toLowerCase();
      if (pathLower === protLower || pathLower.startsWith(protLower + '\\')) {
        throw new Error(`Security Violation: Deletion of critical Windows system directory '${norm}' is blocked`);
      }
    }
    return norm;
  }

  checkPathProtection(rawPath) {
    try {
      this.validateDeletionGuardrail(rawPath);
      return { isProtected: false };
    } catch (err) {
      return { isProtected: true, reason: err.message };
    }
  }

  deleteItem(rawPath, { permanent = false, dryRun = false } = {}) {
    const norm = this.validateDeletionGuardrail(rawPath);
    const node = this.vfs.getNode(norm);

    if (!node) {
      return {
        success: false,
        path: norm,
        bytesFreed: 0,
        itemsDeleted: 0,
        movedToRecycleBin: !permanent,
        errors: [`File does not exist: ${norm}`]
      };
    }

    const allDescendants = [];
    const errors = [];
    const prefix = norm.toLowerCase();

    for (const [k, n] of this.vfs.nodes.entries()) {
      if (k === prefix || k.startsWith(prefix + '\\')) {
        allDescendants.push(n);
      }
    }

    let bytesFreed = 0;
    let itemsDeleted = 0;
    const lockedNodes = [];

    for (const item of allDescendants) {
      if (item.isLocked) {
        errors.push(`File is locked by another process: ${item.path}`);
        lockedNodes.push(item);
      } else {
        if (!item.isDirectory) {
          bytesFreed += item.sizeBytes;
        }
        itemsDeleted++;
      }
    }

    if (dryRun) {
      this.deletionLog.push({ path: norm, permanent, dryRun: true, bytesFreed, itemsDeleted });
      return {
        success: true,
        path: norm,
        bytesFreed,
        itemsDeleted,
        movedToRecycleBin: !permanent,
        isDryRun: true,
        errors
      };
    }

    if (lockedNodes.length === allDescendants.length) {
      return {
        success: false,
        path: norm,
        bytesFreed: 0,
        itemsDeleted: 0,
        movedToRecycleBin: !permanent,
        errors
      };
    }

    if (errors.length === 0) {
      this.vfs.deleteNode(norm, permanent);
    } else {
      const lockedAncestorPrefixes = new Set();
      for (const locked of lockedNodes) {
        let p = this.vfs.getParentPath(locked.path);
        while (p) {
          lockedAncestorPrefixes.add(p.toLowerCase());
          p = this.vfs.getParentPath(p);
        }
      }

      for (const item of allDescendants) {
        if (!item.isLocked) {
          if (item.isDirectory && lockedAncestorPrefixes.has(item.path.toLowerCase())) {
            continue;
          }
          this.vfs.deleteNode(item.path, permanent);
        }
      }
    }

    this.deletionLog.push({ path: norm, permanent, dryRun: false, bytesFreed, itemsDeleted, errors });
    return {
      success: errors.length === 0,
      path: norm,
      bytesFreed,
      itemsDeleted,
      movedToRecycleBin: !permanent,
      errors
    };
  }

  deleteItems(paths, options = {}) {
    const results = [];
    for (const p of paths) {
      results.push(this.deleteItem(p, options));
    }
    return results;
  }
}

export class DiskAnalyzerEngineSimulator {
  constructor(vfs = new VirtualFilesystemSimulator()) {
    this.vfs = vfs;
    this.isCancelled = false;
  }

  cancelScan() {
    this.isCancelled = true;
    return true;
  }

  async scan(targetPath, { maxDepth = null, ipc = null, emitProgress = true } = {}) {
    const scanStart = Date.now();
    const normTarget = this.vfs.normalizePath(targetPath);
    const rootNodeData = this.vfs.getNode(normTarget);

    if (!rootNodeData) {
      throw new Error(`PathNotFound: Target path '${normTarget}' does not exist on filesystem`);
    }
    if (rootNodeData.isAccessDenied) {
      throw new Error(`AccessDenied: Permission denied scanning path '${normTarget}'`);
    }

    const visitedCanonicalPaths = new Set();
    const skippedErrors = [];
    const allFolders = [];
    const allFiles = [];
    let filesScanned = 0;
    let dirsScanned = 0;
    let bytesProcessed = 0;
    let nodeCounter = 1;

    if (ipc && emitProgress) {
      await ipc.emit('disk-scan-progress', {
        filesScanned: 0,
        directoriesScanned: 0,
        bytesProcessed: 0,
        currentPath: normTarget,
        elapsedMs: 0
      });
    }

    if (this.isCancelled) {
      this.isCancelled = false;
      return {
        rootNode: {
          id: 'node_root',
          name: rootNodeData.name,
          path: rootNodeData.path,
          isDirectory: true,
          sizeBytes: 0,
          fileCount: 0,
          folderCount: 0,
          percentageOfParent: 100,
          percentageOfRoot: 100,
          modifiedTimestamp: rootNodeData.modifiedTimestamp,
          children: []
        },
        totalBytes: 0,
        totalFiles: 0,
        totalFolders: 0,
        scanDurationMs: Math.max(1, Date.now() - scanStart),
        largestFolders: [],
        largestFiles: [],
        skippedErrors: [],
        isPartial: true
      };
    }

    const buildTree = (currNode, currentDepth) => {
      if (this.isCancelled) {
        return null;
      }

      const norm = this.vfs.normalizePath(currNode.path);
      const canonKey = (currNode.symlinkTarget ? this.vfs.normalizePath(currNode.symlinkTarget) : norm).toLowerCase();

      if (visitedCanonicalPaths.has(canonKey)) {
        skippedErrors.push(`Circular link detected: ${norm} -> ${currNode.symlinkTarget}`);
        return null;
      }
      visitedCanonicalPaths.add(canonKey);

      if (currNode.isAccessDenied) {
        skippedErrors.push(`Access Denied: ${norm}`);
        return null;
      }

      dirsScanned++;

      let subtreeBytes = 0;
      let subtreeFiles = 0;
      let subtreeFolders = 0;
      const childTreeNodes = [];

      const canRecurse = maxDepth === null || currentDepth < maxDepth;

      if (canRecurse && currNode.children) {
        for (const [, child] of currNode.children.entries()) {
          if (this.isCancelled) break;

          if (child.isDirectory) {
            subtreeFolders++;
            const childResult = buildTree(child, currentDepth + 1);
            if (childResult) {
              subtreeBytes += childResult.sizeBytes;
              subtreeFiles += childResult.fileCount;
              subtreeFolders += childResult.folderCount;
              childTreeNodes.push(childResult);
            }
          } else {
            subtreeFiles++;
            subtreeBytes += child.sizeBytes;
            filesScanned++;
            bytesProcessed += child.sizeBytes;

            const fileTreeNode = {
              id: `node_${nodeCounter++}`,
              name: child.name,
              path: child.path,
              isDirectory: false,
              sizeBytes: child.sizeBytes,
              fileCount: 0,
              folderCount: 0,
              extension: child.extension || '',
              percentageOfParent: 0,
              percentageOfRoot: 0,
              modifiedTimestamp: child.modifiedTimestamp || Math.floor(Date.now() / 1000)
            };
            childTreeNodes.push(fileTreeNode);

            allFiles.push({
              path: child.path,
              name: child.name,
              sizeBytes: child.sizeBytes,
              extension: child.extension || '',
              modifiedTimestamp: child.modifiedTimestamp || Math.floor(Date.now() / 1000),
              percentageOfTotal: 0
            });
          }
        }
      }

      childTreeNodes.sort((a, b) => b.sizeBytes - a.sizeBytes);

      for (const child of childTreeNodes) {
        child.percentageOfParent = subtreeBytes > 0 ? Number(((child.sizeBytes / subtreeBytes) * 100).toFixed(2)) : 0;
      }

      const treeNode = {
        id: `node_${nodeCounter++}`,
        name: currNode.name,
        path: currNode.path,
        isDirectory: true,
        sizeBytes: subtreeBytes,
        fileCount: subtreeFiles,
        folderCount: subtreeFolders,
        percentageOfParent: 100,
        percentageOfRoot: 100,
        modifiedTimestamp: currNode.modifiedTimestamp || Math.floor(Date.now() / 1000),
        children: childTreeNodes
      };

      if (norm !== normTarget) {
        allFolders.push({
          path: currNode.path,
          name: currNode.name,
          totalBytes: subtreeBytes,
          itemCount: subtreeFiles + subtreeFolders,
          percentageOfTotal: 0
        });
      }

      return treeNode;
    };

    const rootTreeNode = buildTree(rootNodeData, 0) || {
      id: 'node_root',
      name: rootNodeData.name,
      path: rootNodeData.path,
      isDirectory: true,
      sizeBytes: 0,
      fileCount: 0,
      folderCount: 0,
      percentageOfParent: 100,
      percentageOfRoot: 100,
      modifiedTimestamp: rootNodeData.modifiedTimestamp,
      children: []
    };

    const totalBytes = rootTreeNode.sizeBytes;
    const totalFiles = rootTreeNode.fileCount;
    const totalFolders = rootTreeNode.folderCount;

    const assignRootPercentage = (node) => {
      node.percentageOfRoot = totalBytes > 0 ? Number(((node.sizeBytes / totalBytes) * 100).toFixed(2)) : 0;
      if (node.children) {
        for (const child of node.children) {
          assignRootPercentage(child);
        }
      }
    };
    assignRootPercentage(rootTreeNode);

    for (const f of allFolders) {
      f.percentageOfTotal = totalBytes > 0 ? Number(((f.totalBytes / totalBytes) * 100).toFixed(2)) : 0;
    }
    allFolders.sort((a, b) => b.totalBytes - a.totalBytes);
    const largestFolders = allFolders.slice(0, 20);

    for (const file of allFiles) {
      file.percentageOfTotal = totalBytes > 0 ? Number(((file.sizeBytes / totalBytes) * 100).toFixed(2)) : 0;
    }
    allFiles.sort((a, b) => b.sizeBytes - a.sizeBytes);
    const largestFiles = allFiles.slice(0, 50);

    const elapsedMs = Math.max(1, Date.now() - scanStart);

    if (ipc && emitProgress) {
      await ipc.emit('disk-scan-progress', {
        filesScanned,
        directoriesScanned: dirsScanned,
        bytesProcessed,
        currentPath: normTarget,
        elapsedMs
      });
    }

    return {
      rootNode: rootTreeNode,
      totalBytes,
      totalFiles,
      totalFolders,
      scanDurationMs: elapsedMs,
      largestFolders,
      largestFiles,
      skippedErrors,
      isPartial: this.isCancelled
    };
  }

  searchTree(rootNode, { query = '', extension = '', minBytes = 0 } = {}) {
    if (!rootNode) return null;
    const qLower = (query || '').toLowerCase().trim();
    const extFilter = (extension || '').toLowerCase().replace(/^\./, '').trim();
    const minSize = Number(minBytes) || 0;

    if (!qLower && !extFilter && minSize === 0) {
      return JSON.parse(JSON.stringify(rootNode));
    }

    const filterNode = (node) => {
      if (!node.isDirectory) {
        const matchesQuery = !qLower || node.name.toLowerCase().includes(qLower) || node.path.toLowerCase().includes(qLower);
        const matchesExt = !extFilter || (node.extension && node.extension.toLowerCase() === extFilter) || node.name.toLowerCase().endsWith('.' + extFilter);
        const matchesSize = node.sizeBytes >= minSize;
        return (matchesQuery && matchesExt && matchesSize) ? { ...node } : null;
      }

      const matchingChildren = [];
      if (node.children) {
        for (const child of node.children) {
          const res = filterNode(child);
          if (res) {
            matchingChildren.push(res);
          }
        }
      }

      const folderMatchesQuery = !qLower || node.name.toLowerCase().includes(qLower) || node.path.toLowerCase().includes(qLower);

      if (matchingChildren.length > 0 || (folderMatchesQuery && !extFilter && minSize === 0)) {
        return {
          ...node,
          children: matchingChildren
        };
      }
      return null;
    };

    return filterNode(rootNode);
  }
}

export function syncTreeAfterDeletion(rootNode, deletedPath, bytesFreed, itemsDeleted) {
  if (!rootNode || !deletedPath) return rootNode;
  const targetNorm = deletedPath.replace(/\//g, '\\').toLowerCase();

  const updateSubtree = (node) => {
    const nodeNorm = node.path.replace(/\//g, '\\').toLowerCase();
    if (nodeNorm === targetNorm) {
      return { removed: true, bytes: node.sizeBytes, files: node.fileCount || 1, folders: node.folderCount || 0 };
    }

    if (node.children && node.children.length > 0) {
      const newChildren = [];
      let freedInChild = 0;
      let itemsInChild = 0;

      for (const child of node.children) {
        const childNorm = child.path.replace(/\//g, '\\').toLowerCase();
        if (childNorm === targetNorm) {
          freedInChild += child.sizeBytes;
          itemsInChild += (child.isDirectory ? ((child.fileCount || 0) + (child.folderCount || 0) + 1) : 1);
        } else {
          const subResult = updateSubtree(child);
          if (subResult && subResult.freed) {
            freedInChild += subResult.freed;
            itemsInChild += subResult.items;
          }
          newChildren.push(child);
        }
      }

      if (freedInChild > 0 || itemsInChild > 0) {
        node.sizeBytes = Math.max(0, node.sizeBytes - freedInChild);
        node.fileCount = Math.max(0, (node.fileCount || 0) - itemsInChild);
        node.children = newChildren;

        for (const child of node.children) {
          child.percentageOfParent = node.sizeBytes > 0 ? Number(((child.sizeBytes / node.sizeBytes) * 100).toFixed(2)) : 0;
        }
        return { freed: freedInChild, items: itemsInChild };
      }
    }
    return null;
  };

  updateSubtree(rootNode);

  const total = rootNode.sizeBytes;
  const recomputeRootPercentage = (node) => {
    node.percentageOfRoot = total > 0 ? Number(((node.sizeBytes / total) * 100).toFixed(2)) : 0;
    if (node.children) {
      for (const child of node.children) {
        recomputeRootPercentage(child);
      }
    }
  };
  recomputeRootPercentage(rootNode);

  return rootNode;
}

// --- 9. Mock IPC Simulator for v1.3.0 Architecture ---
export class MockIPC {
  constructor(isElevated = true) {
    this.isElevated = isElevated;
    this.handlers = new Map();
    this.eventListeners = new Map();
    this.emittedEvents = [];
    this.scm = new Win32ScmSimulator();
    this.kernelLatency = new KernelLatencySimulator();
    this.memoryPurger = new NativeMemoryPurgerSimulator();
    this.networkFirewall = new NetworkFirewallSimulator();
    this.hardwareTelemetry = new HardwareTelemetrySimulator();
    this.vfs = new VirtualFilesystemSimulator();
    this.diskAnalyzer = new DiskAnalyzerEngineSimulator(this.vfs);
    this.diskDeletion = new DiskDeletionEngineSimulator(this.vfs);
    this.explorerInvocations = [];
    this.clipboardContent = '';
    this.setupDefaultHandlers();
  }

  setupDefaultHandlers() {
    // General System Info
    this.registerHandler('get_system_info', async () => ({
      osName: 'Windows 11 Pro',
      osVersion: '24H2',
      osBuild: '26100.1150',
      isElevated: this.isElevated,
      cpuUsagePercent: 12,
      memoryUsedMb: 6144,
      memoryTotalMb: 16384,
      telemetryStatus: 'Active'
    }));

    // Scripts Library
    this.registerHandler('sync_scripts_library', async ({ force_refresh }) => ({
      success: true,
      source: force_refresh ? 'remote_github' : 'local_cache',
      etag: '"a1b2c3d4e5f6"',
      totalScripts: 15,
      cachedAt: new Date().toISOString()
    }));

    this.registerHandler('get_cached_scripts_library', async () => ({
      schemaVersion: '1.0.0',
      totalScripts: 15,
      scripts: [
        {
          id: 'maint-clear-wu-cache',
          name: 'Purge Windows Update Cache',
          category: 'maintenance',
          path: 'maintenance/clear_windows_update_cache.ps1',
          riskLevel: 'safe',
          sha256: '4a7d65b4c489f074d6f8595a898b9e6ffcb23871239857948292837498192837'
        },
        {
          id: 'maint-clean-winsxs',
          name: 'Clean Component Store (WinSxS DISM)',
          category: 'maintenance',
          path: 'maintenance/clean_component_store_winsxs.ps1',
          riskLevel: 'elevated',
          sha256: '3d9f10a8c2918273645102938475610293847561029384756102938475610293'
        },
        {
          id: 'net-flush-dns-winsock',
          name: 'Flush DNS & Reset Winsock Catalog',
          category: 'network',
          path: 'network/flush_dns_reset_winsock.ps1',
          riskLevel: 'safe',
          sha256: '8f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a'
        }
      ]
    }));

    this.registerHandler('create_preflight_snapshot', async ({ description, rule_ids }) => ({
      snapshotId: `snap_${Date.now()}`,
      sequenceNumber: 1042,
      timestamp: new Date().toISOString(),
      stateEngineSuccess: true,
      restorePointSuccess: true,
      rulesCaptured: rule_ids ? rule_ids.length : 0
    }));

    this.registerHandler('execute_custom_script', async ({ script_content, script_type, dry_run }) => {
      if (!script_content || script_content.trim() === '') {
        throw new Error('Script content cannot be empty');
      }
      const lines = script_content.split('\n');
      for (const line of lines) {
        await this.emit('script-output-line', { line: line.trim(), stream: 'stdout' });
      }
      return { exit_code: 0, stdout: script_content, stderr: '' };
    });

    // Subsystem 1: Gaming Low-Latency & DPC Analyzer (R1)
    this.registerHandler('get_latency_metrics', async () => {
      return this.kernelLatency.getLatencyMetrics();
    });

    this.registerHandler('set_timer_resolution', async ({ resolution_100ns }) => {
      return this.kernelLatency.setResolution(resolution_100ns, this.isElevated);
    });

    this.registerHandler('set_system_timer_resolution', async ({ resolution_100ns }) => {
      return this.kernelLatency.setResolution(resolution_100ns, this.isElevated);
    });

    this.registerHandler('toggle_game_boost', async ({ target_pid, enable }) => {
      return this.kernelLatency.toggleGameBoost(target_pid, enable, this.isElevated, this.scm);
    });

    this.registerHandler('get_game_boost_status', async () => {
      return this.kernelLatency.getGameBoostStatus();
    });

    // Subsystem 2: Smart RAM & Standby List Purger (R2)
    this.registerHandler('get_memory_breakdown', async () => {
      return this.memoryPurger.getMemoryBreakdown();
    });

    this.registerHandler('purge_standby_memory', async ({ mode } = {}) => {
      return this.memoryPurger.purgeStandby(mode || 'normal', this.isElevated);
    });

    this.registerHandler('purge_working_sets', async ({ excluded_pids } = {}) => {
      return this.memoryPurger.purgeWorkingSets(excluded_pids || [], this.isElevated);
    });

    this.registerHandler('configure_ram_auto_trimmer', async ({ config }) => {
      return this.memoryPurger.configureAutoTrimmer(config);
    });

    this.registerHandler('set_memory_purger_config', async ({ config }) => {
      return this.memoryPurger.configureAutoTrimmer(config);
    });

    this.registerHandler('get_ram_auto_trimmer_config', async () => {
      return this.memoryPurger.getAutoTrimmerConfig();
    });

    this.registerHandler('get_memory_purger_config', async () => {
      return this.memoryPurger.getAutoTrimmerConfig();
    });

    // Subsystem 3: Live Network Traffic & Process Firewall Shield (R3)
    this.registerHandler('get_active_network_connections', async (filter = {}) => {
      return this.networkFirewall.getActiveConnections(filter);
    });

    this.registerHandler('get_firewall_rules', async () => {
      return this.networkFirewall.getFirewallRules();
    });

    this.registerHandler('get_firewall_rules_status', async () => {
      return this.networkFirewall.getFirewallRules();
    });

    this.registerHandler('block_process_firewall', async ({ process_path, rule_name }) => {
      return this.networkFirewall.blockProcess(process_path, rule_name, this.isElevated);
    });

    this.registerHandler('unblock_process_firewall', async ({ rule_name }) => {
      return this.networkFirewall.unblockProcess(rule_name, this.isElevated);
    });

    // Subsystem 4: Hardware NVMe SMART & Battery/Power Analytics (R4)
    this.registerHandler('get_storage_devices_health', async () => {
      return this.hardwareTelemetry.getStorageDevices();
    });

    this.registerHandler('get_nvme_smart_health', async () => {
      return this.hardwareTelemetry.getStorageDevices();
    });

    this.registerHandler('get_battery_health_analytics', async () => {
      return this.hardwareTelemetry.getBatteryAnalytics();
    });

    this.registerHandler('get_battery_power_analytics', async () => {
      return this.hardwareTelemetry.getBatteryAnalytics();
    });

    this.registerHandler('get_power_schemes', async () => {
      return this.hardwareTelemetry.getPowerSchemes();
    });

    this.registerHandler('get_power_profiles', async () => {
      return this.hardwareTelemetry.getPowerSchemes();
    });

    this.registerHandler('set_active_power_scheme', async ({ scheme_guid }) => {
      return this.hardwareTelemetry.setActivePowerScheme(scheme_guid);
    });

    this.registerHandler('enable_ultimate_performance_scheme', async () => {
      return this.hardwareTelemetry.enableUltimatePerformance();
    });

    this.registerHandler('activate_ultimate_performance_power_plan', async () => {
      return this.hardwareTelemetry.enableUltimatePerformance();
    });

    // Subsystem 5: Disk Space Analyzer & Filesystem Tree Explorer
    this.registerHandler('get_disk_drives', async () => {
      return this.vfs.getDrives();
    });

    this.registerHandler('scan_disk_space', async ({ target_path, max_depth } = {}) => {
      this.diskAnalyzer.isCancelled = false;
      return this.diskAnalyzer.scan(target_path, { maxDepth: max_depth, ipc: this });
    });

    this.registerHandler('cancel_disk_scan', async () => {
      return { cancelled: this.diskAnalyzer.cancelScan() };
    });

    this.registerHandler('delete_filesystem_item', async ({ path, permanent } = {}) => {
      return this.diskDeletion.deleteItem(path, { permanent: !!permanent, dryRun: this.isDryRun || false });
    });

    this.registerHandler('delete_filesystem_items', async ({ paths, permanent } = {}) => {
      return this.diskDeletion.deleteItems(paths || [], { permanent: !!permanent, dryRun: this.isDryRun || false });
    });

    this.registerHandler('check_path_protection', async ({ path } = {}) => {
      return this.diskDeletion.checkPathProtection(path);
    });

    this.registerHandler('open_path_in_explorer', async ({ path } = {}) => {
      this.explorerInvocations.push(path);
      return { launched: true, path, command: 'explorer.exe' };
    });

    this.registerHandler('open_in_file_explorer', async ({ path } = {}) => {
      this.explorerInvocations.push(path);
      return { launched: true, path, command: 'explorer.exe' };
    });

    this.registerHandler('copy_path_to_clipboard', async ({ path } = {}) => {
      this.clipboardContent = path;
      return { copied: true, content: path };
    });

    this.registerHandler('copy_to_clipboard', async ({ text } = {}) => {
      this.clipboardContent = text;
      return { copied: true, content: text };
    });
  }

  registerHandler(command, handler) {
    this.handlers.set(command, handler);
  }

  async invoke(command, payload = {}) {
    if (!this.handlers.has(command)) {
      throw new Error(`IPCCommandNotFound: Command '${command}' has no registered handler`);
    }
    return await this.handlers.get(command)(payload);
  }

  listen(eventName, callback) {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, []);
    }
    this.eventListeners.get(eventName).push(callback);
    return () => {
      const listeners = this.eventListeners.get(eventName) || [];
      this.eventListeners.set(eventName, listeners.filter(cb => cb !== callback));
    };
  }

  async emit(eventName, payload) {
    this.emittedEvents.push({ eventName, payload, timestamp: Date.now() });
    const listeners = this.eventListeners.get(eventName) || [];
    for (const callback of listeners) {
      await callback({ event: eventName, payload });
    }
  }

  getEmittedEvents(eventName = null) {
    if (!eventName) return this.emittedEvents;
    return this.emittedEvents.filter(e => e.eventName === eventName);
  }

  clearEvents() {
    this.emittedEvents = [];
  }
}

// --- 10. Application State Simulator ---
export class AppStateSimulator {
  constructor(ipc = new MockIPC()) {
    this.ipc = ipc;
    this.reset();
  }

  reset() {
    this.state = {
      isElevated: true,
      dryRunMode: false,
      activeTab: 'dashboard',
      optimizations: [
        { id: 'telemetry_diagtrack', category: 'telemetry', title: 'Disable DiagTrack & Telemetry Service', isSelected: true },
        { id: 'win11_disable_copilot', category: 'win11_24h2', title: 'Disable Windows Copilot', isSelected: true },
        { id: 'win11_disable_recall_ai', category: 'win11_24h2', title: 'Disable Windows Recall AI Snapshot', isSelected: true },
        { id: 'win11_disable_start_recommendations', category: 'win11_24h2', title: 'Disable Start Menu Recommendations', isSelected: true }
      ],
      systemInfo: {
        osName: 'Windows 11 Pro',
        osVersion: '24H2',
        osBuild: '26100.1150',
        isElevated: true,
        cpuUsagePercent: 12,
        memoryUsedMb: 6144,
        memoryTotalMb: 16384,
        telemetryStatus: 'Active'
      },
      gaming: {
        latencyMetrics: null,
        isGameBoostActive: false,
        boostedPid: null,
        targetTimerResolution: 5000
      },
      memory: {
        breakdown: null,
        autoTrimmerEnabled: false,
        thresholdPercent: 80
      },
      network: {
        connections: [],
        blockedRules: []
      },
      hardware: {
        storageDevices: [],
        batteryAnalytics: null,
        activePowerScheme: '381b4222-f694-41f0-9685-ff5bb260df2e'
      },
      storageAnalyzer: {
        drives: [],
        selectedDrive: 'C:\\',
        scanResult: null,
        isScanning: false,
        selectedNode: null,
        expandedNodes: new Set(),
        searchFilter: '',
        extensionFilter: '',
        minSizeFilter: 0,
        deletionModal: {
          isOpen: false,
          targetItem: null,
          deletionMode: 'recycle_bin'
        }
      },
      terminalLogs: [],
      currentLanguage: 'en'
    };

    this.locales = {
      en: this.loadLocaleFile('en.json'),
      ru: this.loadLocaleFile('ru.json')
    };
  }

  loadLocaleFile(filename) {
    const rootDir = process.cwd();
    const filePath = path.join(rootDir, 'src', 'i18n', 'locales', filename);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    return {};
  }

  translate(key, defaultVal = '') {
    const localeObj = this.locales[this.state.currentLanguage] || {};
    const parts = key.split('.');
    let curr = localeObj;
    for (const p of parts) {
      if (curr && typeof curr === 'object' && p in curr) {
        curr = curr[p];
      } else {
        return defaultVal || key;
      }
    }
    return typeof curr === 'string' ? curr : (defaultVal || key);
  }

  async executeScript(content, type = 'ps1') {
    if (!content || typeof content !== 'string') {
      throw new Error('Invalid script input: Content must be a non-empty string');
    }
    const payload = { script_content: content, script_type: type, dry_run: this.state.dryRunMode };
    this.state.terminalLogs.push(`[EXEC] Running ${type} script (dryRun: ${this.state.dryRunMode})...`);
    
    const unlisten = this.ipc.listen('script-output-line', (evt) => {
      this.state.terminalLogs.push(`[${evt.payload.stream.toUpperCase()}] ${evt.payload.line}`);
    });

    try {
      const res = await this.ipc.invoke('execute_custom_script', payload);
      this.state.terminalLogs.push(`[EXIT] Process finished with exit code ${res.exit_code}`);
      return res;
    } finally {
      unlisten();
    }
  }

  exportLogsToString() {
    return this.state.terminalLogs.join('\n');
  }

  exportLogsToFile(destPath) {
    const content = this.exportLogsToString();
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(destPath, content, 'utf8');
    return destPath;
  }
}

// --- 11. Test Suite Execution Engine ---
export class TestRunner {
  constructor(suiteName) {
    this.suiteName = suiteName;
    this.tests = [];
    this.passedCount = 0;
    this.failedCount = 0;
    this.failures = [];
  }

  addTest(name, fn) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log(`\n==================================================`);
    console.log(` Running Suite: ${this.suiteName}`);
    console.log(`==================================================`);

    const startTime = Date.now();
    for (const test of this.tests) {
      const testStart = Date.now();
      try {
        await test.fn();
        const duration = Date.now() - testStart;
        console.log(`  ✓ PASS: ${test.name} (${duration}ms)`);
        this.passedCount++;
      } catch (err) {
        const duration = Date.now() - testStart;
        console.log(`  ✗ FAIL: ${test.name} (${duration}ms)`);
        console.log(`    Error: ${err.message}`);
        if (err.stack) {
          const firstStackLine = err.stack.split('\n')[1] || '';
          console.log(`    Stack: ${firstStackLine.trim()}`);
        }
        this.failedCount++;
        this.failures.push({ name: test.name, error: err });
      }
    }

    const totalDuration = Date.now() - startTime;
    console.log(`--------------------------------------------------`);
    console.log(` Suite Summary [${this.suiteName}]:`);
    console.log(` Total: ${this.tests.length} | Passed: ${this.passedCount} | Failed: ${this.failedCount} | Duration: ${totalDuration}ms`);
    console.log(`==================================================\n`);

    return {
      suiteName: this.suiteName,
      total: this.tests.length,
      passed: this.passedCount,
      failed: this.failedCount,
      failures: this.failures
    };
  }
}
