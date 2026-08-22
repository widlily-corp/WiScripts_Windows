//! Challenger 1: Empirical Adversarial Verification Suite for Milestone 1
//!
//! Areas Covered:
//! 1. Path Traversal & Injection Attacks: sanitize_script_relative_path & safe_join_script_path
//! 2. Cache Corruption Resilience: 0-byte, truncated, malformed, invalid schema JSON recovery
//! 3. Script Cancellation & Timeout: ScriptExecutionRegistry concurrency, rapid cancellation, unknown IDs, process trees
//! 4. SHA-256 Oracle: Complete cryptographic verification of all 27 scripts in scripts_lib/

use std::fs;
use std::path::{PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tempfile::tempdir;
use wiscripts_windows_lib::error::AppError;
use wiscripts_windows_lib::script_runner::sync::{
    compute_sha256, safe_join_script_path, sanitize_script_relative_path,
    seed_cache_from_local_project, ScriptsLibraryManifest,
};
use wiscripts_windows_lib::script_runner::ScriptExecutionRegistry;

// ============================================================================
// SUITE 1: PATH TRAVERSAL & INJECTION ATTACKS
// ============================================================================

#[test]
fn test_adversarial_path_traversal_comprehensive_matrix() {
    let adversarial_payloads = [
        // Classical Directory Traversal (Unix & Windows separators)
        "../../etc/passwd",
        "..\\..\\Windows\\System32\\cmd.exe",
        "../evil.ps1",
        "..\\evil.ps1",
        "maintenance/../../evil.ps1",
        "maintenance/..\\..\\evil.ps1",
        "maintenance/../evil.ps1",
        "maintenance\\..\\evil.ps1",
        "maintenance/sub/../../../evil.ps1",
        "maintenance/sub/..\\..\\..\\evil.ps1",
        "..",
        "...",
        "....",
        ".../test.ps1",
        "....\\test.ps1",
        // Redundant current directory traversal
        "./maintenance/test.ps1",
        ".\\maintenance\\test.ps1",
        "maintenance/.\\test.ps1",
        "maintenance/../maintenance/test.ps1",
        // Absolute & Drive paths
        "C:\\Windows\\System32\\calc.exe",
        "c:/windows/system32/calc.exe",
        "C:script.ps1",
        "c:test.ps1",
        "D:\\scripts\\evil.ps1",
        "D:/scripts/evil.ps1",
        "/etc/passwd",
        "/usr/bin/sh",
        "/maintenance/test.ps1",
        "\\Windows\\System32\\cmd.exe",
        "\\maintenance\\test.ps1",
        "\\\\Windows\\System32\\cmd.exe",
        // UNC Network & Device paths
        "\\\\evil_server\\share\\script.ps1",
        "//evil_server/share/script.ps1",
        "\\\\127.0.0.1\\c$\\evil.ps1",
        "\\\\localhost\\c$\\evil.ps1",
        "\\\\?\\C:\\Windows\\System32\\calc.exe",
        "\\\\.\\pipe\\evil_pipe",
        // Extension whitelist bypass attempts
        "script.exe",
        "script.vbs",
        "script.sh",
        "script.js",
        "script.py",
        "script.com",
        "script.scr",
        "script.dll",
        "script.bin",
        "maintenance/script.exe",
        "maintenance/script.vbs",
        "maintenance/script.sh",
        "maintenance/script.ps1.exe",
        "maintenance/script.exe.ps1.bak",
        "maintenance/script",
        "maintenance/script.",
        "maintenance/script.ps1.",
        "maintenance/script.bat.txt",
        "maintenance/script.cmd.com",
        "maintenance/script.pS1;calc.exe",
        // Null-byte injection payloads
        "script.ps1\0.bat",
        "\0malicious.ps1",
        "maintenance\0/script.ps1",
        "maintenance/\0script.ps1",
        "maintenance/script.ps1\0",
        // Windows Alternate Data Streams & Colon injections
        "maintenance/script.ps1::$DATA",
        "maintenance:script.ps1",
        "maintenance/script.ps1:hidden.exe",
        // Whitespace, empty, and special tokens
        "",
        " ",
        "   \t\n\r  ",
    ];

    let base_temp = tempdir().expect("Failed to create temporary directory for test");
    let base_path = base_temp.path();

    for payload in &adversarial_payloads {
        let sanitize_res = sanitize_script_relative_path(payload);
        assert!(
            sanitize_res.is_err(),
            "SECURITY VIOLATION: sanitize_script_relative_path unexpectedly accepted adversarial payload: {:?}",
            payload
        );

        let safe_join_res = safe_join_script_path(base_path, payload);
        assert!(
            safe_join_res.is_err(),
            "SECURITY VIOLATION: safe_join_script_path unexpectedly accepted adversarial payload: {:?}",
            payload
        );
    }
}

#[test]
fn test_adversarial_path_normalization_and_containment() {
    let base_temp = tempdir().expect("Failed to create temporary directory");
    let base_path = base_temp.path();

    // Redundant separators, trailing whitespace, or current-dir references that normalize safely within bounds
    let normalizing_cases = [
        "maintenance/./clear_windows_update_cache.ps1",
        "maintenance//clear_windows_update_cache.ps1",
        "  maintenance/clear_windows_update_cache.ps1  ",
    ];

    for norm_path in &normalizing_cases {
        let joined = safe_join_script_path(base_path, norm_path);
        assert!(
            joined.is_ok(),
            "Normalized path {:?} should safely resolve: {:?}",
            norm_path,
            joined.err()
        );
        let path_buf = joined.unwrap();
        assert!(
            path_buf.starts_with(base_path),
            "Normalized path {:?} must reside strictly within base {:?}",
            path_buf,
            base_path
        );
    }
}

#[test]
fn test_adversarial_safe_join_escape_containment() {
    let base_temp = tempdir().expect("Failed to create temporary directory");
    let base_path = base_temp.path();

    // Valid relative paths inside base must succeed and start with base
    let valid_cases = [
        "maintenance/clear_windows_update_cache.ps1",
        "network/flush_dns_reset_winsock.ps1",
        "security/harden_smb_netbios.ps1",
        "performance/ultimate_performance_plan.ps1",
        "diagnostics/export_battery_report.ps1",
        "diagnostics/test.bat",
        "diagnostics/test.cmd",
    ];

    for valid_path in &valid_cases {
        let joined = safe_join_script_path(base_path, valid_path);
        assert!(
            joined.is_ok(),
            "Valid path {:?} should be accepted by safe_join_script_path: {:?}",
            valid_path,
            joined.err()
        );
        let path_buf = joined.unwrap();
        assert!(
            path_buf.starts_with(base_path),
            "Joined path {:?} must reside strictly within base {:?}",
            path_buf,
            base_path
        );
    }
}

// ============================================================================
// SUITE 2: CACHE CORRUPTION RESILIENCE
// ============================================================================

#[test]
fn test_cache_corruption_zero_byte_manifest_recovery() {
    let temp_cache = tempdir().expect("Failed to create cache temp dir");
    let cache_dir = temp_cache.path();
    let manifest_file = cache_dir.join("manifest.json");
    let etag_file = cache_dir.join("manifest.etag");

    // 1. Write 0-byte corrupt manifest & dummy etag
    fs::write(&manifest_file, b"").expect("Failed to write 0-byte manifest");
    fs::write(&etag_file, b"W/\"test-etag-1234\"").expect("Failed to write etag");
    assert_eq!(manifest_file.metadata().unwrap().len(), 0);

    // 2. Attempt to parse / recover via local project seed
    let seed_result = seed_cache_from_local_project(cache_dir);
    assert!(
        seed_result.is_ok(),
        "Seeding from local project must succeed even when corrupt files exist: {:?}",
        seed_result.err()
    );

    let manifest = seed_result.unwrap();
    assert!(
        manifest.is_some(),
        "Local project seed must find and load scripts_lib manifest"
    );

    let loaded = manifest.unwrap();
    assert_eq!(loaded.scripts.len(), 27, "Expected exactly 27 scripts in library");

    // 3. Verify manifest.json in cache was overwritten with valid JSON
    let new_content = fs::read_to_string(&manifest_file).expect("Failed to read repaired manifest");
    let reparsed: Result<ScriptsLibraryManifest, _> = serde_json::from_str(&new_content);
    assert!(
        reparsed.is_ok(),
        "Repaired cached manifest must be valid JSON: {:?}",
        reparsed.err()
    );
}

#[test]
fn test_cache_corruption_truncated_json_recovery() {
    let temp_cache = tempdir().expect("Failed to create cache temp dir");
    let cache_dir = temp_cache.path();
    let manifest_file = cache_dir.join("manifest.json");

    // Truncated JSON
    let truncated_json = r#"{"schemaVersion": "1.0.0", "version": "1.1.3", "scripts": [{"id": "test"#;
    fs::write(&manifest_file, truncated_json).expect("Failed to write truncated JSON");

    // Verify serde parse fails as expected
    let parse_res: Result<ScriptsLibraryManifest, _> = serde_json::from_str(truncated_json);
    assert!(parse_res.is_err(), "Truncated JSON must fail deserialization");

    // Seed recovery
    let seed_res = seed_cache_from_local_project(cache_dir);
    assert!(seed_res.is_ok());
    let opt_manifest = seed_res.unwrap();
    assert!(opt_manifest.is_some());

    let m = opt_manifest.unwrap();
    assert_eq!(m.scripts.len(), 27);
}

#[test]
fn test_cache_corruption_malformed_and_type_mismatched_json() {
    let temp_cache = tempdir().expect("Failed to create cache temp dir");
    let cache_dir = temp_cache.path();
    let manifest_file = cache_dir.join("manifest.json");

    let malformed_payloads = [
        // Syntax error
        r#"{"schemaVersion": "1.0.0", "scripts": [ { "id": 12345 } ] }"#,
        // Scripts is string instead of array
        r#"{"schemaVersion": "1.0.0", "version": "1.0", "scripts": "not an array"}"#,
        // Missing required fields
        r#"{"schemaVersion": "1.0.0"}"#,
        // Non-JSON garbage
        "!!!<<<CORRUPTED_NON_JSON_BINARY_MOCK>>>!!!",
    ];

    for payload in &malformed_payloads {
        fs::write(&manifest_file, payload).expect("Failed to write payload");

        let parse_res: Result<ScriptsLibraryManifest, _> = serde_json::from_str(payload);
        assert!(
            parse_res.is_err(),
            "Payload {:?} should fail deserialization",
            payload
        );

        let seed_res = seed_cache_from_local_project(cache_dir);
        assert!(
            seed_res.is_ok(),
            "Seed recovery should succeed after payload {:?}: {:?}",
            payload,
            seed_res.err()
        );
        let m = seed_res.unwrap().expect("Manifest should be recovered");
        assert_eq!(m.scripts.len(), 27);
    }
}

// ============================================================================
// SUITE 3: SCRIPT CANCELLATION & TIMEOUT CONCURRENCY STRESS
// ============================================================================

#[test]
fn test_script_execution_registry_concurrent_multi_thread_stress() {
    let registry = ScriptExecutionRegistry::global();
    let thread_count = 16;
    let iterations_per_thread = 50;
    let completed_counter = Arc::new(AtomicUsize::new(0));

    let mut handles = Vec::new();

    for t in 0..thread_count {
        let counter = Arc::clone(&completed_counter);

        handles.push(std::thread::spawn(move || {
            let reg = ScriptExecutionRegistry::global();
            for i in 0..iterations_per_thread {
                let exec_id = format!("stress_thread_{}_iter_{}", t, i);
                let fake_pid = 100_000 + (t * 1000 + i) as u32;

                // 1. Register
                let (cancel_flag, guard) = reg.register(&exec_id, fake_pid, "ps1");
                assert!(!cancel_flag.load(Ordering::SeqCst));
                assert!(!guard.is_cancelled());

                // 2. Verify registered in listing
                let running = reg.list_running();
                assert!(!running.is_empty());

                // 3. In half the iterations, cancel execution
                if i % 2 == 0 {
                    let cancel_res = reg.cancel(&exec_id);
                    assert!(cancel_res.is_ok(), "Cancel must succeed for active ID");
                    assert!(reg.is_cancelled(&exec_id));
                    assert!(guard.is_cancelled());
                }

                // 4. Drop guard (unregisters from global registry)
                drop(guard);

                // 5. Verify unregistered
                assert!(!reg.is_cancelled(&exec_id));

                counter.fetch_add(1, Ordering::Relaxed);
            }
        }));
    }

    for h in handles {
        h.join().expect("Stress thread panicked");
    }

    assert_eq!(
        completed_counter.load(Ordering::SeqCst),
        thread_count * iterations_per_thread,
        "All stress iterations must complete"
    );
    assert_eq!(
        registry.list_running().len(),
        0,
        "Registry must be empty after all guards are dropped"
    );
}

#[test]
fn test_script_registry_cancel_adversarial_and_unknown_ids() {
    let registry = ScriptExecutionRegistry::new();

    let invalid_ids = [
        "non_existent_id",
        "   ",
        "",
        "active", // Active with 0 running scripts should error gracefully
        "../../../evil",
        "null\0byte",
        "00000000-0000-0000-0000-000000000000",
    ];

    for id in &invalid_ids {
        let res = registry.cancel(id);
        assert!(
            res.is_err(),
            "Cancelling non-existent ID {:?} should return error",
            id
        );
        match res.err().unwrap() {
            AppError::Execution(msg) => {
                assert!(
                    msg.contains("No active running script found"),
                    "Error message should mention no active script: {}",
                    msg
                );
            }
            other => panic!("Expected AppError::Execution, got {:?}", other),
        }
    }
}

#[test]
fn test_script_registry_double_cancellation_idempotence_or_error() {
    let registry = ScriptExecutionRegistry::global();
    let exec_id = "test_double_cancel_id";
    let fake_pid = 777777;

    let (_cancel_flag, guard) = registry.register(exec_id, fake_pid, "ps1");

    // First cancel succeeds
    let first_cancel = registry.cancel(exec_id);
    assert!(first_cancel.is_ok());
    assert!(registry.is_cancelled(exec_id));

    // Second cancel on still-registered process should succeed or remain cancelled
    let second_cancel = registry.cancel(exec_id);
    assert!(
        second_cancel.is_ok(),
        "Second cancellation on registered process should be idempotent"
    );

    drop(guard);

    // After drop, cancellation returns error
    let third_cancel = registry.cancel(exec_id);
    assert!(third_cancel.is_err());
}

// ============================================================================
// SUITE 4: SHA-256 CRYPTOGRAPHIC ORACLE ACROSS ALL 27 SCRIPTS
// ============================================================================

#[test]
fn test_sha256_oracle_all_27_scripts_byte_for_byte_integrity() {
    let candidates = [
        PathBuf::from("scripts_lib"),
        PathBuf::from("../scripts_lib"),
        PathBuf::from("../../scripts_lib"),
    ];

    let mut scripts_dir = None;
    for candidate in &candidates {
        if candidate.join("manifest.json").exists() {
            scripts_dir = Some(candidate.clone());
            break;
        }
    }

    assert!(
        scripts_dir.is_some(),
        "scripts_lib directory must exist in repository root"
    );
    let root = scripts_dir.unwrap();
    let manifest_path = root.join("manifest.json");

    let manifest_raw = fs::read_to_string(&manifest_path).expect("Failed to read manifest.json");
    let manifest: ScriptsLibraryManifest =
        serde_json::from_str(&manifest_raw).expect("Failed to parse manifest.json");

    assert_eq!(
        manifest.scripts.len(),
        27,
        "Manifest must define exactly 27 production scripts (found {})",
        manifest.scripts.len()
    );

    let required_categories = [
        "maintenance",
        "network",
        "security",
        "performance",
        "diagnostics",
    ];

    let mut found_categories = std::collections::HashSet::new();
    let mut observed_script_paths = std::collections::HashSet::new();

    for script in &manifest.scripts {
        found_categories.insert(script.category.clone());

        // 1. Verify path sanity
        let rel_path = sanitize_script_relative_path(&script.path)
            .unwrap_or_else(|_| panic!("Invalid path in manifest: {}", script.path));

        let physical_path = root.join(&rel_path);
        assert!(
            physical_path.exists(),
            "Physical script file missing on disk: {:?}",
            physical_path
        );

        // 2. Read physical bytes and compute SHA-256
        let bytes = fs::read(&physical_path)
            .unwrap_or_else(|_| panic!("Failed to read script file: {:?}", physical_path));
        assert!(
            !bytes.is_empty(),
            "Script file must not be 0-bytes: {:?}",
            physical_path
        );

        let calculated_sha256 = compute_sha256(&bytes);
        assert_eq!(
            calculated_sha256.to_lowercase(),
            script.sha256.to_lowercase(),
            "SHA-256 CRYPTOGRAPHIC INTEGRITY MISMATCH for script ID '{}' ({:?})",
            script.id,
            script.path
        );

        // 3. Verify valid 64-char lowercase hex
        assert_eq!(script.sha256.len(), 64);
        assert!(script
            .sha256
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));

        // 4. Verify UTF-8 string decodability
        let content_str = String::from_utf8(bytes.clone())
            .unwrap_or_else(|_| panic!("Script '{}' is not valid UTF-8", script.id));

        // 5. Verify PowerShell encoding safety: No non-ASCII chars inside `<# ... #>` block comments
        // (to prevent PowerShell 5.1 CP1251 parser bug on non-English Windows)
        if script.path.ends_with(".ps1") {
            let mut in_block_comment = false;
            for line in content_str.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with("<#") {
                    in_block_comment = true;
                }
                if in_block_comment {
                    for ch in line.chars() {
                        assert!(
                            ch.is_ascii(),
                            "SECURITY AUDIT FAILURE: Non-ASCII character '{}' found inside block comment in script '{}'. Must be pure ASCII to prevent CP1251 parser corruption.",
                            ch, script.id
                        );
                    }
                }
                if trimmed.ends_with("#>") || trimmed.contains("#>") {
                    in_block_comment = false;
                }
            }
        }

        // 6. Verify param() placement if script has parameters
        if script.path.ends_with(".ps1") && !script.parameters.is_empty() {
            let mut non_comment_lines = content_str
                .lines()
                .map(|l| l.trim().trim_start_matches('\u{feff}').trim())
                .filter(|l| !l.is_empty() && !l.starts_with('#') && !l.starts_with("<#"));

            if let Some(first_code_line) = non_comment_lines.next() {
                let lower_line = first_code_line.to_lowercase();
                assert!(
                    lower_line.starts_with("param(")
                        || lower_line.starts_with("param (")
                        || lower_line.starts_with("[cmdletbinding"),
                    "PowerShell syntax rule violated in parameterized script '{}': first statement must be param(...) or [CmdletBinding()], got: '{}'",
                    script.id,
                    first_code_line
                );
            }
        }

        // 7. Verify no blocking Read-Host calls
        assert!(
            !content_str.contains("Read-Host"),
            "GUI execution safety violation: Script '{}' contains blocking Read-Host",
            script.id
        );

        observed_script_paths.insert(
            physical_path
                .canonicalize()
                .unwrap_or(physical_path.clone()),
        );
    }

    // Verify all 5 categories are covered
    for req_cat in &required_categories {
        assert!(
            found_categories.contains(*req_cat),
            "Category '{}' is missing in manifest",
            req_cat
        );
    }

    // 8. Verify no uncataloged .ps1 / .bat / .cmd files exist in scripts_lib
    for entry in walkdir::WalkDir::new(&root)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                let ext_lower = ext.to_lowercase();
                if ext_lower == "ps1" || ext_lower == "bat" || ext_lower == "cmd" {
                    let canon = path.canonicalize().unwrap_or(path.to_path_buf());
                    assert!(
                        observed_script_paths.contains(&canon),
                        "UNCATALOGED SCRIPT FOUND: File {:?} exists in scripts_lib but is not registered in manifest.json",
                        path
                    );
                }
            }
        }
    }
}
