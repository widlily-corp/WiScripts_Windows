# Milestone 4: Settings Tab & Preferences Persistence Handoff Report

**Author:** Explorer M4-2 (Settings Tab & Preferences Persistence Explorer)  
**Target Path:** `c:\Users\Widlily\Documents\projects\WiScripts_Windows\.agents\explorer_m4_2\handoff.md`  
**Timestamp:** 2026-07-27T11:31:25+05:00  

---

## 1. Observation

Direct observations from codebase inspection across core files:

1. **Tailwind & CSS Configuration**:
   - `tailwind.config.js` (line 3): `darkMode: 'class'` is configured.
   - `tailwind.config.js` (lines 7-40): Colors currently use hardcoded dark hex codes (`background: '#08090A'`, `surface: '#121417'`, `border: '#22252A'`, `text-primary: '#F3F4F6'`).
   - `src/index.css` (lines 5-9): Base layer applies `@apply bg-background text-text-primary;` to `body`.

2. **Zustand Store (`src/store/useAppStore.ts`)**:
   - Lines 43-44: `dryRunMode: boolean` and `setDryRunMode: (enabled: boolean) => void`.
   - Lines 137-138: `pollingIntervalMs: number` (default `2000`) and `setPollingIntervalMs: (interval: number) => void`.
   - Line 136: `isPollingActive: boolean` (default `true`).
   - Lines 56-59: `autoCheckUpdates: boolean` and `setAutoCheckUpdates`.
   - Lines 1266-1277: `persist` middleware configured with name `'wiscripts-app-store'`, but `partialize` currently only persists `dryRunMode`, `autoCheckUpdates`, `odtConfig`, `selectedMasMethod`, `driverBackupPath`, and `selectedDnsProvider`. `pollingIntervalMs` and theme preferences are missing from persistence.

3. **Current Settings View (`src/components/SettingsView.tsx`)**:
   - Currently contains 4 cards: Execution Safety Mode (Dry-Run), Software Auto-Updater, Runtime Environment, and Design System specifications (static text only).
   - Missing interactive Theme controls (Dark / Light / System), Auto Restore Point toggle, Polling Interval selector, Language switch, and Preference Export/Import/Reset capabilities.

4. **Metrics Poller (`src/hooks/useMetricsPoller.ts`)**:
   - Lines 5-6 & 19-21: Subscribes to `isPollingActive` and `pollingIntervalMs` from `useAppStore` and updates interval dynamically.

5. **Type Definitions (`src/types/index.ts`)**:
   - Lacks dedicated `ThemeMode` (`'dark' | 'light' | 'system'`) and `AppPreferences` interface.

---

## 2. Logic Chain

1. **Theme Mode Architecture (Dark / Light / System)**:
   - *Observation*: `tailwind.config.js` uses `darkMode: 'class'`. Currently, elements use Tailwind utility classes like `bg-background` and `bg-surface`.
   - *Deduction*: If `tailwind.config.js` maps `background`, `surface`, `border`, `text` colors to CSS variables (`var(--color-background)`, `var(--color-surface)`), and `src/index.css` defines these variables under `:root` (light) and `.dark` (dark), toggling `.dark` class on `document.documentElement` will instantly re-theme every single component in the entire application without needing `dark:` prefixes added to hundreds of JSX elements.
   - *System Theme handling*: When `themeMode === 'system'`, a React `useEffect` registers a listener on `window.matchMedia('(prefers-color-scheme: dark)')`. When the host system changes themes, the app automatically toggles the `.dark` class.

2. **Default Execution Parameters & Store Expansion**:
   - *Observation*: High-impact operations (e.g. system debloating, profile application) carry system modification risks.
   - *Deduction*: Adding `autoCreateRestorePoint: boolean` (default `true`) alongside existing `dryRunMode` (default `false` or user-configured) allows users to configure global safety defaults.
   - *Polling Interval*: `pollingIntervalMs` (default `2000`) controls background system metrics polling frequency (1s, 2s, 5s, 10s, or disabled). Adding `pollingIntervalMs` to Zustand `partialize` ensures user polling preferences persist across app restarts.

3. **State Persistence Strategy**:
   - *Evaluation*:
     - **Option A (Zustand `persist` with `localStorage`)**: Synchronous hydration on webview launch, zero IPC latency, zero rust dependencies. Supported natively in Tauri webview.
     - **Option B (Tauri Rust JSON file)**: Asynchronous load on boot, potential delay during app initialization.
   - *Decision*: Adopt Zustand `persist` with `localStorage` (key `'wiscripts-app-store'`) as primary persistence engine for instant hydration. Complement this with JSON Export/Import buttons in `SettingsView.tsx` so users can backup or share app configurations across machines.

4. **UI Layout for `SettingsView.tsx` (Refined Minimal Aesthetic)**:
   - Standardize into 4 clean cards following Linear/Stripe styling (`#08090A` dark background, `#121417` surface, `1px solid #22252A` border, `6px` radius, `Geist Mono` typography for tags):
     - **Section 1: Appearance (Тема и внешний вид)**: Segmented selector for `Dark`, `Light`, `System` + Design System Palette Preview.
     - **Section 2: Execution Defaults (Параметры выполнения)**: Dry-Run Mode toggle + Auto Restore Point creation toggle + Language selector.
     - **Section 3: System Monitoring (Мониторинг системы)**: Metrics Polling Interval dropdown (1s, 2s, 5s, 10s, Disabled) + Background Polling toggle.
     - **Section 4: Application Information & Preferences (Сведения и управление)**: Auto-Updater controls + Runtime environment info + Open Source credits + Export / Import / Reset Preferences buttons.

---

## 3. Caveats

1. **System Theme Event Listener**: On Linux or custom Windows desktop environments where WebKit/WebView2 system media query events might lag, falling back to initial `matchMedia.matches` check guarantees stable theme detection.
2. **Local Storage Clearing**: If webview storage is cleared, stored preferences revert to factory defaults (`themeMode: 'system'`, `dryRunMode: false`, `autoCreateRestorePoint: true`, `pollingIntervalMs: 2000`). Factory defaults are inherently safe.
3. **i18n Coordination**: Language switching field in `SettingsView.tsx` relies on `i18next` integration being planned by Explorer M4-1.

---

## 4. Conclusion & Proposed Diffs

### A. Diffs & Code Modifications

#### 1. `src/types/index.ts`
```typescript
export type ThemeMode = 'dark' | 'light' | 'system';

export interface AppPreferences {
  themeMode: ThemeMode;
  dryRunMode: boolean;
  autoCreateRestorePoint: boolean;
  pollingIntervalMs: number;
  autoCheckUpdates: boolean;
  language: 'ru' | 'en';
}
```

#### 2. `src/index.css`
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --color-background: #F9FAFB;
    --color-surface: #FFFFFF;
    --color-surface-hover: #F3F4F6;
    --color-surface-active: #E5E7EB;
    --color-surface-subtle: #F3F4F6;
    --color-border: #E5E7EB;
    --color-border-subtle: #F3F4F6;
    --color-text-primary: #111827;
    --color-text-secondary: #4B5563;
    --color-text-muted: #9CA3AF;
  }

  .dark {
    --color-background: #08090A;
    --color-surface: #121417;
    --color-surface-hover: #181A1F;
    --color-surface-active: #1F2228;
    --color-surface-subtle: #0E1013;
    --color-border: #22252A;
    --color-border-subtle: #1A1C20;
    --color-text-primary: #F3F4F6;
    --color-text-secondary: #9CA3AF;
    --color-text-muted: #6B7280;
  }

  body {
    @apply bg-background text-text-primary transition-colors duration-150;
  }
}
```

#### 3. `tailwind.config.js`
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--color-background)',
        surface: {
          DEFAULT: 'var(--color-surface)',
          hover: 'var(--color-surface-hover)',
          active: 'var(--color-surface-active)',
          subtle: 'var(--color-surface-subtle)',
        },
        border: {
          DEFAULT: 'var(--color-border)',
          subtle: 'var(--color-border-subtle)',
          focus: '#3B82F6',
        },
        text: {
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          muted: 'var(--color-text-muted)',
          code: 'var(--color-text-primary)',
        },
        brand: {
          DEFAULT: '#3B82F6',
          hover: '#2563EB',
          subtle: 'rgba(59, 130, 246, 0.1)',
        },
        status: {
          success: '#10B981',
          successSubtle: 'rgba(16, 185, 129, 0.1)',
          warning: '#F59E0B',
          warningSubtle: 'rgba(245, 158, 11, 0.1)',
          danger: '#EF4444',
          dangerSubtle: 'rgba(239, 68, 68, 0.1)',
          info: '#06B6D4',
        },
      },
      borderRadius: {
        DEFAULT: '6px',
        sm: '4px',
        md: '6px',
        lg: '8px',
      },
      fontFamily: {
        sans: ['Inter', 'Geist Sans', '-apple-system', 'sans-serif'],
        mono: ['"Geist Mono"', '"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
```

#### 4. `src/store/useAppStore.ts` Updates
```typescript
// Add to AppState interface:
themeMode: ThemeMode;
setThemeMode: (mode: ThemeMode) => void;
autoCreateRestorePoint: boolean;
setAutoCreateRestorePoint: (enabled: boolean) => void;
exportPreferencesJson: () => string;
importPreferencesJson: (jsonStr: string) => boolean;
resetPreferencesToDefault: () => void;

// Add implementation in create store:
themeMode: 'system',
setThemeMode: (mode) => set({ themeMode: mode }),

autoCreateRestorePoint: true,
setAutoCreateRestorePoint: (enabled) => set({ autoCreateRestorePoint: enabled }),

exportPreferencesJson: () => {
  const state = get();
  const prefs: AppPreferences = {
    themeMode: state.themeMode,
    dryRunMode: state.dryRunMode,
    autoCreateRestorePoint: state.autoCreateRestorePoint,
    pollingIntervalMs: state.pollingIntervalMs,
    autoCheckUpdates: state.autoCheckUpdates,
    language: 'ru',
  };
  return JSON.stringify(prefs, null, 2);
},

importPreferencesJson: (jsonStr: string) => {
  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed.themeMode) set({ themeMode: parsed.themeMode });
    if (typeof parsed.dryRunMode === 'boolean') set({ dryRunMode: parsed.dryRunMode });
    if (typeof parsed.autoCreateRestorePoint === 'boolean') set({ autoCreateRestorePoint: parsed.autoCreateRestorePoint });
    if (typeof parsed.pollingIntervalMs === 'number') set({ pollingIntervalMs: parsed.pollingIntervalMs });
    if (typeof parsed.autoCheckUpdates === 'boolean') set({ autoCheckUpdates: parsed.autoCheckUpdates });
    return true;
  } catch (e) {
    return false;
  }
},

resetPreferencesToDefault: () => {
  set({
    themeMode: 'system',
    dryRunMode: false,
    autoCreateRestorePoint: true,
    pollingIntervalMs: 2000,
    autoCheckUpdates: true,
  });
},

// Update partialize in persist middleware:
partialize: (state) => ({
  themeMode: state.themeMode,
  dryRunMode: state.dryRunMode,
  autoCreateRestorePoint: state.autoCreateRestorePoint,
  pollingIntervalMs: state.pollingIntervalMs,
  autoCheckUpdates: state.autoCheckUpdates,
  odtConfig: state.odtConfig,
  selectedMasMethod: state.selectedMasMethod,
  driverBackupPath: state.driverBackupPath,
  selectedDnsProvider: state.selectedDnsProvider,
}),
```

#### 5. `src/App.tsx` Theme Handler
```typescript
const themeMode = useAppStore((s) => s.themeMode);

useEffect(() => {
  const root = document.documentElement;

  const applyTheme = () => {
    const isDarkSystem = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (themeMode === 'dark' || (themeMode === 'system' && isDarkSystem)) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  };

  applyTheme();

  if (themeMode === 'system') {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => applyTheme();
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }
}, [themeMode]);
```

---

## 5. Verification Method

1. **TypeScript Typecheck**:
   ```bash
   npx tsc --noEmit
   ```
   *Pass Condition*: Zero errors returned.

2. **Build Verification**:
   ```bash
   npm run build
   ```
   *Pass Condition*: Production bundle builds cleanly into `dist/`.

3. **Theme & Persistence Functional Test**:
   - Inspect `document.documentElement` class list when toggling ThemeMode (Dark adds `.dark`, Light removes `.dark`, System respects OS preference).
   - Change `pollingIntervalMs`, `dryRunMode`, `autoCreateRestorePoint`, and `themeMode` in `SettingsView`. Reload page; verify preferences hydrate seamlessly from `localStorage` (`wiscripts-app-store`).
