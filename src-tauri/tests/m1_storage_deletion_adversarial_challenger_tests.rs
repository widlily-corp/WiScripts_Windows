use std::fs;
use std::path::Path;
use tempfile::tempdir;
use wiscripts_windows_lib::storage::{
    calculate_target_size, check_path_protection_status, delete_filesystem_items,
    is_drive_root, is_system_protected_path, validate_path_deletion_guardrail,
};

/// 1. Absolute Path Traversal with Relative Components (`.`, `..`)
#[test]
fn test_adversarial_absolute_path_traversal() {
    let traversal_vectors = [
        r"C:\Windows\..\Windows\System32",
        r"C:\Program Files\..",
        r"C:\Program Files (x86)\..",
        r"C:\Users\..\Windows",
        r"C:\Users\Public\..\..\Windows\System32\cmd.exe",
        r"C:\Users\Default\..\..\ProgramData",
        r"C:\fake_nonexistent_dir\..\Windows",
        r"C:\fake_nonexistent_dir\..\..\..\..\Windows\System32",
        r"C:\Users\Public\..\..\System Volume Information",
        r"C:\Users\Public\..\..\$Recycle.Bin",
        r"C:\Windows\System32\..\..\Windows\SysWOW64",
    ];

    for vector in traversal_vectors {
        let p = Path::new(vector);
        let (prot, reason) = is_system_protected_path(p);
        assert!(
            prot,
            "Path traversal vector '{}' MUST be detected as protected system path! Reason: {:?}",
            vector, reason
        );
        assert!(
            reason.is_some(),
            "Path traversal vector '{}' must have protection reason",
            vector
        );

        let guard_res = validate_path_deletion_guardrail(p);
        assert!(
            guard_res.is_err(),
            "validate_path_deletion_guardrail MUST reject traversal vector '{}'",
            vector
        );

        // Test through deletion engine batch
        let del_res = delete_filesystem_items(vec![vector.to_string()], true).unwrap();
        assert_eq!(
            del_res.items_deleted, 0,
            "Deletion engine must NOT delete traversal vector '{}'",
            vector
        );
        assert_eq!(
            del_res.item_reports[0].success, false,
            "Item report must indicate failure for '{}'",
            vector
        );
        assert!(
            del_res.item_reports[0]
                .error
                .as_ref()
                .unwrap()
                .contains("Security Violation"),
            "Error message must state Security Violation for '{}'",
            vector
        );
    }
}

/// 2. Adversarial Forward Slashes vs Backslashes vs Mixed/Multiple Slashes
#[test]
fn test_adversarial_forward_and_mixed_slashes_bypass_attempts() {
    let slash_vectors = [
        "C:/Windows",
        "c:/windows/system32",
        "C:/Windows/SysWOW64/drivers",
        "C:////Windows////System32",
        r"c:\windows/system32\drivers/etc\hosts",
        "C:/Program Files",
        "C:/Program Files (x86)",
        "C:/ProgramData",
        "c:/$recycle.bin",
        "c:/system volume information",
        "C:/System Volume Information/test",
        "D:/System Volume Information",
        "C:/pagefile.sys",
        "c:/boot",
        "c:/bootmgr",
        "C:/Users/Public",
        "C:/Users/Default",
        "c:/Users",
    ];

    for vector in slash_vectors {
        let p = Path::new(vector);
        let (prot, reason) = is_system_protected_path(p);
        assert!(
            prot,
            "Slash variant vector '{}' MUST be detected as protected system path! Reason: {:?}",
            vector, reason
        );
        assert!(
            reason.is_some(),
            "Slash variant vector '{}' must have protection reason",
            vector
        );

        let status = check_path_protection_status(vector);
        assert!(
            status.is_protected,
            "check_path_protection_status MUST report protected for '{}'",
            vector
        );

        let del_res = delete_filesystem_items(vec![vector.to_string()], true).unwrap();
        assert_eq!(
            del_res.items_deleted, 0,
            "Deletion engine must block slash vector '{}'",
            vector
        );
    }
}

/// 3. Adversarial Case-Insensitivity & Exotic Casing on Windows System Paths
#[test]
fn test_adversarial_case_insensitivity_and_exotic_casing() {
    let casing_vectors = [
        r"c:\WiNdOwS",
        r"C:\WiNdOwS\sYsTeM32",
        r"c:\WiNdOwS\sYsTeM32\cMd.ExE",
        r"C:\SYSTEM VOLUME INFORMATION",
        r"c:\sYsTeM vOlUmE iNfOrMaTiOn",
        r"c:\$rEcYcLe.BiN",
        r"C:\pRoGrAm FiLeS",
        r"C:\pRoGrAm FiLeS (x86)",
        r"C:\pRoGrAmDaTa",
        r"c:\UsErS\pUbLiC",
        r"C:\uSeRs\DeFaUlT",
        r"c:\UsErS",
        r"c:\BoOt",
        r"C:\bOoTmGr",
        r"c:\PaGeFiLe.SyS",
        r"c:\HiBeRfIl.SyS",
        r"C:\sWaPfIlE.sYs",
    ];

    for vector in casing_vectors {
        let p = Path::new(vector);
        let (prot, reason) = is_system_protected_path(p);
        assert!(
            prot,
            "Exotic casing vector '{}' MUST be detected as protected system path! Reason: {:?}",
            vector, reason
        );
        assert!(
            reason.is_some(),
            "Exotic casing vector '{}' must have protection reason",
            vector
        );

        let del_res = delete_filesystem_items(vec![vector.to_string()], true).unwrap();
        assert_eq!(
            del_res.items_deleted, 0,
            "Deletion engine must block exotic casing vector '{}'",
            vector
        );
    }
}

/// 4. Standard Root Drives & Slashes
#[test]
fn test_standard_root_drive_variants() {
    let root_vectors = [
        r"C:\",
        r"C:",
        r"c:",
        r"c:\",
        "C:/",
        "c:/",
        r"C:\\",
        "C://",
        r"D:\",
        r"D:",
        r"d:",
        r"d:\",
        r"E:\",
        r"Z:\",
        r"z:",
        r"\",
        "/",
        r"\\",
        "//",
    ];

    for vector in root_vectors {
        let p = Path::new(vector);
        let (prot, reason) = is_system_protected_path(p);
        assert!(
            prot,
            "Root drive vector '{}' MUST be detected as protected root! Reason: {:?}",
            vector, reason
        );
        assert!(
            reason.is_some(),
            "Root drive vector '{}' must have protection reason",
            vector
        );

        let del_res = delete_filesystem_items(vec![vector.to_string()], true).unwrap();
        assert_eq!(
            del_res.items_deleted, 0,
            "Deletion engine must block root drive vector '{}'",
            vector
        );
    }
}

/// 5. Empirical Verification of Vulnerability 1: UNC Extended Prefix (`\\?\C:`)
#[test]
fn test_empirical_vulnerability_unc_drive_root_bypass() {
    let unc_drive_vectors = [
        r"\\?\C:",
        r"\\?\C:\",
        r"\\?\c:",
        r"\\?\c:\",
        r"\\?\D:",
        r"\\?\D:\",
        r"\??\C:",
        r"\??\C:\",
        r"\??\c:",
        r"\??\c:\",
        r"\\.\C:",
        r"\\.\C:\",
        r"\\.\c:",
        r"\\.\c:\",
        r"//?/c:/",
        r"//?/C:/",
        r"//./c:/",
    ];

    for unc_drive in unc_drive_vectors {
        let is_root = is_drive_root(unc_drive);
        assert!(
            is_root,
            "is_drive_root('{}') MUST return true for UNC drive root!",
            unc_drive
        );

        let p = Path::new(unc_drive);
        let (is_prot, reason) = is_system_protected_path(p);
        assert!(
            is_prot,
            "UNC drive prefix '{}' MUST be detected as protected drive root! Reason: {:?}",
            unc_drive, reason
        );
        assert!(
            reason.is_some() && reason.unwrap().contains("Drive root"),
            "Reason for '{}' must state drive root protection",
            unc_drive
        );

        assert!(
            validate_path_deletion_guardrail(p).is_err(),
            "validate_path_deletion_guardrail MUST reject UNC drive root '{}'",
            unc_drive
        );

        let del_res = delete_filesystem_items(vec![unc_drive.to_string()], true).unwrap();
        assert_eq!(
            del_res.items_deleted, 0,
            "Deletion engine must NOT delete UNC drive root '{}'",
            unc_drive
        );
        assert_eq!(del_res.item_reports[0].success, false);
        assert!(
            del_res.item_reports[0]
                .error
                .as_ref()
                .unwrap()
                .contains("Security Violation"),
            "Error for '{}' must indicate Security Violation",
            unc_drive
        );
    }
}

/// 6. Empirical Verification of Vulnerability 2: Unanchored Relative System Paths
#[test]
fn test_empirical_vulnerability_relative_path_without_anchor() {
    let rel_system_paths = [
        r"..\..\..\..\Windows",
        r"..\..\..\Windows\System32",
        r"..\..\..\..\Windows\System32\cmd.exe",
        r"Windows",
        r"windows",
        r"WINDOWS",
        r"Windows\System32",
        r"System32",
        r"system32",
        r"SYSTEM32",
        r"SysWOW64",
        r"syswow64",
        r"WinSxS",
        r"winsxs",
        r"..\..\..\..\Program Files",
        r"..\..\..\..\ProgramData",
        r"..\..\..\..\System Volume Information",
        r"..\..\..\..\$Recycle.Bin",
        r"ProgramData",
        r"Users",
        r"boot",
        r"bootmgr",
        r"bootnxt",
        r"bootstat.dat",
        r"efi",
        r"recovery",
        r"pagefile.sys",
        r"hiberfil.sys",
        r"swapfile.sys",
        r"dumpstack.log",
        r"dumpstack.log.tmp",
        r"memory.dmp",
        r".\Windows",
        r".\System32",
    ];

    for rel_path in rel_system_paths {
        let p = Path::new(rel_path);
        let (is_prot, reason) = is_system_protected_path(p);
        assert!(
            is_prot,
            "Relative/bare system path '{}' MUST be detected as protected system path! Reason: {:?}",
            rel_path, reason
        );
        assert!(
            reason.is_some(),
            "Relative/bare system path '{}' must have a protection reason",
            rel_path
        );

        assert!(
            validate_path_deletion_guardrail(p).is_err(),
            "validate_path_deletion_guardrail MUST reject relative system path '{}'",
            rel_path
        );

        let del_res = delete_filesystem_items(vec![rel_path.to_string()], true).unwrap();
        assert_eq!(
            del_res.items_deleted, 0,
            "Deletion engine must NOT delete relative system path '{}'",
            rel_path
        );
        assert_eq!(del_res.item_reports[0].success, false);
        assert!(
            del_res.item_reports[0]
                .error
                .as_ref()
                .unwrap()
                .contains("Security Violation"),
            "Error for '{}' must indicate Security Violation",
            rel_path
        );
    }
}

/// 7. Readonly Attributes on Files & Directories during Permanent Deletion
#[test]
fn test_readonly_attributes_permanent_deletion_single_and_nested() {
    let dir = tempdir().expect("failed to create temp dir");

    // Single readonly file
    let single_readonly = dir.path().join("readonly_single.txt");
    fs::write(&single_readonly, b"Readonly single file content test").unwrap();
    let mut perms = fs::metadata(&single_readonly).unwrap().permissions();
    perms.set_readonly(true);
    fs::set_permissions(&single_readonly, perms).unwrap();
    assert!(fs::metadata(&single_readonly).unwrap().permissions().readonly());

    let res1 = delete_filesystem_items(
        vec![single_readonly.to_string_lossy().to_string()],
        true,
    )
    .unwrap();
    assert_eq!(res1.items_deleted, 1);
    assert_eq!(res1.bytes_freed, 33);
    assert_eq!(res1.errors.len(), 0);
    assert!(!single_readonly.exists());

    // Deep nested directory structure (3 levels) with readonly attributes at every level
    let nested_root = dir.path().join("readonly_nested_root");
    let level1 = nested_root.join("level1_dir");
    let level2 = level1.join("level2_dir");
    let level3 = level2.join("level3_dir");
    fs::create_dir_all(&level3).unwrap();

    let f1 = nested_root.join("root_file.bin");
    let f2 = level1.join("level1_file.bin");
    let f3 = level2.join("level2_file.bin");
    let f4 = level3.join("level3_file.bin");

    fs::write(&f1, vec![0xAAu8; 100]).unwrap();
    fs::write(&f2, vec![0xBBu8; 200]).unwrap();
    fs::write(&f3, vec![0xCCu8; 300]).unwrap();
    fs::write(&f4, vec![0xDDu8; 400]).unwrap();

    // Mark all files as readonly
    for file_path in [&f1, &f2, &f3, &f4] {
        let mut p = fs::metadata(file_path).unwrap().permissions();
        p.set_readonly(true);
        fs::set_permissions(file_path, p).unwrap();
        assert!(fs::metadata(file_path).unwrap().permissions().readonly());
    }

    // Mark directories as readonly (Windows allows directory readonly attribute)
    for dir_path in [&level3, &level2, &level1, &nested_root] {
        let mut p = fs::metadata(dir_path).unwrap().permissions();
        p.set_readonly(true);
        fs::set_permissions(dir_path, p).unwrap();
    }

    // Pre-calculate target size
    let expected_size = calculate_target_size(&nested_root);
    assert_eq!(expected_size, 1000);

    // Delete nested directory permanently
    let res2 = delete_filesystem_items(
        vec![nested_root.to_string_lossy().to_string()],
        true,
    )
    .unwrap();
    assert_eq!(res2.items_deleted, 1);
    assert_eq!(res2.bytes_freed, 1000);
    assert_eq!(res2.errors.len(), 0);
    assert!(!nested_root.exists(), "Entire readonly nested tree must be permanently deleted");
}

/// 8. Recycle Bin Deletion on Non-Protected Paths
#[test]
fn test_recycle_bin_deletion_safe_paths() {
    let dir = tempdir().expect("failed to create temp dir");

    // Single file to recycle bin
    let test_file = dir.path().join("recycle_file_test.dat");
    fs::write(&test_file, vec![0x42u8; 512]).unwrap();
    assert!(test_file.exists());

    let res_file = delete_filesystem_items(
        vec![test_file.to_string_lossy().to_string()],
        false,
    )
    .unwrap();
    assert_eq!(res_file.items_deleted, 1);
    assert_eq!(res_file.bytes_freed, 512);
    assert_eq!(res_file.errors.len(), 0);
    assert_eq!(res_file.item_reports.len(), 1);
    assert!(res_file.item_reports[0].success);
    assert!(!test_file.exists(), "File must no longer exist at original path");

    // Directory tree to recycle bin
    let test_folder = dir.path().join("recycle_folder_test");
    let test_sub = test_folder.join("sub");
    fs::create_dir_all(&test_sub).unwrap();
    let f1 = test_folder.join("a.txt");
    let f2 = test_sub.join("b.txt");
    fs::write(&f1, vec![0x11u8; 128]).unwrap();
    fs::write(&f2, vec![0x22u8; 256]).unwrap();

    let res_folder = delete_filesystem_items(
        vec![test_folder.to_string_lossy().to_string()],
        false,
    )
    .unwrap();
    assert_eq!(res_folder.items_deleted, 1);
    assert_eq!(res_folder.bytes_freed, 384);
    assert_eq!(res_folder.errors.len(), 0);
    assert!(res_folder.item_reports[0].success);
    assert!(!test_folder.exists(), "Folder must no longer exist at original path");
}

/// 9. Heterogeneous Batch Deletion & Error Containment
#[test]
fn test_heterogeneous_batch_deletion_and_error_containment() {
    let dir = tempdir().expect("failed to create temp dir");

    let safe_file = dir.path().join("safe_batch_file.txt");
    fs::write(&safe_file, b"Safe file content 12345").unwrap();

    let safe_readonly_file = dir.path().join("safe_readonly_batch.txt");
    fs::write(&safe_readonly_file, b"Safe readonly content ABC").unwrap();
    let mut perms = fs::metadata(&safe_readonly_file).unwrap().permissions();
    perms.set_readonly(true);
    fs::set_permissions(&safe_readonly_file, perms).unwrap();

    let protected_system = r"C:\Windows\System32".to_string();
    let protected_root = r"C:\".to_string();
    let nonexistent_path = dir.path().join("non_existent_file_987654.xyz").to_string_lossy().to_string();

    let batch = vec![
        safe_file.to_string_lossy().to_string(),
        protected_system,
        safe_readonly_file.to_string_lossy().to_string(),
        protected_root,
        nonexistent_path,
    ];

    let res = delete_filesystem_items(batch, true).unwrap();

    // Verify exactly 2 items deleted (the 2 safe files)
    assert_eq!(res.items_deleted, 2);
    assert_eq!(res.bytes_freed, 23 + 25);
    assert_eq!(res.errors.len(), 3);
    assert_eq!(res.item_reports.len(), 5);

    // Verify safe files are deleted
    assert!(!safe_file.exists());
    assert!(!safe_readonly_file.exists());

    // Verify reports
    assert!(res.item_reports[0].success);
    assert!(!res.item_reports[1].success);
    assert!(res.item_reports[1].error.as_ref().unwrap().contains("Security Violation"));
    assert!(res.item_reports[2].success);
    assert!(!res.item_reports[3].success);
    assert!(res.item_reports[3].error.as_ref().unwrap().contains("Security Violation"));
    assert!(!res.item_reports[4].success);
    assert!(res.item_reports[4].error.as_ref().unwrap().contains("Item not found"));
}

/// 10. False Positive Prevention (Legitimate User Folders Allowed)
#[test]
fn test_false_positive_prevention_safe_user_paths() {
    let dir = tempdir().expect("failed to create temp dir");

    // Folders with names resembling system names inside user space
    let my_boot_folder = dir.path().join("my_boot");
    fs::create_dir_all(&my_boot_folder).unwrap();
    let my_boot_file = my_boot_folder.join("boot_config.json");
    fs::write(&my_boot_file, b"{\"boot\": true}").unwrap();

    let my_recovery_folder = dir.path().join("recovery");
    fs::create_dir_all(&my_recovery_folder).unwrap();
    let my_recovery_file = my_recovery_folder.join("backup.dat");
    fs::write(&my_recovery_file, vec![0x55u8; 64]).unwrap();

    let my_dumpstack = dir.path().join("dumpstack.log");
    fs::write(&my_dumpstack, b"custom user log").unwrap();

    let test_paths = [&my_boot_folder, &my_recovery_folder, &my_dumpstack];

    for p in test_paths {
        let (prot, reason) = is_system_protected_path(p);
        assert!(
            !prot,
            "Legitimate user path {:?} must NOT be falsely identified as protected system path! Reason: {:?}",
            p, reason
        );

        let status = check_path_protection_status(p);
        assert!(!status.is_protected);
        assert_eq!(status.protection_level, "Safe");

        assert!(
            validate_path_deletion_guardrail(p).is_ok(),
            "validate_path_deletion_guardrail must succeed for user path {:?}",
            p
        );
    }

    // Verify they can be deleted
    let paths_to_delete: Vec<String> = test_paths
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect();

    let res = delete_filesystem_items(paths_to_delete, true).unwrap();
    assert_eq!(res.items_deleted, 3);
    assert_eq!(res.errors.len(), 0);
    for p in test_paths {
        assert!(!p.exists());
    }
}

/// 11. Empty batch edge case
#[test]
fn test_empty_batch_deletion() {
    let res = delete_filesystem_items(vec![], true).unwrap();
    assert_eq!(res.items_deleted, 0);
    assert_eq!(res.bytes_freed, 0);
    assert_eq!(res.errors.len(), 0);
    assert_eq!(res.item_reports.len(), 0);
}
