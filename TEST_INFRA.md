# E2E Test Infra: WiScripts_Windows

## Test Philosophy
- Opaque-box, requirement-driven, and white-box unit/integration verification.
- Dual methodology: 4-tier E2E testing (Category-Partition, Boundary Value Analysis, Pairwise Combinatorial, Real-World Workload) + Rust unit & integration test suites.

## Feature Inventory
| # | Feature | Source (requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---|---|:---:|:---:|:---:|
| 1 | Online Scripts Manifest Sync & Local Fallback | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 2 | Script Download & Cryptographic Integrity (SHA256) | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 3 | Script Execution (Dry-Run & Real) + Timeout/Cancel | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 4 | State Management (Zustand Slices, Log Bounds) | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 5 | i18n Localization Parity (EN/RU 100% Match) | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 6 | Rust Backend IPC Safety & Windows Process Sandboxing | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |

## Test Architecture
- **E2E Runner**: `tests/e2e/runner.js` — 54 automated opaque-box test scenarios covering Tiers 1-4.
- **i18n Parity Suite**: `tests/test_i18n_parity.cjs` — Validates exact 1:1 key parity and variable placeholders across all locales.
- **Component Key Scanner**: `tests/test_component_i18n_keys.cjs` — Scans all JSX/TSX components to verify all `t()` keys exist in locale files.
- **Rust Test Suites**: `cargo test --lib --tests` in `src-tauri` — 198 unit tests and 61 integration tests.
- **Challenger Scripts**: `tests/test_challenger_*.cjs` — Standalone adversarial stress tests for bundle lazy-loading, dynamic stores, telemetry, and memory.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|---|---|---|
| 1 | Full Offline Recovery from Corrupted Cache | Manifest sync, fallback to local seed, offline cache reading | High |
| 2 | High-Speed Preset Batching & Optimization | Zustand store batch updates, UI reactivity | Medium |
| 3 | Long-Running Session Memory & Log Bound | Log truncation, memory leak prevention | High |
| 4 | Script Execution & Parameter Injection Safety | Input sanitization, path normalization, timeout | High |
| 5 | Command Palette Quick Restore Point Creation | IPC parameter alignment, error boundaries | Medium |
| 6 | Multi-Language Switching & UI Complete Rendering | i18n translations, 21 tabs header navigation | Medium |

## Coverage Thresholds
- Tier 1: ≥5 per feature
- Tier 2: ≥5 per feature (where boundaries exist)
- Tier 3: pairwise coverage of major feature interactions
- Tier 4: ≥6 realistic application scenarios
- Rust Unit/Integration: 100% pass (0 failures)
- TypeScript Compilation: 0 errors, 0 warnings
