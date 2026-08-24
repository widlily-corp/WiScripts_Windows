# WiScripts Windows v1.5.1 — Test Infrastructure & Verification Architecture

## 1. Architecture Overview

WiScripts Windows v1.5.1 employs a **Dual-Track Verification Architecture** designed for high-reliability systems programming across Rust Tauri backend, React/TypeScript frontend, and the PowerShell script library:

1. **Track 1: Static AST & Schema Verification Harness** (`tests/static_analysis/`):
   - Validates 100% of PowerShell scripts in `scripts_lib/` via `.NET` PowerShell 5.1 AST syntax parsing (`[System.Management.Automation.Language.Parser]::ParseFile`) with zero live execution.
   - Enforces strict `param()` entry header placement, UTF-8 BOM encoding for non-ASCII literals, and ASCII-only `<# ... #>` block comments to prevent the CP1251 multibyte character parsing corruption on Russian Windows.
   - Validates `scripts_lib/manifest.json` schema, slug ID patterns, category enums, risk levels, and 100% physical SHA-256 cryptographic parity.

2. **Track 2: Opaque-Box & Unit Test Suite** (`tests/unit/`, `tests/e2e/`, `src/utils/__tests__/`):
   - Comprehensive unit testing for Multi-Terabyte / Petabyte binary scaling (`formatBytes`), 64-bit tabular formatting (`formatTabularBytes`), Windows OS guardrails (`isSystemProtectedPath`), and immutable structural tree updates (`syncTreeAfterDeletion`).
   - Four-tier E2E simulator suite covering Feature Coverage (Tier 1), Boundary & Corner Cases (Tier 2), Cross-Feature Workflows (Tier 3), and Real-World Workload Scenarios (Tier 4).
   - In-depth Disk Space Analyzer & Filesystem Tree Explorer test suite.

---

## 2. Strict Safety Constraint (Zero Host Execution)

> **SAFETY MANDATE (R5)**: Absolutely NO scripts from `scripts_lib/` or destructive test payloads are executed live against the host Windows operating system during testing.

All script validation is strictly performed via:
- In-memory AST tokenization and syntax tree analysis.
- Binary byte-level header inspection (UTF-8 BOM `0xEF 0xBB 0xBF`).
- Cryptographic SHA-256 hash matching against declared manifest values.
- Non-admin / mock execution simulation in sandboxed virtual filesystems.

---

## 3. Directory Layout & Module Index

```
tests/
├── static_analysis/
│   ├── ast_parser.ps1              # Pure PowerShell AST syntax & encoding validator
│   ├── ps_ast_validator.js         # Node.js AST validator module & CLI runner
│   ├── manifest_validator.js       # Manifest schema & SHA-256 parity validator
│   └── static_analysis_suite.js    # Master TestRunner integration for static checks
├── unit/
│   └── disk_analyzer_format.test.js # Multi-TB / PB binary format & disk utils unit tests
├── e2e/
│   ├── harness.js                  # Core test harness, assertions, simulators, Mock IPC
│   ├── runner.js                   # Unified master test runner (npm test)
│   ├── tier1_feature_coverage.test.js # Tier 1: Core feature coverage (R1-R5)
│   ├── tier2_boundary_edge.test.js    # Tier 2: Boundary, error & edge conditions
│   ├── tier3_cross_feature.test.js    # Tier 3: Cross-feature integrations
│   ├── tier4_real_world.test.js       # Tier 4: Real-world user workload scenarios
│   └── disk_space_analyzer.test.js    # Disk space analyzer & VFS tree explorer suite
src/
└── utils/
    └── __tests__/
        └── diskAnalyzer.test.ts    # Frontend TypeScript unit tests
```

---

## 4. Test Tiers & Verification Coverage

| Test Tier | Focus & Scope | Suite File | Test Count |
|---|---|---|---|
| **Static AST & Manifest** | AST syntax (0 errors), `param()` header, CP1251 ASCII comments, UTF-8 BOM, SHA-256 match, manifest schema | `tests/static_analysis/static_analysis_suite.js` | 9 tests (570+ assertions) |
| **Multi-TB Unit Tests** | Binary scaling up to 1000 TB & PB, tabular bytes, OS guardrails, tree sync & search filter | `tests/unit/disk_analyzer_format.test.js` | 10 tests |
| **Tier 1 (Feature Coverage)** | Gaming DPC, RAM purger, Network shield, Hardware SMART/Battery, Storage deduplication | `tests/e2e/tier1_feature_coverage.test.js` | 25 tests |
| **Tier 2 (Boundary & Edge)** | Elevation checks, boundary clamps, invalid PIDs, regex attacks, symlink loops | `tests/e2e/tier2_boundary_edge.test.js` | 26 tests |
| **Tier 3 (Cross-Feature)** | Game Boost + RAM Purge, Socket Block + Firewall, Profile Import + SCM, i18n switching | `tests/e2e/tier3_cross_feature.test.js` | 9 tests |
| **Tier 4 (Real-World)** | Gaming session, heavy dev IDE load, rogue miner isolation, laptop battery analytics | `tests/e2e/tier4_real_world.test.js` | 6 tests |
| **Disk Analyzer Suite** | Recursive scanning, bounded Top-N ranking, breadcrumbs, Recycle Bin vs permanent delete | `tests/e2e/disk_space_analyzer.test.js` | 57 tests |
| **Total Master Suite** | **All Verification Tiers Combined** | `tests/e2e/runner.js` | **142 tests** |

---

## 5. Test Execution Commands

### 5.1 Run Unified Master Test Suite
```bash
npm test
# or
node tests/e2e/runner.js
```

### 5.2 Run Static AST & Manifest Checks Individually
```bash
# PowerShell AST script parser
powershell -NoProfile -ExecutionPolicy Bypass -File tests/static_analysis/ast_parser.ps1

# JavaScript AST validator
node tests/static_analysis/ps_ast_validator.js

# JavaScript Manifest schema & SHA-256 validator
node tests/static_analysis/manifest_validator.js
```

### 5.3 Run Standalone Unit Test Suite
```bash
node tests/unit/disk_analyzer_format.test.js
```

---

## 6. Verification Criteria & Definition of Done

1. **Zero Test Failures**: All 142 tests in `tests/e2e/runner.js` pass with exit code 0.
2. **Zero AST Errors**: All 27 `.ps1` files in `scripts_lib/` pass PowerShell 5.1 AST syntax validation with 0 errors.
3. **Exact Cryptographic Integrity**: 100% of SHA-256 hashes in `manifest.json` match the disk files.
4. **CP1251 Bug Immunity**: Zero non-ASCII characters inside `<# ... #>` block comments.
5. **Multi-TB Scalability**: No integer rollover or `undefined` strings when formatting drives > 1000 GB, 1 TB, 1000 TB, or Petabytes.
