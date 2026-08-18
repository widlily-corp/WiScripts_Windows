use std::fs::File;
use std::io::Write;
use tempfile::tempdir;
use wiscripts_windows_lib::storage::{
    compute_file_hash, compute_partial_file_hash, DuplicateFileItem, DuplicateGroup,
};

#[test]
fn test_small_files_header_hash_reuse_exact_equality() {
    let dir = tempdir().expect("failed to create temp dir");

    // Test sizes <= 4096 bytes: 1, 64, 512, 1024, 2048, 4095, 4096
    let test_sizes = [1, 64, 512, 1024, 2048, 4095, 4096];

    for sz in test_sizes {
        let file_path = dir.path().join(format!("small_file_{}.bin", sz));
        let content: Vec<u8> = (0..sz).map(|i| ((i * 31 + 7) % 256) as u8).collect();
        {
            let mut f = File::create(&file_path).unwrap();
            f.write_all(&content).unwrap();
            f.sync_all().unwrap();
        }

        let partial_hash = compute_partial_file_hash(&file_path)
            .expect("compute_partial_file_hash failed");
        let full_hash = compute_file_hash(&file_path)
            .expect("compute_file_hash failed");

        assert_eq!(
            partial_hash, full_hash,
            "For size {} (<= 4096 bytes), partial hash must EXACTLY equal full hash",
            sz
        );
    }
}

#[test]
fn test_large_files_partial_hash_collision_full_hash_differentiation() {
    let dir = tempdir().expect("failed to create temp dir");

    // Create 3 files of size 8192 bytes:
    // file_a and file_b have identical 4096-byte headers but different bytes at index 4097
    // file_c has different header
    let file_a_path = dir.path().join("file_a.bin");
    let file_b_path = dir.path().join("file_b.bin");
    let file_c_path = dir.path().join("file_c.bin");

    let content_a = vec![0x33u8; 8192];
    let mut content_b = vec![0x33u8; 8192];
    let content_c = vec![0x44u8; 8192];

    // Alter byte in file_b after 4KB
    content_b[4096] = 0x99;
    content_b[7000] = 0x88;

    std::fs::write(&file_a_path, &content_a).unwrap();
    std::fs::write(&file_b_path, &content_b).unwrap();
    std::fs::write(&file_c_path, &content_c).unwrap();

    let partial_a = compute_partial_file_hash(&file_a_path).unwrap();
    let partial_b = compute_partial_file_hash(&file_b_path).unwrap();
    let partial_c = compute_partial_file_hash(&file_c_path).unwrap();

    // Partial hashes: a and b must match, c must differ
    assert_eq!(
        partial_a, partial_b,
        "Files A and B share identical 4KB header, so partial hashes must match"
    );
    assert_ne!(
        partial_a, partial_c,
        "File C has different header, so partial hash must differ"
    );

    // Full hashes: a, b, and c must ALL differ
    let full_a = compute_file_hash(&file_a_path).unwrap();
    let full_b = compute_file_hash(&file_b_path).unwrap();
    let full_c = compute_file_hash(&file_c_path).unwrap();

    assert_ne!(
        full_a, full_b,
        "Files A and B differ after 4KB, full hashes must differ"
    );
    assert_ne!(
        full_a, full_c,
        "Files A and C differ, full hashes must differ"
    );
}

#[test]
fn test_exact_boundary_transition_4096_vs_4097_bytes() {
    let dir = tempdir().expect("failed to create temp dir");

    // 4096 byte file
    let path_4096 = dir.path().join("exact_4096.bin");
    let content_4096 = vec![0xAAu8; 4096];
    std::fs::write(&path_4096, &content_4096).unwrap();

    let part_4096 = compute_partial_file_hash(&path_4096).unwrap();
    let full_4096 = compute_file_hash(&path_4096).unwrap();
    assert_eq!(part_4096, full_4096, "At 4096 bytes, partial == full hash");

    // 4097 byte file where byte 4096 is different from 0xAA
    let path_4097 = dir.path().join("exact_4097.bin");
    let mut content_4097 = vec![0xAAu8; 4097];
    content_4097[4096] = 0xFF;
    std::fs::write(&path_4097, &content_4097).unwrap();

    let part_4097 = compute_partial_file_hash(&path_4097).unwrap();
    let full_4097 = compute_file_hash(&path_4097).unwrap();
    assert_eq!(part_4096, part_4097, "4KB headers match across 4096 and 4097 files");
    assert_ne!(part_4097, full_4097, "At 4097 bytes, partial != full hash due to 4097th byte");
}

#[test]
fn test_storage_duplicate_grouping_and_savings_sort_order() {
    // Test duplicate group sorting logic: savings = size * (count - 1) descending
    let mut groups = vec![
        DuplicateGroup {
            hash: "hash_small_many".to_string(),
            size_bytes: 100,
            files: vec![
                DuplicateFileItem { path: "p1".into(), size_bytes: 100, modified_timestamp: 10 },
                DuplicateFileItem { path: "p2".into(), size_bytes: 100, modified_timestamp: 10 },
                DuplicateFileItem { path: "p3".into(), size_bytes: 100, modified_timestamp: 10 },
                DuplicateFileItem { path: "p4".into(), size_bytes: 100, modified_timestamp: 10 },
            ], // savings = 100 * (4 - 1) = 300
        },
        DuplicateGroup {
            hash: "hash_large_few".to_string(),
            size_bytes: 10000,
            files: vec![
                DuplicateFileItem { path: "p5".into(), size_bytes: 10000, modified_timestamp: 20 },
                DuplicateFileItem { path: "p6".into(), size_bytes: 10000, modified_timestamp: 20 },
            ], // savings = 10000 * (2 - 1) = 10000
        },
        DuplicateGroup {
            hash: "hash_medium".to_string(),
            size_bytes: 1000,
            files: vec![
                DuplicateFileItem { path: "p7".into(), size_bytes: 1000, modified_timestamp: 30 },
                DuplicateFileItem { path: "p8".into(), size_bytes: 1000, modified_timestamp: 30 },
                DuplicateFileItem { path: "p9".into(), size_bytes: 1000, modified_timestamp: 30 },
            ], // savings = 1000 * (3 - 1) = 2000
        },
    ];

    // Sort duplicate groups by potential savings (size * (count - 1)) descending
    groups.sort_by(|a, b| {
        let savings_a = a.size_bytes * (a.files.len() as u64 - 1);
        let savings_b = b.size_bytes * (b.files.len() as u64 - 1);
        savings_b.cmp(&savings_a)
    });

    assert_eq!(groups[0].hash, "hash_large_few");  // savings = 10,000
    assert_eq!(groups[1].hash, "hash_medium");     // savings = 2,000
    assert_eq!(groups[2].hash, "hash_small_many"); // savings = 300
}
