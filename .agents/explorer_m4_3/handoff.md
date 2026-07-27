# Milestone 4-3 Handoff Report: Preset JSON Import/Export & Profile Management

**Author**: Explorer M4-3  
**Target Module**: Preset JSON Serialization, Custom Profile Storage, Tauri Dialog / Browser File Fallback & Validation Logic  
**Date**: 2026-07-27  

---

## 1. Observation

### Existing Profile Architecture Analysis

1. **Rust Backend (`src-tauri/src/profiles/mod.rs`)**:
   - `OptimizationProfile` struct defined at `src-tauri/src/profiles/mod.rs:6-14`:
     ```rust
     #[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
     #[serde(rename_all = "camelCase")]
     pub struct OptimizationProfile {
         pub id: String,
         pub name: String,
         pub description: String,
         pub icon_name: String,
         pub rule_ids: Vec<String>,
     }
     ```
   - Standard 1-click profiles (`gaming`, `privacy`, `work`) are hardcoded in `get_optimization_profiles()` (`mod.rs:17-63`).
   - Profile execution is handled by `apply_optimization_profile()` (`mod.rs:66-97`), which queries `get_optimization_profiles()`, extracts `rule_ids`, and calls `optimization::execute(app, runner, &profile.rule_ids, false)`.
   - IPC Command handler in `src-tauri/src/commands/mod.rs:438-472` exposes `get_optimization_profiles` and `apply_optimization_profile` to Tauri webview. registered in `src-tauri/src/lib.rs:58-59`.

2. **Frontend Presets View (`src/components/PresetsView.tsx`)**:
   - Displays 3 static profile cards (`Gaming Profile`, `Maximum Privacy`, `Workstation / Productivity`) in a grid layout (`PresetsView.tsx:87-154`).
   - Obtains profiles from Zustand store via `useAppStore((s) => s.optimizationProfiles)`.
   - Lacks UI components or handlers for saving current custom rule selections, exporting selections to `.json` files, or importing external preset `.json` files.

3. **Frontend Store (`src/store/useAppStore.ts`)**:
   - `optimizations: OptimizationItem[]` represents the rule catalog (`useAppStore.ts:186-409`). Each item has `id`, `category`, `isSelected`, etc.
   - Presets currently supported are hardcoded static filter triggers (`applyPreset('recommended' | 'telemetry_only' | 'full_debloat')` at `useAppStore.ts:641-653`).
   - Store does not persist custom user-created profiles or provide preset serialization/deserialization actions.

4. **Dependencies (`package.json` & `Cargo.toml`)**:
   - `package.json`: Contains `@tauri-apps/api`, `@tauri-apps/plugin-updater`, `zustand`, `lucide-react`.
   - `@tauri-apps/plugin-dialog` is not currently included in `package.json` or `Cargo.toml`.
   - Native HTML5 file input (`<input type="file" accept=".json">`) and browser Blob download (`URL.createObjectURL` + `<a download=...>` anchor element) offer zero-dependency webview fallback for JSON export/import. Tauri dialog plugin can be integrated or Rust backend file IPC can be added for native desktop dialog support.

---

## 2. Logic Chain

From the observations above, the logic chain for designing custom profiles and preset JSON import/export is derived as follows:

1. **Schema Design Rationale (`WiScriptsPreset` v1.0)**:
   - To make presets portable and shared across system installations, a standardized JSON format is required.
   - The schema must encapsulate:
     - Versioning (`schemaVersion`) for future migration compatibility.
     - Rich metadata (`name`, `description`, `author`, `createdTimestamp`, `appVersion`, `iconName`, `tags`).
     - OS target constraints (`minBuild`, `supportedEditions`).
     - Script rule identifiers (`ruleIds: string[]`).
     - Custom execution parameters (`createRestorePoint`, `dryRunRecommended`, `categoryOverrides`).
   - Using `camelCase` naming ensures seamless TypeScript serialization and Rust `serde(rename_all = "camelCase")` compatibility.

2. **Export Workflow Rationale**:
   - Users should be able to package their current script selection from `OptimizationView` or save a customized profile.
   - Workflow:
     1. User clicks **"Export Preset"** in UI.
     2. A lightweight metadata prompt/modal allows setting `name`, `description`, `author`, and selecting an icon.
     3. Helper `serializePreset()` constructs a `WiScriptsPreset` JSON string formatted with 2-space indentation.
     4. Dual-mode file saving: If `@tauri-apps/plugin-dialog` or Rust file IPC is available, open native save dialog. Otherwise, invoke browser Blob download.
     5. Toast notification notifies user of successful file save.

3. **Import Workflow Rationale**:
   - Users should be able to load preset `.json` files from disk, validate their structure, and apply them immediately or save them as persistent custom profiles.
   - Workflow:
     1. User clicks **"Import Preset"** in UI.
     2. Open native file dialog or HTML5 file picker for `.json` files.
     3. Read and parse JSON content.
     4. Pass string to validation engine (Rust backend IPC command `validate_preset_json` or frontend validator).
     5. Filter valid `ruleIds` against current `optimizations` catalog.
     6. Partition rules into `validRuleIds` and `unknownRuleIds`.
     7. Update Zustand store:
        - Apply to current selection (`isSelected = true` for target rules).
        - Optional: Save imported preset to `customProfiles` store array (persisted to `localStorage`).
     8. Display summary toast detailing imported rule count and warning if any unknown rule IDs were skipped.

4. **Validation & Testing Strategy Rationale**:
   - Schema validation must fail gracefully for corrupted JSON, invalid schema versions, or empty rule sets.
   - Unit tests following the **Arrange-Act-Assert (AAA)** pattern must verify:
     - Rust: Struct serialization/deserialization, rule ID matching, invalid JSON error handling.
     - TypeScript: Store state updates on preset application, export formatting, import parsing.

---

## 3. Caveats

1. **Tauri Plugin vs Browser Fallback**:
   - Desktop native file dialogs require `@tauri-apps/plugin-dialog` or Rust file IPC commands (`rfd` / Tauri dialog feature).
   - The proposed implementation uses a dual-mode fallback strategy: browser Blob download / HTML5 file reader when native dialog plugin is absent, ensuring 100% functionality across development environments and webview containers.
2. **Catalog Rule ID Evolution**:
   - If a preset imported from an older or newer version contains `ruleIds` not present in the current `optimizations` catalog (e.g. `unknown_rule_x`), those IDs must be logged and reported to the user without crashing the import process.
3. **Elevated Privileges**:
   - Applying presets containing high-risk rules still requires administrator elevation when executing in live mode (as indicated by `AdminElevationBanner`).

---

## 4. Conclusion

### A. JSON Schema Specification (`WiScriptsPreset` v1.0)

#### JSON File Example (`wiscripts-preset-sample.json`)
```json
{
  "$schema": "https://wiscripts.app/schemas/preset.v1.json",
  "schemaVersion": "1.0",
  "metadata": {
    "id": "custom-gaming-slim-v1",
    "name": "Custom Gaming Slim",
    "description": "Aggressive debloat preset tailored for competitive gaming rigs with low RAM overhead.",
    "author": "WiScripts Craftsman",
    "createdTimestamp": "2026-07-27T11:30:00Z",
    "appVersion": "0.3.0",
    "iconName": "Gamepad2",
    "tags": ["gaming", "debloat", "telemetry"]
  },
  "targetOs": {
    "minBuild": "22000",
    "supportedEditions": ["Home", "Pro", "Enterprise"]
  },
  "ruleIds": [
    "services_sysmain",
    "bloatware_xbox_apps",
    "telemetry_diagtrack",
    "telemetry_dmwappush",
    "telemetry_ceip_tasks",
    "disk_clean_temp",
    "ui_classic_context_menu"
  ],
  "customParameters": {
    "createRestorePoint": true,
    "dryRunRecommended": false,
    "categoryOverrides": {
      "telemetry": "enforce_all"
    }
  }
}
```

#### TypeScript Types (`src/types/index.ts`)
```typescript
export interface PresetMetadata {
  id: string;
  name: string;
  description: string;
  author?: string;
  createdTimestamp: string;
  appVersion: string;
  iconName?: string;
  tags?: string[];
}

export interface PresetTargetOs {
  minBuild?: string;
  supportedEditions?: string[];
}

export interface CustomPresetParameters {
  createRestorePoint?: boolean;
  dryRunRecommended?: boolean;
  categoryOverrides?: Record<string, string>;
}

export interface WiScriptsPreset {
  schemaVersion: '1.0' | string;
  metadata: PresetMetadata;
  targetOs?: PresetTargetOs;
  ruleIds: string[];
  customParameters?: CustomPresetParameters;
}

export interface PresetValidationResult {
  isValid: boolean;
  preset: WiScriptsPreset | null;
  validRuleIds: string[];
  unknownRuleIds: string[];
  validationErrors: string[];
}
```

#### Rust Structs (`src-tauri/src/profiles/mod.rs`)
```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PresetMetadata {
    pub id: String,
    pub name: String,
    pub description: String,
    pub author: Option<String>,
    pub created_timestamp: String,
    pub app_version: String,
    pub icon_name: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PresetTargetOs {
    pub min_build: Option<String>,
    pub supported_editions: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CustomPresetParameters {
    pub create_restore_point: Option<bool>,
    pub dry_run_recommended: Option<bool>,
    pub category_overrides: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WiScriptsPreset {
    pub schema_version: String,
    pub metadata: PresetMetadata,
    pub target_os: Option<PresetTargetOs>,
    pub rule_ids: Vec<String>,
    pub custom_parameters: Option<CustomPresetParameters>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PresetValidationResult {
    pub is_valid: bool,
    pub preset: Option<WiScriptsPreset>,
    pub valid_rule_ids: Vec<String>,
    pub unknown_rule_ids: Vec<String>,
    pub validation_errors: Vec<String>,
}
```

---

### B. Rust Backend Validation Engine (`src-tauri/src/profiles/mod.rs`)

```rust
pub fn validate_and_parse_preset(
    json_content: &str,
    rule_catalog_ids: &[String],
) -> Result<PresetValidationResult, AppError> {
    log::info!("[ProfilesEngine] Validating incoming preset JSON content");

    let preset: WiScriptsPreset = match serde_json::from_str(json_content) {
        Ok(parsed) => parsed,
        Err(err) => {
            log::warn!("[ProfilesEngine] Failed to parse preset JSON: {}", err);
            return Ok(PresetValidationResult {
                is_valid: false,
                preset: None,
                valid_rule_ids: vec![],
                unknown_rule_ids: vec![],
                validation_errors: vec![format!("Invalid JSON structure: {}", err)],
            });
        }
    };

    let mut validation_errors = Vec::new();
    if preset.schema_version.is_empty() {
        validation_errors.push("Missing schemaVersion identifier.".to_string());
    }
    if preset.metadata.name.trim().is_empty() {
        validation_errors.push("Preset name metadata cannot be empty.".to_string());
    }
    if preset.rule_ids.is_empty() {
        validation_errors.push("Preset ruleIds list cannot be empty.".to_string());
    }

    if !validation_errors.is_empty() {
        return Ok(PresetValidationResult {
            is_valid: false,
            preset: Some(preset),
            valid_rule_ids: vec![],
            unknown_rule_ids: vec![],
            validation_errors,
        });
    }

    let mut valid_rule_ids = Vec::new();
    let mut unknown_rule_ids = Vec::new();

    for id in &preset.rule_ids {
        if rule_catalog_ids.iter().any(|cat_id| cat_id.eq_ignore_ascii_case(id)) {
            valid_rule_ids.push(id.clone());
        } else {
            unknown_rule_ids.push(id.clone());
        }
    }

    let is_valid = !valid_rule_ids.is_empty();

    log::info!(
        "[ProfilesEngine] Preset validation complete: valid_rules={}, unknown_rules={}, is_valid={}",
        valid_rule_ids.len(),
        unknown_rule_ids.len(),
        is_valid
    );

    Ok(PresetValidationResult {
        is_valid,
        preset: Some(preset),
        valid_rule_ids,
        unknown_rule_ids,
        validation_errors,
    })
}
```

#### Tauri Commands (`src-tauri/src/commands/mod.rs`)
```rust
#[tauri::command]
pub async fn validate_preset_json(
    json_content: String,
) -> Result<profiles::PresetValidationResult, AppError> {
    log::info!("[IPC] validate_preset_json request received");
    let catalog = optimization::get_rule_catalog();
    let catalog_ids: Vec<String> = catalog.into_iter().map(|item| item.id).collect();
    profiles::validate_and_parse_preset(&json_content, &catalog_ids)
}
```

---

### C. Zustand Store Extension (`src/store/useAppStore.ts`)

```typescript
// Add to AppState interface:
customProfiles: OptimizationProfile[];
exportPresetToFile: (metadata: Omit<PresetMetadata, 'id' | 'createdTimestamp' | 'appVersion'>) => void;
importPresetFromJson: (jsonString: string) => Promise<boolean>;
addCustomProfile: (profile: OptimizationProfile) => void;

// Implementation inside createStore:
customProfiles: [],

exportPresetToFile: (meta) => {
  const selectedRuleIds = get()
    .optimizations.filter((item) => item.isSelected)
    .map((item) => item.id);

  if (selectedRuleIds.length === 0) {
    get().addToast({
      type: 'warning',
      title: 'Export Failed',
      message: 'Please select at least one script rule to export a preset.',
    });
    return;
  }

  const preset: WiScriptsPreset = {
    schemaVersion: '1.0',
    metadata: {
      id: `custom-${Date.now()}`,
      name: meta.name || 'Custom Optimization Preset',
      description: meta.description || 'User-exported optimization preset',
      author: meta.author || 'User',
      createdTimestamp: new Date().toISOString(),
      appVersion: get().appVersion || '0.3.0',
      iconName: meta.iconName || 'Sparkles',
      tags: meta.tags || ['custom'],
    },
    ruleIds: selectedRuleIds,
    customParameters: {
      createRestorePoint: true,
    },
  };

  const jsonString = JSON.stringify(preset, null, 2);
  const fileName = `wiscripts-preset-${preset.metadata.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}.json`;

  // Fallback blob download
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  get().addToast({
    type: 'success',
    title: 'Preset Exported',
    message: `Saved "${preset.metadata.name}" with ${selectedRuleIds.length} rules to file ${fileName}.`,
  });
},

importPresetFromJson: async (jsonString: string) => {
  try {
    const result = await invoke<PresetValidationResult>('validate_preset_json', { jsonContent: jsonString });

    if (!result.isValid || !result.preset) {
      const errorMsg = result.validationErrors.join(' ') || 'Preset contained no valid script rules.';
      get().addToast({
        type: 'error',
        title: 'Import Invalid',
        message: errorMsg,
      });
      return false;
    }

    const { preset, validRuleIds, unknownRuleIds } = result;

    // Apply selection to optimizations store
    set((state) => ({
      optimizations: state.optimizations.map((item) => ({
        ...item,
        isSelected: validRuleIds.includes(item.id),
      })),
    }));

    // Add to customProfiles list for PresetsView
    const newProfile: OptimizationProfile = {
      id: preset.metadata.id || `profile-${Date.now()}`,
      name: preset.metadata.name,
      description: preset.metadata.description,
      iconName: preset.metadata.iconName || 'Sparkles',
      ruleIds: validRuleIds,
    };

    set((state) => ({
      customProfiles: [...state.customProfiles.filter((p) => p.id !== newProfile.id), newProfile],
    }));

    get().addToast({
      type: unknownRuleIds.length > 0 ? 'warning' : 'success',
      title: 'Preset Imported',
      message: `Loaded "${preset.metadata.name}" (${validRuleIds.length} rules applied${
        unknownRuleIds.length > 0 ? `, ${unknownRuleIds.length} unknown rules skipped` : ''
      }).`,
    });

    return true;
  } catch (err) {
    const msg = typeof err === 'string' ? err : String(err);
    get().addToast({
      type: 'error',
      title: 'Import Error',
      message: `Failed to import preset file: ${msg}`,
    });
    return false;
  }
},
```

---

### D. UI Component Enhancements (`src/components/PresetsView.tsx`)

Add Import/Export Toolbar to `PresetsView.tsx`:

```tsx
<div className="flex items-center gap-3">
  {/* Import Preset File */}
  <label className="flex items-center gap-2 px-3 py-1.5 rounded-[6px] bg-surface-subtle border border-border hover:border-border-focus cursor-pointer text-xs text-text-primary transition-colors">
    <Upload className="h-4 w-4 text-brand" />
    <span>Import Preset JSON</span>
    <input
      type="file"
      accept=".json"
      className="hidden"
      onChange={async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const content = await file.text();
        await importPresetFromJson(content);
        e.target.value = '';
      }}
    />
  </label>

  {/* Quick Export Current Selection */}
  <button
    onClick={() => setShowExportModal(true)}
    className="flex items-center gap-2 px-3 py-1.5 rounded-[6px] bg-surface-subtle border border-border hover:border-border-focus text-xs text-text-primary transition-colors"
  >
    <Download className="h-4 w-4 text-brand" />
    <span>Export Selection as Preset</span>
  </button>
</div>
```

---

## 5. Verification Method

### A. Automated Backend AAA Unit Tests (`src-tauri/src/profiles/mod.rs`)

Run command:
```powershell
cargo test profiles::tests -- --nocapture
```

#### Test Suite Implementation
```rust
#[cfg(test)]
mod preset_tests {
    use super::*;

    #[test]
    fn test_preset_serialization_deserialization_success() {
        // Arrange
        let meta = PresetMetadata {
            id: "test-preset-1".to_string(),
            name: "Test Preset".to_string(),
            description: "Test description".to_string(),
            author: Some("Tester".to_string()),
            created_timestamp: "2026-07-27T00:00:00Z".to_string(),
            app_version: "0.3.0".to_string(),
            icon_name: Some("Sparkles".to_string()),
            tags: Some(vec!["test".to_string()]),
        };
        let original_preset = WiScriptsPreset {
            schema_version: "1.0".to_string(),
            metadata: meta,
            target_os: None,
            rule_ids: vec!["telemetry_diagtrack".to_string(), "disk_clean_temp".to_string()],
            custom_parameters: None,
        };

        // Act
        let json_str = serde_json::to_string_pretty(&original_preset).expect("Serialization failed");
        let parsed_preset: WiScriptsPreset = serde_json::from_str(&json_str).expect("Deserialization failed");

        // Assert
        assert_eq!(original_preset, parsed_preset);
        assert_eq!(parsed_preset.rule_ids.len(), 2);
        assert_eq!(parsed_preset.schema_version, "1.0");
    }

    #[test]
    fn test_preset_validation_with_unknown_rule_ids() {
        // Arrange
        let json_content = r#"{
            "schemaVersion": "1.0",
            "metadata": {
                "id": "p-123",
                "name": "Mixed Rules Preset",
                "description": "Contains valid and invalid rules",
                "createdTimestamp": "2026-07-27T00:00:00Z",
                "appVersion": "0.3.0"
            },
            "ruleIds": ["telemetry_diagtrack", "invalid_rule_xyz", "disk_clean_temp", "non_existent_id"]
        }"#;
        let catalog_ids = vec![
            "telemetry_diagtrack".to_string(),
            "telemetry_dmwappush".to_string(),
            "disk_clean_temp".to_string(),
        ];

        // Act
        let result = validate_and_parse_preset(json_content, &catalog_ids).unwrap();

        // Assert
        assert!(result.is_valid);
        assert_eq!(result.valid_rule_ids, vec!["telemetry_diagtrack", "disk_clean_temp"]);
        assert_eq!(result.unknown_rule_ids, vec!["invalid_rule_xyz", "non_existent_id"]);
        assert!(result.validation_errors.is_empty());
    }

    #[test]
    fn test_preset_validation_empty_rules() {
        // Arrange
        let json_content = r#"{
            "schemaVersion": "1.0",
            "metadata": {
                "id": "p-empty",
                "name": "Empty Preset",
                "description": "No rules",
                "createdTimestamp": "2026-07-27T00:00:00Z",
                "appVersion": "0.3.0"
            },
            "ruleIds": []
        }"#;
        let catalog_ids = vec!["telemetry_diagtrack".to_string()];

        // Act
        let result = validate_and_parse_preset(json_content, &catalog_ids).unwrap();

        // Assert
        assert!(!result.is_valid);
        assert!(result.validation_errors.iter().any(|e| e.contains("cannot be empty")));
    }
}
```

---

### B. Frontend Verification Protocol

1. **TypeScript Build Verification**:
   ```powershell
   npm run build
   ```
   *Expected Output*: TypeScript compilation (`tsc`) succeeds with zero type errors.

2. **Manual End-to-End Functional Checklist**:
   - [ ] **Export Test**: Select 3 items on `OptimizationView`, navigate to `PresetsView`, click "Export Selection as Preset", confirm file downloaded as `wiscripts-preset-custom-preset.json`.
   - [ ] **Import Test**: Click "Import Preset JSON", select exported `.json` file.
   - [ ] **Store Sync**: Verify selected items in `OptimizationView` match imported rule IDs.
   - [ ] **Toast Verification**: Toast appears stating `"Loaded 'Custom Preset' (3 rules applied)"`.
   - [ ] **Unknown Rule Resilience**: Import a JSON file containing a fake rule ID. Confirm warning toast appears and remaining valid rules are loaded properly without crash.

---

*Handoff report completed by Explorer M4-3.*
