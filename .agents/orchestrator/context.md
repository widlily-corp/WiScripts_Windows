# Architectural Context: Persistent Debug Logging System

## Objective
Implement a robust persistent file-based logging mechanism in the Rust backend of WiScripts Windows.

## Key Requirements & Specifications
1. **Target File**: `debug.log` in the application executable directory / current working directory.
2. **Log Content**:
   - Application initialization & shutdown events.
   - Command execution logs (PowerShell / CMD commands executed by `RealRunner` or `DryRunRunner`).
   - Dry-run actions and simulation logs.
   - Command stdout, stderr, exit codes, and error logs.
   - Timestamps and explicit log levels (`INFO`, `WARN`, `ERROR`, `DEBUG`).
3. **Crate Selection**: `simplelog`, `env_logger`, or standard `log` crate combined with `CombinedLogger` / `WriteLogger` or custom thread-safe file appender.
4. **Verification**:
   - `cargo test` passes cleanly and produces valid `debug.log` entries during test execution.
   - `cargo check` / build passes without errors.
