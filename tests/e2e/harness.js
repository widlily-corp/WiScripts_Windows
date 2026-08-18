/**
 * WiScripts Windows v1.0 Production Release — Comprehensive E2E Test Harness
 * Authoritative test utilities, assertion engine, crypto validation,
 * SCM / Registry / Storage / Profile simulators, and Mock IPC infrastructure.
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

// --- 3. 2-Stage Storage Hashing Engine (Matching Rust src-tauri/src/storage/mod.rs) ---
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
      ['SCardSvr', { startType: 3, status: 'STOPPED' }]
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
    // 21 Navigation Tabs
    const tabs = [
      { id: 'dashboard', title: 'Dashboard', category: 'Navigation', keywords: ['system', 'metrics', 'overview', 'telemetry'] },
      { id: 'script_runner', title: 'Script Runner & Library', category: 'Navigation', keywords: ['scripts', 'powershell', 'online library', 'code'] },
      { id: 'audio_manager', title: 'Audio Manager', category: 'Navigation', keywords: ['sound', 'volume', 'mixer', 'endpoints'] },
      { id: 'governor', title: 'Resource Governor & ProFlow', category: 'Navigation', keywords: ['cpu', 'affinity', 'priority', 'ram trim'] },
      { id: 'optimization', title: 'Optimization & Tweaks', category: 'Navigation', keywords: ['debloat', 'telemetry', 'privacy', 'tweaks'] },
      { id: 'package_manager', title: 'Package Manager', category: 'Navigation', keywords: ['winget', 'software', 'install', 'update'] },
      { id: 'app_uninstaller', title: 'App Uninstaller & Debloat', category: 'Navigation', keywords: ['uninstall', 'uwp', 'clean apps'] },
      { id: 'presets', title: '1-Click Presets & Profiles', category: 'Navigation', keywords: ['profiles', 'gaming', 'privacy', 'wiscripts'] },
      { id: 'system_cleaner', title: 'System & Disk Cleaner', category: 'Navigation', keywords: ['temp', 'junk', 'cache', 'clean'] },
      { id: 'storage_utilities', title: 'Storage Utilities', category: 'Navigation', keywords: ['duplicates', 'large files', '2-stage hash'] },
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

// --- 8. Mock IPC Simulator for v1.0 Production Architecture ---
export class MockIPC {
  constructor() {
    this.handlers = new Map();
    this.eventListeners = new Map();
    this.emittedEvents = [];
    this.scm = new Win32ScmSimulator();
    this.setupDefaultHandlers();
  }

  setupDefaultHandlers() {
    this.registerHandler('get_system_info', async () => ({
      osName: 'Windows 11 Pro',
      osVersion: '24H2',
      osBuild: '26100.1150',
      isElevated: true,
      cpuUsagePercent: 12,
      memoryUsedMb: 6144,
      memoryTotalMb: 16384,
      telemetryStatus: 'Active'
    }));

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
      rulesCaptured: rule_ids.length
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

// --- 9. Application State Simulator ---
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

// --- 10. Test Suite Execution Engine ---
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
