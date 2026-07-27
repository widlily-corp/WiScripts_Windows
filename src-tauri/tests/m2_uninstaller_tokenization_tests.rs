use wiscripts_windows_lib::uninstaller::{parse_uninstall_string, uninstall_app, InstalledApp};

#[test]
fn test_parse_uninstall_string_standard_cases() {
    // Standard Quoted Executable
    let (prog, args) = parse_uninstall_string("\"C:\\Program Files\\Vendor\\App\\uninstall.exe\" /S /all");
    assert_eq!(prog, "C:\\Program Files\\Vendor\\App\\uninstall.exe");
    assert_eq!(args, vec!["/S", "/all"]);

    // Standard Unquoted Executable ending in .exe
    let (prog, args) = parse_uninstall_string("C:\\Program Files\\Vendor\\App\\uninstall.exe /quiet");
    assert_eq!(prog, "C:\\Program Files\\Vendor\\App\\uninstall.exe");
    assert_eq!(args, vec!["/quiet"]);

    // Standard MSI GUID with msiexec
    let (prog, args) = parse_uninstall_string("msiexec.exe /x {12345678-1234-1234-1234-1234567890AB}");
    assert_eq!(prog, "msiexec.exe");
    assert_eq!(args, vec!["/x", "{12345678-1234-1234-1234-1234567890AB}"]);

    // Bare GUID without msiexec prefix
    let (prog, args) = parse_uninstall_string("{ABCD1234-1111-2222-3333-444455556666}");
    assert_eq!(prog, "msiexec.exe");
    assert_eq!(args, vec!["/x", "{ABCD1234-1111-2222-3333-444455556666}"]);

    // MSI command with quiet switch /qn
    let (prog, args) = parse_uninstall_string("MsiExec.exe /I{87654321-4321-4321-4321-BA0987654321} /qn");
    assert_eq!(prog, "msiexec.exe");
    assert_eq!(args, vec!["/x", "{87654321-4321-4321-4321-BA0987654321}", "/qn"]);
}

#[test]
fn test_parse_uninstall_string_edge_cases_and_flaws() {
    // 1. Edge Case: MSI extra parameters drop bug
    let (prog, args) = parse_uninstall_string(
        "MsiExec.exe /X{12345678-1234-1234-1234-1234567890AB} /norestart /L*V \"C:\\log.txt\" REMOVE=ALL"
    );
    assert_eq!(prog, "msiexec.exe");
    println!("MSI extra flags test result args: {:?}", args);

    // 2. Edge Case: Path containing 'msiexec' string + argument containing '{GUID}'
    let (prog, args) = parse_uninstall_string(
        "\"C:\\Tools\\msiexec_helper\\custom_uninstaller.exe\" {A1B2C3D4-1234-5678-90AB-CDEF12345678} /silent"
    );
    println!("Custom uninstaller with msiexec in path: prog='{}', args={:?}", prog, args);

    // 3. Edge Case: Directory containing '.exe' substring before actual executable
    let (prog, args) = parse_uninstall_string("C:\\Program Files\\my.exe_tools\\uninstall.exe /quiet");
    println!("Path with .exe in folder name: prog='{}', args={:?}", prog, args);

    // 4. Edge Case: Unquoted non-exe script (e.g. .bat / .cmd)
    let (prog, args) = parse_uninstall_string("C:\\Program Files\\My App\\uninstall.bat /silent");
    println!("Unquoted .bat script: prog='{}', args={:?}", prog, args);

    // 5. Empty and whitespace input
    let (prog, args) = parse_uninstall_string("   ");
    assert_eq!(prog, "");
    assert!(args.is_empty());

    // 6. Cyrillic path
    let (prog, args) = parse_uninstall_string("\"C:\\Программы\\Приложение\\uninstall.exe\" /quiet");
    assert_eq!(prog, "C:\\Программы\\Приложение\\uninstall.exe");
    assert_eq!(args, vec!["/quiet"]);

    // 7. Unicode byte-length shift string (Turkish capital İ)
    let turkish_cmd = "C:\\Users\\İtest\\uninstall.exe /S";
    let (prog, args) = parse_uninstall_string(turkish_cmd);
    println!("Turkish I dot path result: prog='{}', args={:?}", prog, args);
}

#[test]
fn test_uninstall_app_dry_run_execution() {
    let app = InstalledApp {
        id: "app_1".to_string(),
        name: "Sample App".to_string(),
        version: Some("2.0".to_string()),
        publisher: Some("Vendor".to_string()),
        uninstall_string: Some("\"C:\\Program Files\\Sample\\uninstall.exe\" /quiet".to_string()),
        display_icon: None,
        estimated_size_kb: Some(2048),
        install_date: Some("20260301".to_string()),
        registry_path: "HKLM\\Software\\...".to_string(),
        is_system_component: false,
        quiet_uninstall_string: None,
        install_location: None,
    };

    let summary = uninstall_app(&app, true).expect("Dry-run uninstall should succeed");
    assert!(summary.is_dry_run);
    assert!(summary.success);
    assert_eq!(summary.executed_actions.len(), 1);
    assert_eq!(summary.executed_actions[0].command, "C:\\Program Files\\Sample\\uninstall.exe /quiet");
}
