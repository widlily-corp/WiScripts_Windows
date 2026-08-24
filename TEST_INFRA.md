# E2E Test Infra: Disk Space Analyzer & Filesystem Tree Explorer

## Test Philosophy
- Opaque-box, requirement-driven. No dependency on implementation internals.
- Methodology: Category-Partition + Boundary Value Analysis + Pairwise Combinatorial Testing + Real-World Workload Testing.

## Feature Inventory
| # | Feature | Source (requirement) | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---|---------|---------------------|:------:|:------:|:------:|:------:|
| 1 | High-Performance Filesystem Scanner | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 2 | Recursive Size & Item Calculation | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 3 | Ranked Largest Folders & Files | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 4 | Interactive Filesystem Tree View | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 5 | Breadcrumb Navigation & Filter | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 6 | Item Quick Actions (Open / Copy) | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 7 | Safe Recursive Deletion Engine | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| 8 | System Directory Guardrails | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| 9 | Real-time Tree & Space Recalculation | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| 10 | Refined Minimal / Dark UI Styling | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ | ✓ |
| 11 | Full Bilingual i18n (EN/RU) | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ | ✓ |
| 12 | StorageUtilities UI Integration | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ | ✓ |

## Test Architecture
- **Master Test Runner**: `node tests/e2e/runner.js` (or `npm test`)
- **Disk Space Analyzer Suite**: `tests/e2e/disk_space_analyzer.test.js`
- **Rust Library Unit Tests**: `cargo test --manifest-path src-tauri/Cargo.toml --lib`
- **TypeScript Type Verification**: `npx tsc --noEmit`
- **i18n Parity Audit**: `node tests/test_i18n_parity.cjs` & `node tests/test_component_i18n_keys.cjs`

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Full Drive & Complex Tree Scan | Multi-threaded scan, deep nesting, symlinks, hidden files | High |
| 2 | Safe Deletion Workflow with Recycle Bin | Tree selection, deletion confirmation, in-memory delta recalculation | High |
| 3 | System Guardrail Defense Under Adversarial Traversal | Relative paths `..\..\Windows`, drive roots, junction points | Critical |
| 4 | Rapid Mid-Scan Cancellation & State Recovery | Async cancellation token halt, state cleanup, fresh restart | High |
| 5 | Internationalization & UI Rendering | Locale switching (EN <-> RU), dark theme contrast, tabular numbers | Medium |

## Coverage Summary
- Tier 1: 20 tests
- Tier 2: 20 tests
- Tier 3: 10 tests
- Tier 4: 7 tests
- **Total Suite**: 57 dedicated Disk Space Analyzer test cases (out of 123 master tests)
