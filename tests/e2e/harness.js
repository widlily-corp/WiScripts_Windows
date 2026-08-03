/**
 * WiScripts_Windows v0.9.9 E2E Test Harness
 * Opaque-box E2E test framework supporting IPC simulation, store state tracking,
 * UI dynamics verification, and security validation.
 */

import fs from 'fs';
import path from 'path';

// --- Assertion Engine ---
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

// --- Mock Tauri IPC Simulator ---
export class MockIPC {
  constructor() {
    this.handlers = new Map();
    this.eventListeners = new Map();
    this.emittedEvents = [];
    this.setupDefaultHandlers();
  }

  setupDefaultHandlers() {
    // Default handlers based on PROJECT.md interface contracts
    this.registerHandler('get_system_info', async () => ({
      osName: 'Windows 11 Pro',
      osVersion: '23H2',
      osBuild: '22631.3880',
      isElevated: true,
      cpuUsagePercent: 12,
      memoryUsedMb: 6144,
      memoryTotalMb: 16384,
      telemetryStatus: 'Active'
    }));

    this.registerHandler('get_temperatures', async () => ({
      cpu_temp_celsius: 45.2,
      gpu_temp_celsius: 52.0,
      is_cpu_temp_available: true,
      is_gpu_temp_available: true,
      sensor_source: 'LibreHardwareMonitor WMI',
      sensor_items: [
        {
          id: 'lhm_cpu_package',
          name: 'AMD Ryzen 7 7800X3D Package',
          label: 'CPU Package',
          temperature_celsius: 45.2,
          sensor_type: 'cpu',
          provider: 'LibreHardwareMonitor WMI'
        },
        {
          id: 'nvml_gpu_core',
          name: 'NVIDIA GeForce RTX 4080',
          label: 'GPU Core',
          temperature_celsius: 52.0,
          sensor_type: 'gpu',
          provider: 'NVIDIA NVML'
        }
      ],
      selected_cpu_sensor_id: null,
      selected_gpu_sensor_id: null
    }));

    this.registerHandler('execute_custom_script', async (payload) => {
      const { script_content, script_type, dry_run } = payload;
      if (!script_content || script_content.trim() === '') {
        throw new Error('Script content cannot be empty');
      }
      if (['.exe', '.sh', '.vbs', '.py'].some(ext => script_content.includes(ext))) {
        // If content is an invalid extension payload trigger
      }

      // Simulate streaming output lines
      const lines = script_content.split('\n');
      for (const line of lines) {
        await this.emit('script-output-line', { line: line.trim(), stream: 'stdout' });
      }

      return {
        exit_code: 0,
        stdout: script_content,
        stderr: ''
      };
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

// --- Application State Simulator ---
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
        { id: 'opt_telemetry', category: 'telemetry', title: 'Disable Telemetry', description: 'Stops DiagTrack service', isSelected: true },
        { id: 'opt_bloatware', category: 'bloatware', title: 'Remove Preinstalled Bloatware', description: 'Cleans consumer apps', isSelected: true },
        { id: 'opt_services', category: 'services', title: 'Optimize Windows Services', description: 'Disables unneeded services', isSelected: false }
      ],
      systemInfo: {
        osName: 'Windows 11 Pro',
        osVersion: '23H2',
        osBuild: '22631.3880',
        isElevated: true,
        cpuUsagePercent: 15.4,
        memoryUsedMb: 8192,
        memoryTotalMb: 16384,
        telemetryStatus: 'Active'
      },
      currentMetrics: {
        cpuUsagePercent: 15.4,
        memoryUsedMb: 8192,
        memoryTotalMb: 16384,
        diskReadBytesPerSec: 1048576,
        networkRxBytesPerSec: 51200,
        cpuTempC: 45.2,
        gpuTempC: 52.0,
        cpuThermalStatus: 'normal',
        gpuThermalStatus: 'normal'
      },
      isPollingActive: true,
      pollingIntervalMs: 2000,
      terminalLogs: [],
      selectedCpuSensorId: null,
      selectedGpuSensorId: null,
      sensorPayload: null,
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

  getUnappliedCount() {
    return this.state.optimizations.filter(o => o.isSelected).length;
  }

  getDashboardBannerState() {
    const count = this.getUnappliedCount();
    if (count === 0) {
      return {
        type: 'celebration',
        title: this.translate('dashboard.celebratoryBannerTitle', 'System Fully Optimized!'),
        colorClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
      };
    }
    return {
      type: 'queue',
      title: this.translate('dashboard.systemOptimizationReadiness', 'System Optimization Readiness'),
      count,
      colorClass: 'bg-surface-subtle border-border'
    };
  }

  getTelemetryBadgeStyle(status) {
    switch (status?.toLowerCase()) {
      case 'disabled':
      case 'normal':
      case 'optimal':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'active':
      case 'warm':
      case 'elevated':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'minimized':
        return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
      case 'blocked':
      case 'hot':
      case 'critical':
        return 'bg-red-500/10 text-red-400 border-red-500/30';
      default:
        return 'bg-surface-subtle text-text-muted border-border-subtle';
    }
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
    
    // Register listener for output streaming
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

// --- Test Suite Execution Engine ---
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
