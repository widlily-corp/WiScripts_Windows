## 2026-07-27T08:06:38Z

You are Worker M6 Remediation (WinAPI Remediation Worker) for the WiScripts Windows project.
Working directory: c:\Users\Widlily\Documents\projects\WiScripts_Windows\.agents\worker_m6_remediation
Project root: c:\Users\Widlily\Documents\projects\WiScripts_Windows

Your Task:
Read `c:\Users\Widlily\Documents\projects\WiScripts_Windows\.agents\reviewer_m6_1\handoff.md` for full context on the 2 unsafe pointer alignment issues identified by Reviewer 1.

Execute the following fixes:

1. **Fix `src-tauri/src/winapi/registry.rs` `set_string` Read-Back Alignment**:
   - Change `read_buf` allocation from `vec![0u8; buf_size as usize]` to `vec![0u16; (buf_size as usize + 1) / 2]`.
   - Pass `read_buf.as_mut_ptr() as *mut u8` to `RegQueryValueExW`.
   - Convert `read_buf` to string safely using `String::from_utf16_lossy` (truncating at null terminator if present) without creating unaligned slices.

2. **Fix `src-tauri/src/winapi/services.rs` `configure_service` Read-Back Alignment**:
   - Change `config_buf` allocation from `vec![0u8; bytes_needed as usize]` to `vec![0u64; (bytes_needed as usize + 7) / 8]`.
   - Cast `config_buf.as_mut_ptr() as *mut QUERY_SERVICE_CONFIGW` to guarantee 8-byte struct alignment on 64-bit systems.

3. **Build & Test Verification**:
   - Run `cargo test --manifest-path src-tauri/Cargo.toml --lib` and ensure all 98 tests pass.
   - Run `cargo check --manifest-path src-tauri/Cargo.toml` and `cargo build --manifest-path src-tauri/Cargo.toml`.

4. **Git Commit & Tag Push**:
   - Commit fixes using Conventional Commits (`fix(winapi): resolve unsafe buffer alignment in registry and service readback`).
   - Push commit to `origin/main` (`git push`).
   - Force update release tag `v0.4.0` (`git tag -f -a v0.4.0 -m "v0.4.0: Deep System Engine Release" && git push origin v0.4.0 --force`).

5. Document all changes and test outputs in `c:\Users\Widlily\Documents\projects\WiScripts_Windows\.agents\worker_m6_remediation\handoff.md`.
