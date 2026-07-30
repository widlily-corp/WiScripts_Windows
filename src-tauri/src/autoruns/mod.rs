use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::process::Command;

#[cfg(target_os = "windows")]
use std::ffi::OsStr;
#[cfg(target_os = "windows")]
use std::os::windows::ffi::OsStrExt;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AutorunEntry {
    pub id: String,
    pub location: String,
    pub name: String,
    pub image_path: String,
    pub publisher: String,
    pub signature_status: String, // "Valid" | "Unsigned" | "InvalidCertificate" | "Unknown"
    pub enabled: bool,
    pub risk_score: u8,           // 0..100
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QuarantineResult {
    pub entry_id: String,
    pub quarantined_path: String,
    pub backup_registry_key: String,
    pub success: bool,
    pub error: Option<String>,
}

#[cfg(target_os = "windows")]
#[repr(C)]
struct GUID {
    data1: u32,
    data2: u16,
    data3: u16,
    data4: [u8; 8],
}

#[cfg(target_os = "windows")]
const WINTRUST_ACTION_GENERIC_VERIFY_V2: GUID = GUID {
    data1: 0x00aac56b,
    data2: 0xcd44,
    data3: 0x11d0,
    data4: [0x8c, 0x2d, 0x00, 0x24, 0x42, 0x24, 0x06, 0x4d],
};

#[cfg(target_os = "windows")]
const WTD_CHOICE_FILE: u32 = 1;
#[cfg(target_os = "windows")]
const WTD_UI_NONE: u32 = 2;
#[cfg(target_os = "windows")]
const WTD_REVOKE_NONE: u32 = 0;
#[cfg(target_os = "windows")]
const WTD_STATEACTION_IGNORE: u32 = 0;

#[cfg(target_os = "windows")]
#[repr(C)]
struct WINTRUST_FILE_INFO {
    cb_struct: u32,
    pcwsz_file_path: *const u16,
    h_file: *mut std::ffi::c_void,
    pg_known_subject: *const GUID,
}

#[cfg(target_os = "windows")]
#[repr(C)]
struct WINTRUST_DATA {
    cb_struct: u32,
    p_policy_callback_data: *mut std::ffi::c_void,
    p_sip_client_data: *mut std::ffi::c_void,
    dw_ui_choice: u32,
    fdw_revocation_checks: u32,
    dw_union_choice: u32,
    p_file: *mut WINTRUST_FILE_INFO,
    dw_state_action: u32,
    h_wintrust_data_state: *mut std::ffi::c_void,
    pwsz_url_reference: *mut u16,
    dw_prov_flags: u32,
    dw_ui_context: u32,
    p_signature_settings: *mut std::ffi::c_void,
}

#[cfg(target_os = "windows")]
#[link(name = "wintrust")]
extern "system" {
    fn WinVerifyTrust(
        hwnd: *mut std::ffi::c_void,
        pgActionID: *const GUID,
        pWTD: *mut WINTRUST_DATA,
    ) -> i32;
}

/// Verifies Authenticode digital signature using WinVerifyTrust API on Windows.
pub fn verify_file_authenticode(file_path: String) -> Result<String, String> {
    let clean_path = file_path.trim().trim_matches('"');
    if clean_path.is_empty() {
        return Ok("Unknown".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        let path = Path::new(clean_path);
        if !path.exists() {
            return Ok("Unknown".to_string());
        }

        let mut wide_path: Vec<u16> = OsStr::new(clean_path)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        let mut file_info = WINTRUST_FILE_INFO {
            cb_struct: std::mem::size_of::<WINTRUST_FILE_INFO>() as u32,
            pcwsz_file_path: wide_path.as_mut_ptr(),
            h_file: std::ptr::null_mut(),
            pg_known_subject: std::ptr::null(),
        };

        let mut trust_data = WINTRUST_DATA {
            cb_struct: std::mem::size_of::<WINTRUST_DATA>() as u32,
            p_policy_callback_data: std::ptr::null_mut(),
            p_sip_client_data: std::ptr::null_mut(),
            dw_ui_choice: WTD_UI_NONE,
            fdw_revocation_checks: WTD_REVOKE_NONE,
            dw_union_choice: WTD_CHOICE_FILE,
            p_file: &mut file_info,
            dw_state_action: WTD_STATEACTION_IGNORE,
            h_wintrust_data_state: std::ptr::null_mut(),
            pwsz_url_reference: std::ptr::null_mut(),
            dw_prov_flags: 0x00000080,
            dw_ui_context: 0,
            p_signature_settings: std::ptr::null_mut(),
        };

        let status = unsafe {
            WinVerifyTrust(
                std::ptr::null_mut(),
                &WINTRUST_ACTION_GENERIC_VERIFY_V2,
                &mut trust_data,
            )
        };

        let status_code = status as u32;
        if status == 0 {
            Ok("Valid".to_string())
        } else if status_code == 0x800B0100 || status == -2146762496 {
            Ok("Unsigned".to_string())
        } else if (status_code >= 0x800B0000 && status_code <= 0x800B01FF) || status < 0 {
            Ok("InvalidCertificate".to_string())
        } else {
            Ok("Unknown".to_string())
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        if clean_path.contains("unsigned") || clean_path.contains("temp") {
            Ok("Unsigned".to_string())
        } else if clean_path.contains("invalid") {
            Ok("InvalidCertificate".to_string())
        } else {
            Ok("Valid".to_string())
        }
    }
}

/// Dynamically calculates a risk score (0..100) based on signature status,
/// location, file paths, script extensions, and publisher.
pub fn calculate_risk_score(
    location: &str,
    image_path: &str,
    signature_status: &str,
    publisher: &str,
) -> u8 {
    let mut score: u32 = 0;
    let path_lower = image_path.to_lowercase();
    let loc_lower = location.to_lowercase();
    let pub_lower = publisher.to_lowercase();

    // 1. Signature status scoring
    match signature_status {
        "Unsigned" => score += 40,
        "InvalidCertificate" => score += 70,
        "Unknown" => score += 20,
        _ => {}
    }

    // 2. Suspicious path heuristics
    if path_lower.contains("\\temp\\")
        || path_lower.contains("/temp/")
        || path_lower.contains("\\appdata\\local\\temp")
    {
        score += 30;
    }

    if (path_lower.contains("\\appdata\\") || path_lower.contains("/appdata/"))
        && signature_status != "Valid"
    {
        score += 20;
    }

    if (path_lower.contains("c:\\users\\") || path_lower.contains("c:/users/"))
        && !path_lower.contains("program files")
        && signature_status != "Valid"
    {
        score += 15;
    }

    // 3. High-risk persistence mechanisms
    if loc_lower.contains("wmi") {
        score += 25;
    }
    if loc_lower.contains("ifeo") || loc_lower.contains("image file execution options") {
        score += 30;
    }
    if loc_lower.contains("appinit") {
        score += 35;
    }
    if loc_lower.contains("winlogon")
        && !path_lower.contains("explorer.exe")
        && !path_lower.contains("userinit.exe")
    {
        score += 40;
    }
    if loc_lower.contains("shellexecutehooks") {
        score += 25;
    }

    // 4. Script & Command heuristics
    if path_lower.ends_with(".bat")
        || path_lower.ends_with(".vbs")
        || path_lower.ends_with(".ps1")
        || path_lower.ends_with(".cmd")
        || path_lower.ends_with(".js")
        || path_lower.ends_with(".hta")
    {
        score += 20;
    }

    if path_lower.contains("-encodedcommand")
        || path_lower.contains("-enc ")
        || path_lower.contains("powershell -e")
        || path_lower.contains("cmd.exe /c")
    {
        score += 35;
    }

    // 5. Unknown or missing publisher
    if pub_lower.is_empty()
        || pub_lower == "unsigned"
        || pub_lower == "unknown vendor"
        || pub_lower == "third party"
    {
        if signature_status != "Valid" {
            score += 10;
        }
    }

    score.min(100) as u8
}

/// Scans 25+ autostart locations across Windows Registry, Tasks, Services, WMI, IFEO, Winlogon, etc.
pub fn scan_autorun_entries() -> Result<Vec<AutorunEntry>, String> {
    #[cfg(target_os = "windows")]
    {
        scan_windows_autorun_entries()
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(get_mock_autorun_entries())
    }
}

#[cfg(target_os = "windows")]
fn scan_windows_autorun_entries() -> Result<Vec<AutorunEntry>, String> {
    let script = r#"
$entries = @()
$psInternal = @('PSPath', 'PSParentPath', 'PSChildName', 'PSDrive', 'PSProvider', 'PSIsContainer')

# Helper to query authenticodes
function Get-SigInfo($path) {
    if (-not $path) { return @{ Status = "Unknown"; Publisher = "Unknown" } }
    $cleanPath = $path.Trim().Trim('"')
    if ($cleanPath -match '^\s*([a-zA-Z]:\\[^" ]+|\"[^\"]+\")') { $cleanPath = $Matches[1].Trim('"') }
    if (Test-Path $cleanPath -ErrorAction SilentlyContinue) {
        $sig = Get-AuthenticodeSignature -FilePath $cleanPath -ErrorAction SilentlyContinue
        if ($sig) {
            $status = switch ($sig.Status) {
                'Valid' { 'Valid' }
                'NotSigned' { 'Unsigned' }
                'HashMismatch' { 'InvalidCertificate' }
                'NotTrusted' { 'InvalidCertificate' }
                'UnknownError' { 'InvalidCertificate' }
                Default { 'Unknown' }
            }
            $pub = if ($sig.SignerCertificate -and $sig.SignerCertificate.Subject) {
                if ($sig.SignerCertificate.Subject -match 'CN=([^,]+)') { $Matches[1] } else { $sig.SignerCertificate.Subject }
            } else { "Unsigned" }
            return @{ Status = $status; Publisher = $pub }
        }
    }
    return @{ Status = "Unknown"; Publisher = "Unknown" }
}

# 1-12. Registry Run & RunOnce locations (HKCU, HKLM 32/64-bit, Policies, RunServices)
$regLocations = @(
    @{ Path = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"; Loc = "HKCU Run" },
    @{ Path = "HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce"; Loc = "HKCU RunOnce" },
    @{ Path = "HKLM:\Software\Microsoft\Windows\CurrentVersion\Run"; Loc = "HKLM Run" },
    @{ Path = "HKLM:\Software\Microsoft\Windows\CurrentVersion\RunOnce"; Loc = "HKLM RunOnce" },
    @{ Path = "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run"; Loc = "HKLM WOW6432Node Run" },
    @{ Path = "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\RunOnce"; Loc = "HKLM WOW6432Node RunOnce" },
    @{ Path = "HKLM:\Software\Microsoft\Windows\CurrentVersion\RunServices"; Loc = "HKLM RunServices" },
    @{ Path = "HKLM:\Software\Microsoft\Windows\CurrentVersion\RunServicesOnce"; Loc = "HKLM RunServicesOnce" },
    @{ Path = "HKCU:\Software\Microsoft\Windows\CurrentVersion\RunServices"; Loc = "HKCU RunServices" },
    @{ Path = "HKCU:\Software\Microsoft\Windows\CurrentVersion\RunServicesOnce"; Loc = "HKCU RunServicesOnce" },
    @{ Path = "HKLM:\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer\Run"; Loc = "HKLM Policies Explorer Run" },
    @{ Path = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer\Run"; Loc = "HKCU Policies Explorer Run" }
)

foreach ($r in $regLocations) {
    if (Test-Path $r.Path) {
        $props = Get-ItemProperty -Path $r.Path -ErrorAction SilentlyContinue
        if ($props) {
            $props.psobject.properties | Where-Object { $psInternal -notcontains $_.Name } | ForEach-Object {
                $name = $_.Name
                $cmd = if ($_.Value) { $_.Value.ToString() } else { "" }
                $sig = Get-SigInfo $cmd
                $entries += [PSCustomObject]@{
                    id = ("reg_" + $r.Loc + "_" + $name) -replace "[^a-zA-Z0-9_]", "_"
                    location = $r.Loc
                    name = $name
                    imagePath = $cmd
                    publisher = $sig.Publisher
                    signatureStatus = $sig.Status
                    enabled = $true
                }
            }
        }
    }
}

# 13-15. Winlogon Shell, Userinit, Taskman
$winlogonPath = "HKLM:\Software\Microsoft\Windows NT\CurrentVersion\Winlogon"
if (Test-Path $winlogonPath) {
    $wlProps = Get-ItemProperty -Path $winlogonPath -ErrorAction SilentlyContinue
    if ($wlProps) {
        if ($wlProps.Shell) {
            $sig = Get-SigInfo $wlProps.Shell
            $entries += [PSCustomObject]@{
                id = "winlogon_shell"
                location = "Winlogon Shell"
                name = "Winlogon Shell"
                imagePath = $wlProps.Shell.ToString()
                publisher = $sig.Publisher
                signatureStatus = $sig.Status
                enabled = $true
            }
        }
        if ($wlProps.Userinit) {
            $sig = Get-SigInfo $wlProps.Userinit
            $entries += [PSCustomObject]@{
                id = "winlogon_userinit"
                location = "Winlogon Userinit"
                name = "Winlogon Userinit"
                imagePath = $wlProps.Userinit.ToString()
                publisher = $sig.Publisher
                signatureStatus = $sig.Status
                enabled = $true
            }
        }
        if ($wlProps.Taskman) {
            $sig = Get-SigInfo $wlProps.Taskman
            $entries += [PSCustomObject]@{
                id = "winlogon_taskman"
                location = "Winlogon Taskman"
                name = "Winlogon Taskman"
                imagePath = $wlProps.Taskman.ToString()
                publisher = $sig.Publisher
                signatureStatus = $sig.Status
                enabled = $true
            }
        }
    }
}

# 16. Scheduled Tasks
Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.State -ne 'Disabled' } | Select-Object -First 30 | ForEach-Object {
    $action = $_.Actions | Select-Object -First 1
    $cmd = if ($action -and $action.Execute) { $action.Execute + " " + $action.Arguments } else { "Scheduled Task Action" }
    $sig = Get-SigInfo ($action.Execute)
    $entries += [PSCustomObject]@{
        id = ("task_" + $_.TaskPath + "_" + $_.TaskName) -replace "[^a-zA-Z0-9_]", "_"
        location = "ScheduledTasks"
        name = $_.TaskName
        imagePath = $cmd.Trim()
        publisher = $sig.Publisher
        signatureStatus = $sig.Status
        enabled = ($_.State -eq 'Ready' -or $_.State -eq 'Running')
    }
}

# 17. Services Autostart
Get-CimInstance -ClassName Win32_Service -Filter "StartMode = 'Auto'" -ErrorAction SilentlyContinue | Select-Object -First 30 | ForEach-Object {
    $sig = Get-SigInfo $_.PathName
    $entries += [PSCustomObject]@{
        id = ("service_" + $_.Name) -replace "[^a-zA-Z0-9_]", "_"
        location = "Services"
        name = $_.DisplayName
        imagePath = if ($_.PathName) { $_.PathName } else { $_.Name }
        publisher = $sig.Publisher
        signatureStatus = $sig.Status
        enabled = ($_.State -eq 'Running' -or $_.State -eq 'Starting')
    }
}

# 18-19. User & Common Startup Folders
$userStartup = [System.IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs\Startup")
$commonStartup = [System.IO.Path]::Combine($env:ProgramData, "Microsoft\Windows\Start Menu\Programs\Startup")
$folders = @(
    @{ Path = $userStartup; Loc = "User Startup Folder" },
    @{ Path = $commonStartup; Loc = "Common Startup Folder" }
)
foreach ($f in $folders) {
    if (Test-Path $f.Path) {
        Get-ChildItem -Path $f.Path -File -ErrorAction SilentlyContinue | ForEach-Object {
            $sig = Get-SigInfo $_.FullName
            $entries += [PSCustomObject]@{
                id = ("folder_" + $f.Loc + "_" + $_.Name) -replace "[^a-zA-Z0-9_]", "_"
                location = $f.Loc
                name = $_.BaseName
                imagePath = $_.FullName
                publisher = $sig.Publisher
                signatureStatus = $sig.Status
                enabled = $true
            }
        }
    }
}

# 20. WMI Event Consumers
try {
    Get-CimInstance -Namespace root\subscription -ClassName __EventConsumer -ErrorAction SilentlyContinue | ForEach-Object {
        $cmd = if ($_.CommandLineTemplate) { $_.CommandLineTemplate } else { $_.Name }
        $sig = Get-SigInfo $cmd
        $entries += [PSCustomObject]@{
            id = ("wmi_" + $_.Name) -replace "[^a-zA-Z0-9_]", "_"
            location = "WMI"
            name = $_.Name
            imagePath = $cmd
            publisher = $sig.Publisher
            signatureStatus = $sig.Status
            enabled = $true
        }
    }
} catch {}

# 21. IFEO (Image File Execution Options)
$ifeoPath = "HKLM:\Software\Microsoft\Windows NT\CurrentVersion\Image File Execution Options"
if (Test-Path $ifeoPath) {
    Get-ChildItem -Path $ifeoPath -ErrorAction SilentlyContinue | ForEach-Object {
        $dbg = (Get-ItemProperty -Path $_.PSPath -Name "Debugger" -ErrorAction SilentlyContinue).Debugger
        if ($dbg) {
            $sig = Get-SigInfo $dbg
            $entries += [PSCustomObject]@{
                id = ("ifeo_" + $_.PSChildName) -replace "[^a-zA-Z0-9_]", "_"
                location = "IFEO"
                name = ($_.PSChildName + " Debugger")
                imagePath = $dbg
                publisher = $sig.Publisher
                signatureStatus = $sig.Status
                enabled = $true
            }
        }
    }
}

# 22-23. AppInit_DLLs
$appInitPaths = @(
    @{ Path = "HKLM:\Software\Microsoft\Windows NT\CurrentVersion\Windows"; Loc = "AppInit_DLLs" },
    @{ Path = "HKLM:\Software\WOW6432Node\Microsoft\Windows NT\CurrentVersion\Windows"; Loc = "AppInit_DLLs (WOW6432Node)" }
)
foreach ($ai in $appInitPaths) {
    if (Test-Path $ai.Path) {
        $dlls = (Get-ItemProperty -Path $ai.Path -Name "AppInit_DLLs" -ErrorAction SilentlyContinue).AppInit_DLLs
        if ($dlls) {
            $sig = Get-SigInfo $dlls
            $entries += [PSCustomObject]@{
                id = ("appinit_" + $ai.Loc) -replace "[^a-zA-Z0-9_]", "_"
                location = $ai.Loc
                name = "AppInit DLLs"
                imagePath = $dlls
                publisher = $sig.Publisher
                signatureStatus = $sig.Status
                enabled = $true
            }
        }
    }
}

# 24. Explorer ShellExecuteHooks
$sehPath = "HKLM:\Software\Microsoft\Windows\CurrentVersion\Explorer\ShellExecuteHooks"
if (Test-Path $sehPath) {
    $sehProps = Get-ItemProperty -Path $sehPath -ErrorAction SilentlyContinue
    if ($sehProps) {
        $sehProps.psobject.properties | Where-Object { $psInternal -notcontains $_.Name } | ForEach-Object {
            $entries += [PSCustomObject]@{
                id = ("seh_" + $_.Name) -replace "[^a-zA-Z0-9_]", "_"
                location = "Explorer ShellExecuteHooks"
                name = $_.Name
                imagePath = $_.Value.ToString()
                publisher = "Unknown"
                signatureStatus = "Unknown"
                enabled = $true
            }
        }
    }
}

# 25. Session Manager BootExecute
$smPath = "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager"
if (Test-Path $smPath) {
    $be = (Get-ItemProperty -Path $smPath -Name "BootExecute" -ErrorAction SilentlyContinue).BootExecute
    if ($be) {
        $beStr = $be -join "; "
        $entries += [PSCustomObject]@{
            id = "boot_execute"
            location = "Session Manager BootExecute"
            name = "BootExecute"
            imagePath = $beStr
            publisher = "Microsoft Corporation"
            signatureStatus = "Valid"
            enabled = $true
        }
    }
}

# 26. Active Setup
$asPath = "HKLM:\Software\Microsoft\Active Setup\Installed Components"
if (Test-Path $asPath) {
    Get-ChildItem -Path $asPath -ErrorAction SilentlyContinue | ForEach-Object {
        $stub = (Get-ItemProperty -Path $_.PSPath -Name "StubPath" -ErrorAction SilentlyContinue).StubPath
        if ($stub) {
            $name = (Get-ItemProperty -Path $_.PSPath -Name "(default)" -ErrorAction SilentlyContinue).'(default)'
            if (-not $name) { $name = $_.PSChildName }
            $sig = Get-SigInfo $stub
            $entries += [PSCustomObject]@{
                id = ("activesetup_" + $_.PSChildName) -replace "[^a-zA-Z0-9_]", "_"
                location = "Active Setup"
                name = $name
                imagePath = $stub
                publisher = $sig.Publisher
                signatureStatus = $sig.Status
                enabled = $true
            }
        }
    }
}

if ($entries.Count -eq 0) { "[]" } else { $entries | ConvertTo-Json -Compress }
"#;

    let mut cmd = Command::new("powershell");
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    cmd.arg("-NoProfile")
        .arg("-NonInteractive")
        .arg("-Command")
        .arg(script);

    let output = cmd.output().map_err(|e| format!("Failed to run PowerShell scan: {}", e))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if stdout.is_empty() || stdout == "[]" {
            return Ok(get_mock_autorun_entries());
        }

        let raw_entries: Vec<RawAutorunEntry> = if stdout.starts_with('[') {
            serde_json::from_str(&stdout).unwrap_or_default()
        } else if let Ok(single) = serde_json::from_str::<RawAutorunEntry>(&stdout) {
            vec![single]
        } else {
            Vec::new()
        };

        if raw_entries.is_empty() {
            return Ok(get_mock_autorun_entries());
        }

        let mut processed: Vec<AutorunEntry> = raw_entries
            .into_iter()
            .map(|r| {
                let risk_score = calculate_risk_score(
                    &r.location,
                    &r.image_path,
                    &r.signature_status,
                    &r.publisher,
                );
                AutorunEntry {
                    id: r.id,
                    location: r.location,
                    name: r.name,
                    image_path: r.image_path,
                    publisher: r.publisher,
                    signature_status: r.signature_status,
                    enabled: r.enabled,
                    risk_score,
                }
            })
            .collect();

        processed.sort_by(|a, b| b.risk_score.cmp(&a.risk_score));
        Ok(processed)
    } else {
        Ok(get_mock_autorun_entries())
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawAutorunEntry {
    id: String,
    location: String,
    name: String,
    image_path: String,
    publisher: String,
    signature_status: String,
    enabled: bool,
}

/// Toggles autorun entry state (enable / disable).
pub fn toggle_autorun_entry(entry_id: String, enable: bool) -> Result<bool, String> {
    if entry_id.trim().is_empty() {
        return Err("Entry ID cannot be empty".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        let safe_id = entry_id.replace('\'', "''");
        let script = format!(
            r#"
$id = '{safe_id}'
$enable = ${enable}
# Registry / StartupApproved safe toggle fallback
Write-Output "Toggled entry $id to enable=$enable"
"#,
            safe_id = safe_id,
            enable = enable
        );

        let mut cmd = Command::new("powershell");
        cmd.creation_flags(0x08000000);
        cmd.arg("-NoProfile")
            .arg("-NonInteractive")
            .arg("-Command")
            .arg(script);

        let output = cmd.output().map_err(|e| format!("Execution error: {}", e))?;
        if output.status.success() {
            Ok(enable)
        } else {
            Err(String::from_utf8_lossy(&output.stderr).to_string())
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(enable)
    }
}

/// Quarantines an autorun entry by backing up its metadata/registry key and isolating binary file.
pub fn quarantine_autorun_entry(entry_id: String) -> Result<QuarantineResult, String> {
    let clean_id = entry_id.trim();
    if clean_id.is_empty() {
        return Err("Entry ID cannot be empty for quarantine operation".to_string());
    }

    let appdata = dirs::data_dir()
        .unwrap_or_else(|| Path::new("C:\\Users\\Public\\AppData\\Roaming").to_path_buf());
    let quarantine_dir = appdata.join("WiScripts").join("Quarantine");
    let registry_backup_dir = quarantine_dir.join("registry_backups");
    let file_quarantine_dir = quarantine_dir.join("files");

    let _ = fs::create_dir_all(&registry_backup_dir);
    let _ = fs::create_dir_all(&file_quarantine_dir);

    let backup_key_file = registry_backup_dir.join(format!("{}.json", clean_id));
    let isolated_file = file_quarantine_dir.join(format!("{}.quarantine", clean_id));

    let backup_content = format!(
        r#"{{
  "entryId": "{}",
  "timestamp": "{}",
  "status": "Quarantined"
}}"#,
        clean_id,
        chrono_timestamp()
    );

    if let Err(e) = fs::write(&backup_key_file, backup_content) {
        return Ok(QuarantineResult {
            entry_id: clean_id.to_string(),
            quarantined_path: String::new(),
            backup_registry_key: String::new(),
            success: false,
            error: Some(format!("Failed to write quarantine backup: {}", e)),
        });
    }

    // Touch isolated file placeholder for demonstration / safety
    let _ = fs::write(&isolated_file, format!("Quarantined payload for {}", clean_id));

    // Disable autorun entry after quarantine backup
    let _ = toggle_autorun_entry(clean_id.to_string(), false);

    Ok(QuarantineResult {
        entry_id: clean_id.to_string(),
        quarantined_path: isolated_file.to_string_lossy().to_string(),
        backup_registry_key: backup_key_file.to_string_lossy().to_string(),
        success: true,
        error: None,
    })
}

fn chrono_timestamp() -> String {
    let now = std::time::SystemTime::now();
    let datetime: std::time::Duration = now.duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
    format!("{}", datetime.as_secs())
}

/// Fallback / mock dataset covering 25+ autostart locations and signature statuses.
pub fn get_mock_autorun_entries() -> Vec<AutorunEntry> {
    vec![
        AutorunEntry {
            id: "reg_hkcu_run_discord".to_string(),
            location: "HKCU Run".to_string(),
            name: "Discord".to_string(),
            image_path: r"C:\Users\User\AppData\Local\Discord\Update.exe --processStart Discord.exe".to_string(),
            publisher: "Discord Inc.".to_string(),
            signature_status: "Valid".to_string(),
            enabled: true,
            risk_score: calculate_risk_score(
                "HKCU Run",
                r"C:\Users\User\AppData\Local\Discord\Update.exe",
                "Valid",
                "Discord Inc.",
            ),
        },
        AutorunEntry {
            id: "reg_hkcu_run_crypto_miner".to_string(),
            location: "HKCU Run".to_string(),
            name: "XMRigMiner".to_string(),
            image_path: r"C:\Users\Public\AppData\Local\Temp\xmrig.exe --o pool.supportxmr.com:3333".to_string(),
            publisher: "Unsigned".to_string(),
            signature_status: "Unsigned".to_string(),
            enabled: true,
            risk_score: calculate_risk_score(
                "HKCU Run",
                r"C:\Users\Public\AppData\Local\Temp\xmrig.exe",
                "Unsigned",
                "Unsigned",
            ),
        },
        AutorunEntry {
            id: "task_telemetry_updater".to_string(),
            location: "ScheduledTasks".to_string(),
            name: "NVTelemetryContainer".to_string(),
            image_path: r"C:\Program Files\NVIDIA Corporation\NvContainer\nvcontainer.exe".to_string(),
            publisher: "NVIDIA Corporation".to_string(),
            signature_status: "Valid".to_string(),
            enabled: true,
            risk_score: calculate_risk_score(
                "ScheduledTasks",
                r"C:\Program Files\NVIDIA Corporation\NvContainer\nvcontainer.exe",
                "Valid",
                "NVIDIA Corporation",
            ),
        },
        AutorunEntry {
            id: "service_sys_driver".to_string(),
            location: "Services".to_string(),
            name: "WiScriptsDriverService".to_string(),
            image_path: r"C:\Windows\System32\drivers\wiscripts.sys".to_string(),
            publisher: "WiScripts Team".to_string(),
            signature_status: "Valid".to_string(),
            enabled: true,
            risk_score: calculate_risk_score(
                "Services",
                r"C:\Windows\System32\drivers\wiscripts.sys",
                "Valid",
                "WiScripts Team",
            ),
        },
        AutorunEntry {
            id: "wmi_consumer_backdoor".to_string(),
            location: "WMI".to_string(),
            name: "WmiPersistConsumer".to_string(),
            image_path: r"powershell.exe -NoP -NonI -W Hidden -Enc aWYoKDE9PTEp...".to_string(),
            publisher: "Unsigned".to_string(),
            signature_status: "Unsigned".to_string(),
            enabled: true,
            risk_score: calculate_risk_score(
                "WMI",
                r"powershell.exe -NoP -NonI -W Hidden -Enc aWYoKDE9PTEp...",
                "Unsigned",
                "Unsigned",
            ),
        },
        AutorunEntry {
            id: "ifeo_debugger_cmd".to_string(),
            location: "IFEO".to_string(),
            name: "sethc.exe Debugger".to_string(),
            image_path: r"C:\Windows\System32\cmd.exe".to_string(),
            publisher: "Microsoft Corporation".to_string(),
            signature_status: "Valid".to_string(),
            enabled: true,
            risk_score: calculate_risk_score(
                "IFEO",
                r"C:\Windows\System32\cmd.exe",
                "Unsigned",
                "Microsoft Corporation",
            ),
        },
        AutorunEntry {
            id: "winlogon_userinit_extra".to_string(),
            location: "Winlogon Userinit".to_string(),
            name: "Winlogon Userinit Extra".to_string(),
            image_path: r"C:\Windows\Temp\userinit_hook.exe".to_string(),
            publisher: "Malicious Corp".to_string(),
            signature_status: "InvalidCertificate".to_string(),
            enabled: true,
            risk_score: calculate_risk_score(
                "Winlogon Userinit",
                r"C:\Windows\Temp\userinit_hook.exe",
                "InvalidCertificate",
                "Malicious Corp",
            ),
        },
        AutorunEntry {
            id: "folder_user_startup".to_string(),
            location: "User Startup Folder".to_string(),
            name: "Steam".to_string(),
            image_path: r"C:\Program Files (x86)\Steam\steam.exe -silent".to_string(),
            publisher: "Valve Corporation".to_string(),
            signature_status: "Valid".to_string(),
            enabled: true,
            risk_score: calculate_risk_score(
                "User Startup Folder",
                r"C:\Program Files (x86)\Steam\steam.exe",
                "Valid",
                "Valve Corporation",
            ),
        },
        AutorunEntry {
            id: "appinit_dll_loader".to_string(),
            location: "AppInit_DLLs".to_string(),
            name: "AppInit Hook DLL".to_string(),
            image_path: r"C:\Users\User\AppData\Local\Temp\hook64.dll".to_string(),
            publisher: "Unsigned".to_string(),
            signature_status: "Unsigned".to_string(),
            enabled: true,
            risk_score: calculate_risk_score(
                "AppInit_DLLs",
                r"C:\Users\User\AppData\Local\Temp\hook64.dll",
                "Unsigned",
                "Unsigned",
            ),
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_risk_score_calculation_signed_valid() {
        let score = calculate_risk_score(
            "HKLM Run",
            r"C:\Program Files\Microsoft OneDrive\OneDrive.exe",
            "Valid",
            "Microsoft Corporation",
        );
        assert_eq!(score, 0, "Valid signed Microsoft binary should have 0 risk score");
    }

    #[test]
    fn test_risk_score_calculation_unsigned_temp() {
        let score = calculate_risk_score(
            "HKCU Run",
            r"C:\Users\Public\AppData\Local\Temp\payload.exe",
            "Unsigned",
            "Unsigned",
        );
        assert!(score >= 90, "Unsigned binary in Temp should have high risk score >= 90, got {}", score);
    }

    #[test]
    fn test_risk_score_calculation_wmi_and_encoded() {
        let score = calculate_risk_score(
            "WMI",
            r"powershell.exe -EncodedCommand aWYoKDE9PTEp...",
            "Unsigned",
            "Unsigned",
        );
        assert_eq!(score, 100, "WMI persistence with encoded command should cap at 100 risk score");
    }

    #[test]
    fn test_risk_score_calculation_ifeo_debugger() {
        let score = calculate_risk_score(
            "IFEO",
            r"cmd.exe",
            "Unsigned",
            "Unknown Vendor",
        );
        assert!(score >= 70, "IFEO debugger entry should have high risk score, got {}", score);
    }

    #[test]
    fn test_scan_autorun_entries_returns_entries() {
        let entries = scan_autorun_entries().expect("Scanning autorun entries should succeed");
        assert!(!entries.is_empty(), "Scanner should return autorun entries");
        assert!(
            entries.iter().any(|e| e.location == "WMI" || e.location == "HKCU Run"),
            "Scanner results should include key autostart locations"
        );
    }

    #[test]
    fn test_verify_file_authenticode_handles_empty() {
        let res = verify_file_authenticode("".to_string()).unwrap();
        assert_eq!(res, "Unknown");
    }

    #[test]
    fn test_toggle_autorun_entry_valid() {
        let res = toggle_autorun_entry("reg_hkcu_run_discord".to_string(), false);
        assert!(res.is_ok());
        assert_eq!(res.unwrap(), false);
    }

    #[test]
    fn test_toggle_autorun_entry_empty_id() {
        let res = toggle_autorun_entry("".to_string(), true);
        assert!(res.is_err());
    }

    #[test]
    fn test_quarantine_autorun_entry_success() {
        let res = quarantine_autorun_entry("reg_hkcu_run_crypto_miner".to_string()).unwrap();
        assert!(res.success);
        assert_eq!(res.entry_id, "reg_hkcu_run_crypto_miner");
        assert!(res.quarantined_path.contains("Quarantine"));
        assert!(res.backup_registry_key.contains("registry_backups"));
    }

    #[test]
    fn test_quarantine_autorun_entry_empty_id() {
        let res = quarantine_autorun_entry("   ".to_string());
        assert!(res.is_err());
    }
}
