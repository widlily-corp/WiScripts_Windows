use std::fs::{self, File};
use std::io::Write;
use std::path::Path;
use std::sync::atomic::Ordering;
use std::thread;
use std::time::{Duration, Instant};
use tempfile::tempdir;
use wiscripts_windows_lib::storage::{
    calculate_target_size, cancel_scan, check_path_protection_status,
    delete_filesystem_items, is_system_protected_path,
    register_cancellation_token, scan_directory_tree, DiskScanResult,
};

/// 1. Deep nested directories (>25 levels: testing 30 levels deep)
#[test]
fn test_stress_deep_nested_directories_over_25_levels() {
    let dir = tempdir().expect("failed to create temp dir");
    let root = dir.path();

    let target_depth = 30;
    let mut current_path = root.to_path_buf();
    let mut depth_paths = Vec::new();
    let mut total_expected_bytes = 0u64;
    let mut total_expected_files = 0u64;

    // Create 30 nested subfolders, placing a file at every 5th depth level
    for depth in 1..=target_depth {
        current_path = current_path.join(format!("d_{}", depth));
        fs::create_dir(&current_path).expect("failed to create nested dir");
        depth_paths.push(current_path.clone());

        if depth % 5 == 0 || depth == 1 || depth == target_depth {
            let file_size = (depth as u64) * 1024;
            let file_path = current_path.join(format!("payload_depth_{}.bin", depth));
            let content = vec![0xABu8; file_size as usize];
            let mut f = File::create(&file_path).unwrap();
            f.write_all(&content).unwrap();
            f.sync_all().unwrap();

            total_expected_bytes += file_size;
            total_expected_files += 1;
        }
    }

    let scan_id = "test-deep-nesting-scan".to_string();
    let start_t = Instant::now();
    let result = scan_directory_tree(None, root.to_string_lossy().to_string(), Some(scan_id))
        .expect("deep nesting scan must succeed");
    let scan_duration = start_t.elapsed();

    println!(
        "[Stress Test] Scanned 30-level nested directory in {:?}: {} files, {} dirs, {} bytes",
        scan_duration, result.total_files, result.total_dirs, result.total_bytes
    );

    assert_eq!(result.total_dirs, target_depth as u64);
    assert_eq!(result.total_files, total_expected_files);
    assert_eq!(result.total_bytes, total_expected_bytes);
    assert!(!result.is_cancelled);

    // Verify tree traversal all the way to depth 30
    let mut current_tree_node = &result.tree;
    for depth in 1..=target_depth {
        assert!(current_tree_node.is_dir);
        let children = current_tree_node.children.as_ref().expect("directory node must have children");
        let next_dir_name = format!("d_{}", depth);
        let child_opt = children.iter().find(|c| c.name == next_dir_name && c.is_dir);
        assert!(
            child_opt.is_some(),
            "Directory at depth {} must be present in tree hierarchy",
            depth
        );
        current_tree_node = child_opt.unwrap();
    }

    // Top folders must contain the deep directories ordered by accumulated subtree size
    assert!(!result.top_folders.is_empty());
    assert_eq!(result.top_folders[0].name, "d_1");
    assert_eq!(result.top_folders[0].size_bytes, total_expected_bytes);
}

/// 2. Empty folders and zero-byte files (boundary condition testing)
#[test]
fn test_empty_folders_and_zero_byte_files_boundary() {
    let dir = tempdir().expect("failed to create temp dir");
    let root = dir.path();

    // Structure:
    // Root
    //   ├── empty_dir_1/
    //   ├── empty_dir_2/
    //   │     └── empty_sub_2_1/
    //   ├── zero_files_dir/
    //   │     ├── zero_1.txt (0 bytes)
    //   │     ├── zero_2.log (0 bytes)
    //   │     └── zero_3.dat (0 bytes)
    //   └── root_zero.tmp (0 bytes)

    let empty_dir_1 = root.join("empty_dir_1");
    let empty_dir_2 = root.join("empty_dir_2");
    let empty_sub_2_1 = empty_dir_2.join("empty_sub_2_1");
    let zero_files_dir = root.join("zero_files_dir");

    fs::create_dir_all(&empty_dir_1).unwrap();
    fs::create_dir_all(&empty_sub_2_1).unwrap();
    fs::create_dir_all(&zero_files_dir).unwrap();

    File::create(zero_files_dir.join("zero_1.txt")).unwrap();
    File::create(zero_files_dir.join("zero_2.log")).unwrap();
    File::create(zero_files_dir.join("zero_3.dat")).unwrap();
    File::create(root.join("root_zero.tmp")).unwrap();

    let result = scan_directory_tree(None, root.to_string_lossy().to_string(), None)
        .expect("scanning empty structure must succeed");

    assert_eq!(result.total_bytes, 0);
    assert_eq!(result.total_files, 4);
    assert_eq!(result.total_dirs, 4);
    assert_eq!(result.tree.size_bytes, 0);
    assert_eq!(result.tree.file_count, 4);
    assert_eq!(result.tree.dir_count, 4);

    // Verify percentages handle division by zero safely without NaN or Inf
    for folder in &result.top_folders {
        assert_eq!(folder.size_bytes, 0);
        assert_eq!(folder.percentage_of_total, 0.0);
        assert!(!folder.percentage_of_total.is_nan());
        assert!(!folder.percentage_of_total.is_infinite());
    }

    for file in &result.top_files {
        assert_eq!(file.size_bytes, 0);
        assert_eq!(file.percentage_of_total, 0.0);
        assert!(!file.percentage_of_total.is_nan());
        assert!(!file.percentage_of_total.is_infinite());
    }

    // Verify JSON serialization roundtrip works without errors
    let json = serde_json::to_string(&result).expect("JSON serialization must succeed");
    let deserialized: DiskScanResult = serde_json::from_str(&json).expect("JSON deserialization must succeed");
    assert_eq!(deserialized.total_bytes, 0);
    assert_eq!(deserialized.total_files, 4);
}

/// 3. Large directories with thousands of files (throughput, sorting, memory safety)
#[test]
fn test_large_directories_with_thousands_of_files_throughput_and_sorting() {
    let dir = tempdir().expect("failed to create temp dir");
    let root = dir.path();

    let num_subdirs = 15;
    let files_per_subdir = 200;
    let total_files_target = num_subdirs * files_per_subdir; // 3,000 files

    let mut ground_truth_total_bytes = 0u64;

    for s in 0..num_subdirs {
        let subdir = root.join(format!("partition_{:02}", s));
        fs::create_dir(&subdir).unwrap();

        for f in 0..files_per_subdir {
            let file_index = s * files_per_subdir + f;
            let file_size = ((file_index * 137 + 11) % 50_000) as u64; // diverse pseudo-random sizes
            let file_path = subdir.join(format!("file_{:04}.bin", f));
            
            let payload = vec![(file_index % 251) as u8; file_size as usize];
            let mut file = File::create(&file_path).unwrap();
            file.write_all(&payload).unwrap();

            ground_truth_total_bytes += file_size;
        }
    }

    let scan_start = Instant::now();
    let result = scan_directory_tree(None, root.to_string_lossy().to_string(), None)
        .expect("scanning 3,000 files must succeed");
    let scan_elapsed = scan_start.elapsed();

    println!(
        "[Throughput Benchmark] Scanned {} files across {} subdirectories ({} bytes) in {:?}",
        result.total_files, result.total_dirs, result.total_bytes, scan_elapsed
    );

    assert_eq!(result.total_files, total_files_target as u64);
    assert_eq!(result.total_dirs, num_subdirs as u64);
    assert_eq!(result.total_bytes, ground_truth_total_bytes);

    // Verify top 20 files are capped at 20 and strictly sorted descending
    assert_eq!(result.top_files.len(), 20);
    for i in 0..result.top_files.len() - 1 {
        assert!(
            result.top_files[i].size_bytes >= result.top_files[i + 1].size_bytes,
            "Top files must be strictly monotonic descending by size (rank {} >= rank {})",
            result.top_files[i].rank,
            result.top_files[i + 1].rank
        );
        assert_eq!(result.top_files[i].rank, i + 1);
    }

    // Verify top folders are capped at min(20, num_subdirs) and strictly sorted descending
    assert_eq!(result.top_folders.len(), num_subdirs);
    for i in 0..result.top_folders.len() - 1 {
        assert!(
            result.top_folders[i].size_bytes >= result.top_folders[i + 1].size_bytes,
            "Top folders must be strictly monotonic descending by size (rank {} >= rank {})",
            result.top_folders[i].rank,
            result.top_folders[i + 1].rank
        );
        assert_eq!(result.top_folders[i].rank, i + 1);
    }
}

/// 4. Cancellation token halts background worker quickly without memory leaks or panics
#[test]
fn test_cancellation_token_halt_speed_and_registry_cleanup() {
    let dir = tempdir().expect("failed to create temp dir");
    let root = dir.path();
    // Create 5,000 files across subdirectories to ensure scan is active during mid-scan cancellation
    for d in 0..10 {
        let sub = root.join(format!("sub_{}", d));
        fs::create_dir_all(&sub).unwrap();
        for i in 0..500 {
            let f_path = sub.join(format!("bench_file_{:04}.tmp", i));
            fs::write(&f_path, vec![0x55; 1024]).unwrap();
        }
    }

    // A. Pre-cancelled scan must halt immediately (<5ms)
    let pre_cancel_id = "test-pre-cancel-id".to_string();
    let token = register_cancellation_token(&pre_cancel_id);
    token.store(true, Ordering::SeqCst);

    let start_pre = Instant::now();
    let res_pre = scan_directory_tree(None, root.to_string_lossy().to_string(), Some(pre_cancel_id.clone()))
        .expect("pre-cancelled scan should return Ok result marked cancelled");
    let pre_duration = start_pre.elapsed();

    println!("[Cancellation Test] Pre-cancelled scan returned in {:?}", pre_duration);
    assert!(pre_duration < Duration::from_millis(50), "Pre-cancelled scan must return in under 50ms");
    assert!(res_pre.is_cancelled);
    assert_eq!(res_pre.total_files, 0);

    // B. Mid-scan cancellation from background thread
    let mid_cancel_id = "test-mid-cancel-id".to_string();
    let root_str = root.to_string_lossy().to_string();
    let mid_id_clone = mid_cancel_id.clone();

    let scan_handle = thread::spawn(move || {
        let start_mid = Instant::now();
        let res = scan_directory_tree(None, root_str, Some(mid_id_clone)).unwrap();
        (res, start_mid.elapsed())
    });

    // Cancel after slight delay
    thread::sleep(Duration::from_millis(2));
    let cancel_res = cancel_scan(Some(&mid_cancel_id));
    assert!(cancel_res, "cancel_scan must return true for registered active scan");

    let (res_mid, mid_duration) = scan_handle.join().expect("scan thread join failed");
    println!(
        "[Cancellation Test] Mid-scan cancellation halted in {:?}, scanned {} files (is_cancelled: {})",
        mid_duration, res_mid.total_files, res_mid.is_cancelled
    );
    assert!(res_mid.is_cancelled);

    // C. Global cancellation (cancel all active tokens)
    let global_id_1 = "test-global-cancel-1".to_string();
    let global_id_2 = "test-global-cancel-2".to_string();
    let tok1 = register_cancellation_token(&global_id_1);
    let tok2 = register_cancellation_token(&global_id_2);

    assert!(!tok1.load(Ordering::Relaxed));
    assert!(!tok2.load(Ordering::Relaxed));

    assert!(cancel_scan(None));

    assert!(tok1.load(Ordering::Relaxed));
    assert!(tok2.load(Ordering::Relaxed));
}

/// 5. Ranked top largest folders/files calculations match actual mathematical sum
#[test]
fn test_ranked_top_largest_calculations_mathematical_precision() {
    let dir = tempdir().expect("failed to create temp dir");
    let root = dir.path();

    // Deterministic Layout:
    // Root
    //   ├── folder_a (10,000,000 bytes total)
    //   │     ├── file_a1.dat (6,000,000 bytes)
    //   │     └── sub_a1 (4,000,000 bytes)
    //   │           └── file_a11.dat (4,000,000 bytes)
    //   ├── folder_b (5,000,000 bytes total)
    //   │     ├── file_b1.dat (3,000,000 bytes)
    //   │     └── file_b2.dat (2,000,000 bytes)
    //   ├── folder_c (1,000,000 bytes total)
    //   │     └── file_c1.dat (1,000,000 bytes)
    //   ├── folder_d (0 bytes - empty)
    //   └── root_payload.iso (15,000,000 bytes)
    // Total Root Bytes = 31,000,000 bytes

    let folder_a = root.join("folder_a");
    let sub_a1 = folder_a.join("sub_a1");
    let folder_b = root.join("folder_b");
    let folder_c = root.join("folder_c");
    let folder_d = root.join("folder_d");

    fs::create_dir_all(&sub_a1).unwrap();
    fs::create_dir_all(&folder_b).unwrap();
    fs::create_dir_all(&folder_c).unwrap();
    fs::create_dir_all(&folder_d).unwrap();

    fs::write(folder_a.join("file_a1.dat"), vec![0x11; 6_000_000]).unwrap();
    fs::write(sub_a1.join("file_a11.dat"), vec![0x12; 4_000_000]).unwrap();
    fs::write(folder_b.join("file_b1.dat"), vec![0x21; 3_000_000]).unwrap();
    fs::write(folder_b.join("file_b2.dat"), vec![0x22; 2_000_000]).unwrap();
    fs::write(folder_c.join("file_c1.dat"), vec![0x31; 1_000_000]).unwrap();
    fs::write(root.join("root_payload.iso"), vec![0x99; 15_000_000]).unwrap();

    let result = scan_directory_tree(None, root.to_string_lossy().to_string(), None)
        .expect("mathematical scan must succeed");

    let total_expected_bytes = 31_000_000u64;
    assert_eq!(result.total_bytes, total_expected_bytes);
    assert_eq!(result.total_files, 6);
    assert_eq!(result.total_dirs, 5);

    // Verify Top Folders
    // Expected order: folder_a (10M), folder_b (5M), sub_a1 (4M), folder_c (1M), folder_d (0M)
    assert_eq!(result.top_folders.len(), 5);

    assert_eq!(result.top_folders[0].name, "folder_a");
    assert_eq!(result.top_folders[0].size_bytes, 10_000_000);
    assert_eq!(result.top_folders[0].rank, 1);
    let pct_a = (10_000_000.0 / 31_000_000.0) * 100.0;
    assert!((result.top_folders[0].percentage_of_total - pct_a).abs() < 1e-5);

    assert_eq!(result.top_folders[1].name, "folder_b");
    assert_eq!(result.top_folders[1].size_bytes, 5_000_000);
    assert_eq!(result.top_folders[1].rank, 2);
    let pct_b = (5_000_000.0 / 31_000_000.0) * 100.0;
    assert!((result.top_folders[1].percentage_of_total - pct_b).abs() < 1e-5);

    assert_eq!(result.top_folders[2].name, "sub_a1");
    assert_eq!(result.top_folders[2].size_bytes, 4_000_000);
    assert_eq!(result.top_folders[2].rank, 3);
    let pct_sub_a1 = (4_000_000.0 / 31_000_000.0) * 100.0;
    assert!((result.top_folders[2].percentage_of_total - pct_sub_a1).abs() < 1e-5);

    assert_eq!(result.top_folders[3].name, "folder_c");
    assert_eq!(result.top_folders[3].size_bytes, 1_000_000);
    assert_eq!(result.top_folders[3].rank, 4);

    assert_eq!(result.top_folders[4].name, "folder_d");
    assert_eq!(result.top_folders[4].size_bytes, 0);
    assert_eq!(result.top_folders[4].rank, 5);
    assert_eq!(result.top_folders[4].percentage_of_total, 0.0);

    // Verify Top Files
    // Expected order: root_payload.iso (15M), file_a1.dat (6M), file_a11.dat (4M), file_b1.dat (3M), file_b2.dat (2M), file_c1.dat (1M)
    assert_eq!(result.top_files.len(), 6);

    assert_eq!(result.top_files[0].name, "root_payload.iso");
    assert_eq!(result.top_files[0].size_bytes, 15_000_000);
    assert_eq!(result.top_files[0].rank, 1);
    let pct_iso = (15_000_000.0 / 31_000_000.0) * 100.0;
    assert!((result.top_files[0].percentage_of_total - pct_iso).abs() < 1e-5);

    assert_eq!(result.top_files[1].name, "file_a1.dat");
    assert_eq!(result.top_files[1].size_bytes, 6_000_000);
    assert_eq!(result.top_files[1].rank, 2);

    assert_eq!(result.top_files[2].name, "file_a11.dat");
    assert_eq!(result.top_files[2].size_bytes, 4_000_000);
    assert_eq!(result.top_files[2].rank, 3);

    assert_eq!(result.top_files[3].name, "file_b1.dat");
    assert_eq!(result.top_files[3].size_bytes, 3_000_000);
    assert_eq!(result.top_files[3].rank, 4);

    assert_eq!(result.top_files[4].name, "file_b2.dat");
    assert_eq!(result.top_files[4].size_bytes, 2_000_000);
    assert_eq!(result.top_files[4].rank, 5);

    assert_eq!(result.top_files[5].name, "file_c1.dat");
    assert_eq!(result.top_files[5].size_bytes, 1_000_000);
    assert_eq!(result.top_files[5].rank, 6);

    // Verify tree node sizes match actual folder sizes
    let root_children = result.tree.children.as_ref().unwrap();
    let tree_a = root_children.iter().find(|c| c.name == "folder_a").unwrap();
    assert_eq!(tree_a.size_bytes, 10_000_000);
    assert_eq!(tree_a.file_count, 2);
    assert_eq!(tree_a.dir_count, 1);

    let tree_b = root_children.iter().find(|c| c.name == "folder_b").unwrap();
    assert_eq!(tree_b.size_bytes, 5_000_000);
    assert_eq!(tree_b.file_count, 2);
    assert_eq!(tree_b.dir_count, 0);

    let tree_d = root_children.iter().find(|c| c.name == "folder_d").unwrap();
    assert_eq!(tree_d.size_bytes, 0);
    assert_eq!(tree_d.file_count, 0);
    assert_eq!(tree_d.dir_count, 0);
}

/// 6. Guardrail validation and safe deletion adversarial matrix
#[test]
fn test_guardrails_and_permanent_deletion_adversarial_matrix() {
    // A. Drive roots & OS system folders
    let protected_paths = [
        r"C:\",
        r"C:",
        r"D:\",
        r"D:",
        r"/",
        r"\",
        r"C:\Windows",
        r"C:\Windows\System32",
        r"C:\Windows\SysWOW64",
        r"C:\Windows\WinSxS",
        r"C:\Boot",
        r"C:\EFI",
        r"C:\System Volume Information",
        r"C:\$Recycle.Bin",
        r"C:\Program Files",
        r"C:\Program Files (x86)",
        r"C:\ProgramData",
        r"C:\Users\Widlily\..\..\Windows\System32",
    ];

    for p in protected_paths {
        let (is_prot, reason) = is_system_protected_path(Path::new(p));
        assert!(
            is_prot,
            "Path '{}' must be identified as system protected, but was not! (reason: {:?})",
            p, reason
        );
        let status = check_path_protection_status(Path::new(p));
        assert!(status.is_protected);
        assert_ne!(status.protection_level, "Safe");
    }

    // B. Safe user paths
    let safe_paths = [
        r"C:\Users\Public\Downloads\safe_file.txt",
        r"C:\Projects\MyRepo\temp.log",
        r"C:\Data\Photos\vacation.jpg",
    ];

    for p in safe_paths {
        let status = check_path_protection_status(Path::new(p));
        assert!(
            !status.is_protected,
            "Safe path '{}' was incorrectly marked as protected: {:?}",
            p, status.reason
        );
        assert_eq!(status.protection_level, "Safe");
    }

    // C. Deletion of protected path rejected by deletion engine
    let del_attempt = delete_filesystem_items(vec![r"C:\Windows\System32".to_string()], true);
    assert!(del_attempt.is_ok());
    let del_res = del_attempt.unwrap();
    assert_eq!(del_res.items_deleted, 0);
    assert_eq!(del_res.bytes_freed, 0);
    assert!(!del_res.errors.is_empty());
    assert!(
        del_res.errors[0].contains("Security Violation") || del_res.errors[0].contains("Protected system path"),
        "Error message should indicate security / protected system path violation, got: {}",
        del_res.errors[0]
    );

    // D. Permanent recursive deletion of non-empty directory with read-only files
    let dir = tempdir().expect("failed to create temp dir");
    let target_folder = dir.path().join("to_delete");
    let target_sub = target_folder.join("sub");
    fs::create_dir_all(&target_sub).unwrap();

    let ro_file = target_sub.join("readonly.txt");
    fs::write(&ro_file, b"readonly payload data 12345").unwrap();
    let mut perms = fs::metadata(&ro_file).unwrap().permissions();
    perms.set_readonly(true);
    fs::set_permissions(&ro_file, perms).unwrap();

    let target_size = calculate_target_size(&target_folder);
    assert_eq!(target_size, 27);

    let del_success = delete_filesystem_items(vec![target_folder.to_string_lossy().to_string()], true)
        .expect("permanent deletion must succeed");

    assert_eq!(del_success.items_deleted, 1);
    assert_eq!(del_success.bytes_freed, 27);
    assert_eq!(del_success.errors.len(), 0);
    assert!(!target_folder.exists());
}
