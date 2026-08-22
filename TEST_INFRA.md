# E2E Test Infra: WiScripts Windows High-Performance Subsystems

## Test Philosophy
- **Opaque-box & Requirement-driven**: Tests derive directly from `ORIGINAL_REQUEST.md` and user specifications, evaluating API and UI behaviors without depending on internal implementation shortcuts.
- **Multi-tier Methodology**: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Combinatorial Testing + Real-World Workload Workflows.
- **Fast Execution**: Zero-dependency ESM runner achieving sub-100ms complete test suite execution.

---

## Feature Inventory & Test Mapping
| # | Feature | Requirement Source | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---|---------|-------------------|:------:|:------:|:------:|:------:|
| 1 | DPC & ISR Latency Analyzer | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 2 | Game Boost & Timer Resolution | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| 3 | Standby List Memory Purge | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 4 | Working Set Trimmer & Auto-Optimizer | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| 5 | Live Network Socket Monitor | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| 6 | Process Firewall Shield | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| 7 | Hardware NVMe SMART Health | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ | ✓ |
| 8 | Battery & Power Analytics | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ | ✓ |
| 9 | UI Architecture & Navigation Integration | ORIGINAL_REQUEST §R5 | 5 | 5 | ✓ | ✓ |
| 10 | i18n Translation Parity | ORIGINAL_REQUEST §R5 | 5 | 5 | ✓ | ✓ |

---

## Test Architecture
- **Test Runner**: `tests/e2e/runner.js` (invoked via `npm test`)
- **Test Harness**: `tests/e2e/harness.js` containing:
  - `KernelLatencySimulator` (DPC/ISR counts, timer resolution 0.5ms-15.6ms, process priorities)
  - `NativeMemoryPurgerSimulator` (Standby list purge, working set clearing, background threshold auto-trimmer)
  - `NetworkFirewallSimulator` (TCP/UDP socket tables, PID mapping, firewall inbound/outbound rules)
  - `HardwareTelemetrySimulator` (NVMe SMART health info log, battery telemetry, power plans & Ultimate Performance GUID)
  - `MockIPC` routing and assertion utilities
- **Test Files Layout**:
  - `tests/e2e/tier1_feature_coverage.test.js`: Feature-isolated happy-path tests (≥20 tests)
  - `tests/e2e/tier2_boundary_edge.test.js`: Edge cases, unprivileged elevation fallbacks, extreme thresholds, missing hardware (≥20 tests)
  - `tests/e2e/tier3_cross_feature.test.js`: Subsystem interactions and concurrent operations (≥8 tests)
  - `tests/e2e/tier4_real_world.test.js`: Real-world user workflows (≥6 tests)

---

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Hardcore Competitive Gaming Session Workflow | Game Boost + 0.5ms Timer Resolution + Standby Memory Flush + Background Service Suspension + DPC Latency Verification | High |
| 2 | Heavy Developer RAM Cleanup & Auto-Trim | Memory Breakdown Query + Standby List Purge + Safe Excluded Process Working Set Trim + Auto-Trimmer Threshold Config | High |
| 3 | Security Threat Isolation & Network Firewalling | Active Socket Inspection + PID Resolution + One-Click Process Firewall Block + State Verification | High |
| 4 | Workstation Storage & Power Diagnostics | NVMe SMART Health IOCTL Telemetry + Battery Wear / Discharge Analytics + Ultimate Performance Plan Activation | High |
| 5 | Command Palette Quick Navigation & Action Trigger | Navigation Indexing for 25 Views + Subsystem Action Execution + State Synchronization | Medium |
| 6 | Bilingual Dynamic Locale Switching & Key Parity | Full en.json / ru.json key and interpolation validation across all 25 UI views | Medium |

---

## Coverage Thresholds
- **Tier 1 (Feature Coverage)**: ≥5 test cases per feature (happy path)
- **Tier 2 (Boundary & Corner)**: ≥5 test cases per feature (unprivileged fallback, 0% threshold, invalid PIDs, desktop no-battery, max socket density)
- **Tier 3 (Cross-Feature Combinations)**: ≥8 pairwise cross-module test cases
- **Tier 4 (Real-World Workloads)**: ≥6 realistic application scenarios
- **Total Minimum Target**: ≥50 comprehensive E2E test cases
