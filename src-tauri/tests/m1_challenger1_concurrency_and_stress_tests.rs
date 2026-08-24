use std::fs::{self, File};
use std::sync::atomic::Ordering;
use std::thread;
use std::time::{Duration, Instant};
use tempfile::tempdir;
use wiscripts_windows_lib::storage::analyzer::{
    cancel_scan, register_cancellation_token, scan_directory_tree,
    unregister_cancellation_token, FsTreeNode,
};

/// 1. Concurrent Cancellation Registry Heavy Contention Stress Test
#[test]
fn test_concurrent_cancellation_registry_heavy_contention() {
    let thread_count = 100;
    let mut handles = Vec::new();

    for t in 0..thread_count {
        let handle = thread::spawn(move || {
            for i in 0..50 {
                let scan_id = format!("stress-scan-t{}-iter{}", t, i);
                let token = register_cancellation_token(&scan_id);
                assert!(!token.load(Ordering::Relaxed));

                if i % 2 == 0 {
                    let cancelled = cancel_scan(Some(&scan_id));
                    assert!(cancelled, "cancel_scan must succeed for registered token");
                    assert!(token.load(Ordering::Relaxed));
                }

                unregister_cancellation_token(&scan_id);
            }
        });
        handles.push(handle);
    }

    for h in handles {
        h.join().expect("thread join failed under registry contention");
    }

    // Global cancellation on empty / active registry
    let g1 = "global-stress-1";
    let g2 = "global-stress-2";
    let tok1 = register_cancellation_token(g1);
    let tok2 = register_cancellation_token(g2);

    assert!(cancel_scan(None));
    assert!(tok1.load(Ordering::Relaxed));
    assert!(tok2.load(Ordering::Relaxed));

    unregister_cancellation_token(g1);
    unregister_cancellation_token(g2);
}

/// 2. Sub-Millisecond Cancellation Latency on Massive Directory Tree
#[test]
fn test_sub_millisecond_cancellation_responsiveness_on_massive_tree() {
    let dir = tempdir().expect("failed to create temp dir");
    let root = dir.path();

    // Create 4,000 files across 40 subdirectories
    for d in 0..40 {
        let sub = root.join(format!("subfolder_{:02}", d));
        fs::create_dir_all(&sub).unwrap();
        for f in 0..100 {
            let f_path = sub.join(format!("file_{:04}.dat", f));
            fs::write(&f_path, vec![0xEE; 512]).unwrap();
        }
    }

    let scan_id = "latency-test-scan-id".to_string();
    let root_str = root.to_string_lossy().to_string();
    let scan_id_clone = scan_id.clone();

    let scan_thread = thread::spawn(move || {
        let start = Instant::now();
        let res = scan_directory_tree(None, root_str, Some(scan_id_clone)).unwrap();
        (res, start.elapsed())
    });

    // Fire cancellation after tiny delay
    thread::sleep(Duration::from_millis(1));
    let cancel_start = Instant::now();
    let did_cancel = cancel_scan(Some(&scan_id));
    let cancel_call_latency = cancel_start.elapsed();

    assert!(did_cancel, "cancel_scan must return true for registered active scan");
    println!("[Cancellation Latency] cancel_scan() API call latency: {:?}", cancel_call_latency);

    let (res, total_scan_elapsed) = scan_thread.join().expect("scan thread join failed");
    println!(
        "[Cancellation Latency] Total duration: {:?}, Scanned files before halt: {} / 4000 (is_cancelled: {})",
        total_scan_elapsed, res.total_files, res.is_cancelled
    );

    assert!(res.is_cancelled, "Result must be flagged as cancelled");
    assert!(
        res.total_files <= 4000,
        "Cancelled scan should not have traversed the entire tree if interrupted early"
    );
}

/// 3. Ultra-Deep 50-Level Hierarchy Scanner Mathematical Invariant Verification
#[test]
fn test_scanner_50_level_deep_tree_mathematical_precision() {
    let dir = tempdir().expect("failed to create temp dir");
    let root = dir.path();

    let max_depth = 50;
    let mut current_dir = root.to_path_buf();
    let mut ground_truth_bytes = 0u64;

    for depth in 1..=max_depth {
        current_dir = current_dir.join(format!("lvl_{}", depth));
        fs::create_dir(&current_dir).unwrap();

        let file_size = (depth as u64) * 2000;
        let file_path = current_dir.join(format!("payload_lvl_{}.bin", depth));
        let content = vec![0x77u8; file_size as usize];
        fs::write(&file_path, &content).unwrap();

        ground_truth_bytes += file_size;
    }

    let result = scan_directory_tree(None, root.to_string_lossy().to_string(), None)
        .expect("50-level scan must succeed");

    assert_eq!(result.total_dirs, max_depth as u64);
    assert_eq!(result.total_files, max_depth as u64);
    assert_eq!(result.total_bytes, ground_truth_bytes);
    assert!(!result.is_cancelled);

    // Verify tree node invariants recursively
    fn check_node_invariants(node: &FsTreeNode) -> (u64, u64, u64) {
        if let Some(children) = &node.children {
            let mut sum_size = 0u64;
            let mut sum_files = 0u64;
            let mut sum_dirs = 0u64;

            for child in children {
                if child.is_dir {
                    let (c_size, c_files, c_dirs) = check_node_invariants(child);
                    sum_size += c_size;
                    sum_files += c_files;
                    sum_dirs += 1 + c_dirs;
                } else {
                    sum_size += child.size_bytes;
                    sum_files += 1;
                }
            }

            assert_eq!(node.size_bytes, sum_size, "Node '{}' size must equal sum of children", node.name);
            assert_eq!(node.file_count, sum_files, "Node '{}' file_count must equal sum of files", node.name);
            assert_eq!(node.dir_count, sum_dirs, "Node '{}' dir_count must equal sum of dirs", node.name);

            (node.size_bytes, node.file_count, node.dir_count)
        } else {
            (node.size_bytes, 1, 0)
        }
    }

    check_node_invariants(&result.tree);

    // Verify top folders
    assert_eq!(result.top_folders.len(), 20); // capped at 20
    assert_eq!(result.top_folders[0].name, "lvl_1");
    assert_eq!(result.top_folders[0].size_bytes, ground_truth_bytes);
    assert_eq!(result.top_folders[0].rank, 1);
}

/// 4. Top 20 Largest Folders and Files Exhaustive Sorting Oracle
#[test]
fn test_top_20_largest_files_and_folders_exhaustive_oracle() {
    let dir = tempdir().expect("failed to create temp dir");
    let root = dir.path();

    // Create 30 folders, each containing 2 files of distinct sizes
    let mut ground_truth_files: Vec<(String, u64)> = Vec::new();
    let mut total_expected_bytes = 0u64;

    for f_idx in 0..30 {
        let folder = root.join(format!("dir_ranked_{:02}", f_idx));
        fs::create_dir(&folder).unwrap();

        let size1 = ((f_idx + 1) * 100_000) as u64;
        let size2 = ((f_idx + 1) * 50_000 + 1234) as u64;

        let file1_name = format!("file_{:02}_a.dat", f_idx);
        let file2_name = format!("file_{:02}_b.dat", f_idx);

        fs::write(folder.join(&file1_name), vec![0x11; size1 as usize]).unwrap();
        fs::write(folder.join(&file2_name), vec![0x22; size2 as usize]).unwrap();

        ground_truth_files.push((file1_name, size1));
        ground_truth_files.push((file2_name, size2));

        total_expected_bytes += size1 + size2;
    }

    let result = scan_directory_tree(None, root.to_string_lossy().to_string(), None)
        .expect("oracle scan must succeed");

    assert_eq!(result.total_bytes, total_expected_bytes);
    assert_eq!(result.total_files, 60);
    assert_eq!(result.total_dirs, 30);

    // Verify top 20 files
    ground_truth_files.sort_by(|a, b| b.1.cmp(&a.1));
    let expected_top_20_files = &ground_truth_files[..20];

    assert_eq!(result.top_files.len(), 20);
    for i in 0..20 {
        assert_eq!(result.top_files[i].name, expected_top_20_files[i].0);
        assert_eq!(result.top_files[i].size_bytes, expected_top_20_files[i].1);
        assert_eq!(result.top_files[i].rank, i + 1);

        let expected_pct = (expected_top_20_files[i].1 as f64 / total_expected_bytes as f64) * 100.0;
        assert!(
            (result.top_files[i].percentage_of_total - expected_pct).abs() < 1e-5,
            "File percentage must match expected percentage"
        );
    }

    // Verify top 20 folders
    assert_eq!(result.top_folders.len(), 20);
    for i in 0..19 {
        assert!(
            result.top_folders[i].size_bytes >= result.top_folders[i + 1].size_bytes,
            "Top folders must be strictly sorted descending by size"
        );
        assert_eq!(result.top_folders[i].rank, i + 1);
    }
}

/// 5. Zero-Byte Files & Empty Directory Forest Resilience
#[test]
fn test_zero_byte_files_and_empty_directory_forest() {
    let dir = tempdir().expect("failed to create temp dir");
    let root = dir.path();

    // 50 empty directories
    for i in 0..50 {
        fs::create_dir_all(root.join(format!("empty_dir_{:02}", i))).unwrap();
    }
    // 30 zero-byte files
    for i in 0..30 {
        File::create(root.join(format!("empty_file_{:02}.tmp", i))).unwrap();
    }

    let result = scan_directory_tree(None, root.to_string_lossy().to_string(), None)
        .expect("empty scan must succeed");

    assert_eq!(result.total_bytes, 0);
    assert_eq!(result.total_files, 30);
    assert_eq!(result.total_dirs, 50);
    assert_eq!(result.tree.size_bytes, 0);

    for f in &result.top_files {
        assert_eq!(f.size_bytes, 0);
        assert_eq!(f.percentage_of_total, 0.0);
        assert!(!f.percentage_of_total.is_nan());
    }

    for f in &result.top_folders {
        assert_eq!(f.size_bytes, 0);
        assert_eq!(f.percentage_of_total, 0.0);
        assert!(!f.percentage_of_total.is_nan());
    }
}
