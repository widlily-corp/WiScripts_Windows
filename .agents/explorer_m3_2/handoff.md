# Milestone 3 (System Monitoring & Management: Real-time UI & Graphs) - Handoff Report

## 1. Observation

### Codebase Direct Observations

1. **Current System Info Type Definitions (`src/types/index.ts`, lines 1–10)**:
   ```typescript
   export interface SystemInfo {
     osName: string;
     osVersion: string;
     osBuild: string;
     isElevated: boolean;
     cpuUsagePercent: number;
     memoryUsedMb: number;
     memoryTotalMb: number;
     telemetryStatus: 'Active' | 'Minimized' | 'Disabled' | 'Unknown';
   }
   ```
   *Observation*: `SystemInfo` currently lacks detailed disk I/O metrics, network throughput metrics (Rx/Tx), hardware temperature sensors (CPU/GPU), and history buffers needed for real-time graphs.

2. **Current State Management (`src/store/useAppStore.ts`, lines 549–571)**:
   *Observation*: System information is stored as a single `systemInfo: SystemInfo | null` object without historical samples or configurable polling interval state.
   ```typescript
   systemInfo: {
     osName: 'Windows 11 Pro',
     osVersion: '23H2',
     osBuild: '22631.3880',
     isElevated: true,
     cpuUsagePercent: 12,
     memoryUsedMb: 6144,
     memoryTotalMb: 16384,
     telemetryStatus: 'Active',
   },
   ```

3. **Current Dashboard Layout (`src/components/Dashboard.tsx`, lines 55–132)**:
   *Observation*: The Dashboard renders static metric cards using basic Tailwind progress bars (`<div className="w-full bg-surface-active h-1.5 rounded-full overflow-hidden">`) for CPU and Memory, but lacks time-series area/sparkline load graphs or sensor widgets.

4. **Installed Dependencies (`package.json`, lines 12–21)**:
   *Observation*: Dependencies include `react` (^18.3.1), `zustand` (^4.5.5), `lucide-react` (latest), and `tailwindcss` (^3.4.14). External chart libraries (such as `recharts` or `chart.js`) are **not** present in `package.json`.

5. **Tailwind Color Design System (`tailwind.config.js`, lines 7–40)**:
   *Observation*: The design system defines Refined Minimal colors:
   - `background`: `#08090A`
   - `surface`: `#121417` (subtle: `#0E1013`, hover: `#181A1F`, active: `#1F2228`)
   - `border`: `#22252A` (subtle: `#1A1C20`, focus: `#3B82F6`)
   - `brand`: `#3B82F6` (subtle: `rgba(59, 130, 246, 0.1)`)
   - `status`: `success` (`#10B981`), `warning` (`#F59E0B`), `danger` (`#EF4444`), `info` (`#06B6D4`)
   - Monospaced fonts: `font-mono` (`Geist Mono`, `JetBrains Mono`, `ui-monospace`).

6. **Rust Tauri Backend System Info (`src-tauri/src/commands/mod.rs`, lines 16–25, 90–131)**:
   *Observation*: Tauri IPC command `get_system_info` returns `SystemInfo` struct using `sysinfo::System`.

---

## 2. Logic Chain

1. **Graph Implementation Choice: Custom Lightweight SVG Sparklines vs Recharts**:
   - *Observation*: `recharts` adds ~500KB bundle size, introduces external dependencies (`d3-scale`, `react-resize-detector`), and requires complex wrappers for custom dark themes.
   - *Observation*: SVG `<path d="M... L... Z">` with vector scaling (`viewBox="0 0 100 40"`) renders high-performance, responsive area graphs with 0 external npm dependencies and exact control over hairline strokes (`strokeWidth="1.5"`), gradient opacity, hover tooltips, and GPU-accelerated rendering.
   - *Deduction*: A custom reusable `SparklineAreaGraph.tsx` component is the optimal engineering choice for WiScripts, perfectly aligning with the "Refined Minimal" aesthetic and zero-slop principle.

2. **Data Structure & Buffer Strategy**:
   - *Observation*: Smooth line graphs require time-series data over a fixed window (e.g. 30–60 samples).
   - *Deduction*: Zustand store should maintain `metricsHistory: MetricSnapshot[]` capped at a configurable maximum length (e.g. 30 data points). When a new snapshot arrives, it is appended to `metricsHistory` via `.slice(-MAX_SAMPLES)`.

3. **Temperature Threshold & Color Indicator Strategy**:
   - *Observation*: Hardware sensors report temperature values in Celsius (°C).
   - *Deduction*: Temperatures map to three status tiers:
     - Normal (`< 65°C`): `#10B981` (Emerald) - Badge text: `Optimal`
     - Warm (`65°C - 80°C`): `#F59E0B` (Amber) - Badge text: `Elevated`
     - Hot (`> 80°C`): `#EF4444` (Red) - Badge text: `Critical`

4. **Polling Architecture**:
   - *Observation*: Real-time updates need configurable polling intervals (1s, 2s, 5s, 10s) and automatic cleanup on component unmount or when polling is paused.
   - *Deduction*: Implement a dedicated `useMetricsPoller()` hook that interacts with Zustand store and manages timer intervals cleanly.

---

## 3. Caveats

1. **Hardware Temperature Sensor Availability on Windows**:
   - On virtual machines or systems lacking WMI / OpenHardwareMonitor / NVML access, GPU or CPU temperature calls from Rust backend may return `null` or simulated fallback values. The UI must gracefully handle `null` temperatures by displaying `-- °C` with an "Unavailable" badge.
2. **Dev Mode Simulation**:
   - When running in browser dev mode without Tauri IPC runtime, the poller must automatically generate realistic simulated metric fluctuations so graph rendering and status indicators can be thoroughly tested.

---

## 4. Conclusion & Proposed Implementation Strategy

We recommend a 4-part architecture for Milestone 3 UI:

### Part A: TypeScript Definitions (`src/types/index.ts`)

```typescript
// --- Milestone 3 Real-time Metrics & Hardware Sensors ---

export interface NetworkMetrics {
  rxBytesPerSec: number;
  txBytesPerSec: number;
  humanRx: string; // e.g. "1.4 MB/s"
  humanTx: string; // e.g. "250 KB/s"
}

export interface DiskMetrics {
  readBytesPerSec: number;
  writeBytesPerSec: number;
  activeTimePercent: number; // 0 - 100%
  usedGb: number;
  totalGb: number;
}

export type ThermalStatus = 'normal' | 'warm' | 'hot' | 'unknown';

export interface TemperatureMetrics {
  cpuTempC: number | null;
  gpuTempC: number | null;
  cpuThermalStatus: ThermalStatus;
  gpuThermalStatus: ThermalStatus;
}

export interface MetricSnapshot {
  timestamp: number; // Unix timestamp ms
  cpuUsagePercent: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  memoryUsagePercent: number;
  diskMetrics: DiskMetrics;
  networkMetrics: NetworkMetrics;
  temperatures: TemperatureMetrics;
}

export type PollingIntervalMs = 1000 | 2000 | 5000 | 10000;
```

### Part B: Zustand Store Extension (`src/store/useAppStore.ts`)

Add the following state slice and actions to `AppState`:

```typescript
// Metrics State Slice
metricsHistory: MetricSnapshot[];
currentMetrics: MetricSnapshot | null;
isPollingActive: boolean;
pollingIntervalMs: PollingIntervalMs;

setPollingIntervalMs: (interval: PollingIntervalMs) => void;
togglePollingActive: () => void;
pushMetricSnapshot: (snapshot: MetricSnapshot) => void;
fetchLatestMetrics: () => Promise<MetricSnapshot>;
```

### Part C: Component Hierarchy

```
src/components/
├── Dashboard.tsx                      # Main container with 4-card metric grid
├── dashboard/
│   ├── MetricsHeaderControls.tsx      # Polling pause/play toggle, interval selector, refresh
│   ├── MetricsGrid.tsx                # Grid container for real-time charts & sensors
│   ├── MetricGraphCard.tsx            # Reusable card container for CPU, RAM, Disk, Network
│   ├── SparklineAreaGraph.tsx         # Custom smooth SVG path generator with hairline grid
│   └── TemperatureSensorWidget.tsx    # CPU & GPU sensor cards with status badges (°C)
```

#### 1. Custom SVG Graph Component (`SparklineAreaGraph.tsx`)
```tsx
import React from 'react';

interface SparklineAreaGraphProps {
  data: number[]; // Array of values 0-100
  colorHex?: string; // Accent color hex
  gradientId: string;
  height?: number;
}

export function SparklineAreaGraph({
  data,
  colorHex = '#3B82F6',
  gradientId,
  height = 60,
}: SparklineAreaGraphProps) {
  if (!data || data.length < 2) {
    return <div style={{ height }} className="w-full bg-surface-subtle animate-pulse rounded-[4px]" />;
  }

  const maxVal = 100;
  const minVal = 0;
  const width = 300;
  const stepX = width / (data.length - 1);

  // Generate SVG path coordinates
  const points = data.map((val, idx) => {
    const x = idx * stepX;
    const normalized = Math.max(0, Math.min(100, val));
    const y = height - (normalized / (maxVal - minVal)) * (height - 8) - 4;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const linePath = `M ${points.join(' L ')}`;
  const areaPath = `${linePath} L ${width},${height} L 0,${height} Z`;

  return (
    <div className="relative w-full overflow-hidden select-none" style={{ height }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="w-full h-full overflow-visible"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colorHex} stopOpacity="0.25" />
            <stop offset="100%" stopColor={colorHex} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Subtle Horizontal Reference Hairlines */}
        <line x1="0" y1={height * 0.25} x2={width} y2={height * 0.25} stroke="#22252A" strokeDasharray="2,2" strokeWidth="1" />
        <line x1="0" y1={height * 0.5} x2={width} y2={height * 0.5} stroke="#22252A" strokeDasharray="2,2" strokeWidth="1" />
        <line x1="0" y1={height * 0.75} x2={width} y2={height * 0.75} stroke="#22252A" strokeDasharray="2,2" strokeWidth="1" />

        {/* Area Gradient Fill */}
        <path d={areaPath} fill={`url(#${gradientId})`} />

        {/* Crisp Stroke Line */}
        <path d={linePath} fill="none" stroke={colorHex} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Current Endpoint Pulse Dot */}
        {points.length > 0 && (
          <circle
            cx={points[points.length - 1].split(',')[0]}
            cy={points[points.length - 1].split(',')[1]}
            r="3"
            fill={colorHex}
            className="animate-ping-subtle"
          />
        )}
      </svg>
    </div>
  );
}
```

#### 2. Temperature Sensor Widget Component (`TemperatureSensorWidget.tsx`)
```tsx
import React from 'react';
import { Thermometer, Cpu, HardDrive } from 'lucide-react';
import { ThermalStatus } from '../types';

interface TemperatureSensorProps {
  title: string;
  tempC: number | null;
  sensorType: 'cpu' | 'gpu';
  thermalStatus: ThermalStatus;
}

export function TemperatureSensorWidget({
  title,
  tempC,
  sensorType,
  thermalStatus,
}: TemperatureSensorProps) {
  const getBadgeStyle = (status: ThermalStatus) => {
    switch (status) {
      case 'normal':
        return 'bg-status-successSubtle text-status-success border-status-success/30';
      case 'warm':
        return 'bg-status-warningSubtle text-status-warning border-status-warning/30';
      case 'hot':
        return 'bg-status-dangerSubtle text-status-danger border-status-danger/30';
      default:
        return 'bg-surface-subtle text-text-muted border-border-subtle';
    }
  };

  const Icon = sensorType === 'cpu' ? Cpu : HardDrive;

  return (
    <div className="rounded-[6px] border border-border bg-surface p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-text-secondary">
          <Icon className="h-4 w-4 text-brand" />
          <span className="text-xs font-medium">{title}</span>
        </div>
        <span
          className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-[4px] border font-semibold ${getBadgeStyle(
            thermalStatus
          )}`}
        >
          {thermalStatus.toUpperCase()}
        </span>
      </div>

      <div className="flex items-baseline justify-between pt-1">
        <div className="flex items-center gap-1.5">
          <Thermometer className="h-4 w-4 text-text-muted" />
          <span className="text-2xl font-bold font-mono tabular-nums text-text-primary">
            {tempC !== null ? `${tempC}°C` : '-- °C'}
          </span>
        </div>
        <span className="text-[11px] font-mono text-text-muted">
          Limit: 95°C
        </span>
      </div>

      {/* Progress Bar Gauge */}
      <div className="w-full bg-surface-subtle h-1.5 rounded-full overflow-hidden border border-border-subtle">
        <div
          className={`h-full transition-all duration-500 ${
            thermalStatus === 'hot'
              ? 'bg-status-danger'
              : thermalStatus === 'warm'
              ? 'bg-status-warning'
              : 'bg-status-success'
          }`}
          style={{ width: `${Math.min(100, ((tempC || 0) / 100) * 100)}%` }}
        />
      </div>
    </div>
  );
}
```

### Part D: Polling Hook (`src/hooks/useMetricsPoller.ts`)

```typescript
import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';

export function useMetricsPoller() {
  const isPollingActive = useAppStore((s) => s.isPollingActive);
  const pollingIntervalMs = useAppStore((s) => s.pollingIntervalMs);
  const fetchLatestMetrics = useAppStore((s) => s.fetchLatestMetrics);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isPollingActive) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    // Initial fetch
    fetchLatestMetrics();

    // Set recurring timer
    timerRef.current = setInterval(() => {
      fetchLatestMetrics();
    }, pollingIntervalMs);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPollingActive, pollingIntervalMs, fetchLatestMetrics]);
}
```

---

## 5. Verification Method

### 1. Empirical Verification Script (`src/tests/m3_metrics_empirical.ts`)

To verify the state management and metric calculations independently, run:
```powershell
npx tsx src/tests/m3_metrics_empirical.ts
```

#### Script Checks:
1. **History Ring Buffer Test**: Verifies `metricsHistory` array stays capped at `MAX_SAMPLES` (30) when 50 consecutive snapshots are pushed.
2. **Polling Config Test**: Verifies `setPollingIntervalMs` and `togglePollingActive` update state properly.
3. **Thermal Status Logic Test**: Verifies `getThermalStatus(temp)` returns `'normal'` for 45°C, `'warm'` for 72°C, and `'hot'` for 85°C.
4. **SVG Path Generator Test**: Verifies `generateSvgPath([10, 50, 90], 300, 60)` produces valid `M ... L ...` SVG string without `NaN`.

### 2. Manual Verification Procedure
1. Launch app with `npm run dev` or `npm run tauri dev`.
2. Navigate to Dashboard.
3. Verify 4 real-time graphs (CPU, RAM, Disk I/O, Network Traffic) update smoothly every 2 seconds.
4. Toggle polling interval selector (1s, 2s, 5s) in top controls and observe update rate changes.
5. Verify CPU & GPU temperature cards display color-coded status badges and progress gauge bars matching Refined Minimal styling.
