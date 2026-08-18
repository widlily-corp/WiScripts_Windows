# E2E Test Infra: WiScripts Windows v1.0 Production Release

## Test Philosophy
- Opaque-box, requirement-driven testing covering requirements R1 through R6.
- Methodology: Category-Partition + Boundary Value Analysis + Pairwise Interaction + Real-World Workloads.
- Pass/Fail Semantics: 100% exit code 0, 0 compiler warnings (`cargo clippy -- -D warnings`), 0 type errors (`tsc --noEmit`), build artifact generation.

## Feature Inventory & Test Coverage Mapping
| # | Feature | Requirement | Tier 1 (Coverage) | Tier 2 (Boundary) | Tier 3 (Pairwise) | Tier 4 (Workload) |
|---|---------|-------------|:-----------------:|:-----------------:|:-----------------:|:-----------------:|
| 1 | `scripts_lib` Structure & Manifest | R1 | 5 tests | 5 tests | ✓ | ✓ |
| 2 | Backend Sync Engine & ETag | R1 | 5 tests | 5 tests | ✓ | ✓ |
| 3 | `ScriptRunnerView` UI Tabs & Modal | R1 | 5 tests | 5 tests | ✓ | ✓ |
| 4 | Win32 SCM Native Service Queries | R2 | 5 tests | 5 tests | ✓ | ✓ |
| 5 | Storage 2-Stage Deduplication | R2 | 5 tests | 5 tests | ✓ | ✓ |
| 6 | Uninstaller Chronological Date Sort | R2 | 5 tests | 5 tests | ✓ | ✓ |
| 7 | Zero-Warning Clippy Compliance | R2 | 5 tests | 5 tests | ✓ | ✓ |
| 8 | `React.lazy` Code-Splitting | R3 | 5 tests | 5 tests | ✓ | ✓ |
| 9 | `useTauriCommand` Memoization | R3 | 5 tests | 5 tests | ✓ | ✓ |
| 10 | Command Palette `Ctrl + K` | R4 | 5 tests | 5 tests | ✓ | ✓ |
| 11 | Pre-Flight Safety Snapshot | R4 | 5 tests | 5 tests | ✓ | ✓ |
| 12 | Windows 11 24H2 Tweaks | R4 | 5 tests | 5 tests | ✓ | ✓ |
| 13 | `.wiscripts` Profile Export/Import | R4 | 5 tests | 5 tests | ✓ | ✓ |
| 14 | Refined Minimal Design Tokens | R5 | 5 tests | 5 tests | ✓ | ✓ |
| 15 | WCAG 2.1 AA A11y & ARIA | R5 | 5 tests | 5 tests | ✓ | ✓ |
| 16 | Tabular-Nums Typography | R5 | 5 tests | 5 tests | ✓ | ✓ |
| 17 | Version 1.0.0 Metadata Sync | R6 | 5 tests | 5 tests | ✓ | ✓ |
| 18 | Conventional Commits & Workflows | R6 | 5 tests | 5 tests | ✓ | ✓ |

## Test Architecture & Runners
- **Rust Backend Suite**: `cargo test --all` and `cargo clippy -- -D warnings`
- **Frontend TypeScript Suite**: `npx tsc --noEmit` and `npm run build`
- **Opaque-Box E2E Validation**: Node/PowerShell test runner verifying manifest integrity, profile schema validation, and tweak commands.

## Coverage Goals
- Tier 1: ≥5 test cases per feature (90+ tests total)
- Tier 2: Boundary conditions (empty catalog, corrupt hashes, offline sync, extreme file sizes, multi-lingual dates)
- Tier 3: Cross-feature integrations (e.g. Preset import -> Safety snapshot -> Tweak execution -> Command palette search)
- Tier 4: Real-world workstation debloat scenarios
