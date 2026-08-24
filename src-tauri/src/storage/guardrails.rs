use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::path::{Component, Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PathProtectionStatus {
    pub path: String,
    pub is_protected: bool,
    pub reason: Option<String>,
    pub protection_level: String,
}

/// Strips Windows extended-path prefix `\\?\`, `\??\`, or `\\.\` if present.
pub fn strip_unc_prefix(path: PathBuf) -> PathBuf {
    let s = path.to_string_lossy();
    let s_norm = s.replace('/', "\\");
    if let Some(stripped) = s_norm.strip_prefix(r"\\?\unc\") {
        PathBuf::from(format!(r"\\{}", stripped))
    } else if let Some(stripped) = s_norm.strip_prefix(r"\\?\UNC\") {
        PathBuf::from(format!(r"\\{}", stripped))
    } else if let Some(stripped) = s_norm.strip_prefix(r"\\?\") {
        PathBuf::from(stripped)
    } else if let Some(stripped) = s_norm.strip_prefix(r"\??\") {
        PathBuf::from(stripped)
    } else if let Some(stripped) = s_norm.strip_prefix(r"\\.\") {
        PathBuf::from(stripped)
    } else {
        path
    }
}

/// Normalizes path components without touching filesystem (resolves `.`, `..`, slashes).
pub fn normalize_path(p: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for comp in p.components() {
        match comp {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            Component::Normal(c) => {
                out.push(c);
            }
            Component::Prefix(p_val) => {
                let prefix_str = p_val.as_os_str().to_string_lossy();
                let prefix_norm = prefix_str.replace('/', "\\");
                let stripped = prefix_norm
                    .strip_prefix(r"\\?\")
                    .or_else(|| prefix_norm.strip_prefix(r"\??\"))
                    .or_else(|| prefix_norm.strip_prefix(r"\\.\"))
                    .unwrap_or(&prefix_norm);
                out.push(stripped);
            }
            Component::RootDir => {
                out.push(comp.as_os_str());
            }
        }
    }
    out
}

/// Canonicalizes a path if possible, or normalizes it as fallback, stripping `\\?\`.
pub fn resolve_and_normalize_path<P: AsRef<Path>>(path: P) -> PathBuf {
    let raw = path.as_ref();
    let raw_str = raw.to_string_lossy();
    let raw_norm = raw_str.replace('/', "\\");
    let raw_stripped = raw_norm
        .strip_prefix(r"\\?\")
        .or_else(|| raw_norm.strip_prefix(r"\??\"))
        .or_else(|| raw_norm.strip_prefix(r"\\.\"))
        .unwrap_or(&raw_norm);

    // Do not canonicalize bare drive letters like "C:" because on Windows "C:" resolves to current working directory
    if is_drive_root(raw_stripped.trim_end_matches('\\')) {
        return strip_unc_prefix(normalize_path(Path::new(raw_stripped)));
    }

    if let Ok(canon) = raw.canonicalize() {
        return strip_unc_prefix(canon);
    }

    // If raw path is relative:
    if raw.is_relative() {
        let unanchored = normalize_path(Path::new(raw_stripped));
        let unanchored_str = unanchored.to_string_lossy().replace('/', "\\").to_lowercase();
        let unanchored_trimmed = unanchored_str.trim_end_matches('\\');

        // Check if unanchored path targets core Windows system names
        let system_root_str = std::env::var("SystemRoot")
            .or_else(|_| std::env::var("WINDIR"))
            .unwrap_or_else(|_| r"C:\Windows".to_string())
            .replace('/', "\\");
        let system_root = Path::new(&system_root_str);
        let system_drive_prefix = if system_root_str.len() >= 2 && system_root_str.chars().nth(1) == Some(':') {
            &system_root_str[..2]
        } else {
            "C:"
        };
        let system_drive_root = PathBuf::from(format!(r"{}\", system_drive_prefix));

        if unanchored_trimmed == "system32" || unanchored_trimmed.starts_with(r"system32\")
            || unanchored_trimmed == "syswow64" || unanchored_trimmed.starts_with(r"syswow64\")
            || unanchored_trimmed == "winsxs" || unanchored_trimmed.starts_with(r"winsxs\")
        {
            let sys_target = system_root.join(&unanchored);
            if let Ok(canon) = sys_target.canonicalize() {
                return strip_unc_prefix(canon);
            }
            return strip_unc_prefix(normalize_path(&sys_target));
        }

        if unanchored_trimmed == "windows" || unanchored_trimmed.starts_with(r"windows\")
            || unanchored_trimmed == "program files" || unanchored_trimmed.starts_with(r"program files\")
            || unanchored_trimmed == "program files (x86)" || unanchored_trimmed.starts_with(r"program files (x86)\")
            || unanchored_trimmed == "programdata" || unanchored_trimmed.starts_with(r"programdata\")
            || unanchored_trimmed == "users" || unanchored_trimmed.starts_with(r"users\")
            || unanchored_trimmed == "system volume information" || unanchored_trimmed.starts_with(r"system volume information\")
            || unanchored_trimmed == "$recycle.bin" || unanchored_trimmed.starts_with(r"$recycle.bin\")
            || unanchored_trimmed == "$winreagent" || unanchored_trimmed.starts_with(r"$winreagent\")
            || unanchored_trimmed == "boot" || unanchored_trimmed.starts_with(r"boot\")
            || unanchored_trimmed == "bootmgr"
            || unanchored_trimmed == "bootnxt"
            || unanchored_trimmed == "bootstat.dat"
            || unanchored_trimmed == "efi" || unanchored_trimmed.starts_with(r"efi\")
            || unanchored_trimmed == "recovery" || unanchored_trimmed.starts_with(r"recovery\")
            || unanchored_trimmed == "pagefile.sys"
            || unanchored_trimmed == "hiberfil.sys"
            || unanchored_trimmed == "swapfile.sys"
            || unanchored_trimmed == "dumpstack.log"
            || unanchored_trimmed == "dumpstack.log.tmp"
            || unanchored_trimmed == "memory.dmp"
        {
            let drive_target = system_drive_root.join(&unanchored);
            if let Ok(canon) = drive_target.canonicalize() {
                return strip_unc_prefix(canon);
            }
            return strip_unc_prefix(normalize_path(&drive_target));
        }

        // Try resolving against CWD
        if let Ok(cwd) = std::env::current_dir() {
            let combined = cwd.join(raw);
            if let Ok(canon) = combined.canonicalize() {
                return strip_unc_prefix(canon);
            }
            return strip_unc_prefix(normalize_path(&combined));
        }
    }

    strip_unc_prefix(normalize_path(Path::new(raw_stripped)))
}

/// Checks if normalized string represents a root drive (e.g. "c:", "c:\", "d:", "d:\", "\", "/", "\\?\C:", "\\?\C:\")
pub fn is_drive_root(s: &str) -> bool {
    let s_norm = s.replace('/', "\\");
    let stripped = s_norm
        .strip_prefix(r"\\?\")
        .or_else(|| s_norm.strip_prefix(r"\??\"))
        .or_else(|| s_norm.strip_prefix(r"\\.\"))
        .unwrap_or(&s_norm);

    let trimmed = stripped.trim_end_matches('\\');
    if trimmed.is_empty() || trimmed == "\\" {
        return true;
    }
    // Check "c:", "d:", etc. (2 chars: letter + colon)
    if trimmed.len() == 2 && trimmed.ends_with(':') {
        let first = trimmed.chars().next().unwrap();
        if first.is_ascii_alphabetic() {
            return true;
        }
    }
    false
}

/// Determines if the given path is a protected Windows operating system directory or file.
/// Returns `(is_protected, reason)`.
pub fn is_system_protected_path(path: &Path) -> (bool, Option<&'static str>) {
    let raw_str = path.to_string_lossy();
    let raw_norm = raw_str.replace('/', "\\").to_lowercase();
    let raw_stripped = raw_norm
        .strip_prefix(r"\\?\")
        .or_else(|| raw_norm.strip_prefix(r"\??\"))
        .or_else(|| raw_norm.strip_prefix(r"\\.\"))
        .unwrap_or(&raw_norm);
    let raw_trimmed = raw_stripped.trim_end_matches('\\');

    // 1. Raw Drive Root check (e.g. C:, C:\, D:, D:\, \\?\C:, \\?\C:\)
    if is_drive_root(raw_trimmed) {
        return (true, Some("Drive root deletion is strictly forbidden"));
    }

    let resolved = resolve_and_normalize_path(path);
    let resolved_str = resolved.to_string_lossy();
    let norm = resolved_str.replace('/', "\\").to_lowercase();
    let norm_stripped = norm
        .strip_prefix(r"\\?\")
        .or_else(|| norm.strip_prefix(r"\??\"))
        .or_else(|| norm.strip_prefix(r"\\.\"))
        .unwrap_or(&norm);
    let norm_trimmed = norm_stripped.trim_end_matches('\\');

    if is_drive_root(norm_trimmed) {
        return (true, Some("Drive root deletion is strictly forbidden"));
    }

    // Also compute purely unanchored normalized path (without CWD) to detect bare/relative system names
    let unanchored = normalize_path(Path::new(raw_stripped));
    let unanchored_str = unanchored.to_string_lossy().replace('/', "\\").to_lowercase();
    let unanchored_trimmed = unanchored_str.trim_end_matches('\\');

    // 2. Windows Root & Subpaths (e.g. C:\Windows, C:\Windows\System32, SysWOW64, WinSxS)
    let system_root = std::env::var("SystemRoot")
        .or_else(|_| std::env::var("WINDIR"))
        .unwrap_or_else(|_| r"C:\Windows".to_string())
        .replace('/', "\\")
        .to_lowercase();
    let system_root_stripped = system_root
        .strip_prefix(r"\\?\")
        .unwrap_or(&system_root);
    let system_root_trimmed = system_root_stripped.trim_end_matches('\\');

    if norm_trimmed == system_root_trimmed
        || norm_trimmed.starts_with(&format!("{}\\", system_root_trimmed))
        || raw_trimmed == system_root_trimmed
        || raw_trimmed.starts_with(&format!("{}\\", system_root_trimmed))
        || unanchored_trimmed == "windows"
        || unanchored_trimmed.starts_with(r"windows\")
    {
        return (true, Some("Windows SystemRoot and its subdirectories cannot be deleted"));
    }

    // Common Windows directory pattern fallback if drive letter differs or unanchored
    if norm_trimmed.ends_with(r"\windows")
        || norm_trimmed.contains(r"\windows\")
        || norm_trimmed.ends_with(r"\windows\system32")
        || norm_trimmed.contains(r"\windows\system32\")
        || norm_trimmed.ends_with(r"\windows\syswow64")
        || norm_trimmed.contains(r"\windows\syswow64\")
        || norm_trimmed.ends_with(r"\windows\winsxs")
        || norm_trimmed.contains(r"\windows\winsxs\")
        || unanchored_trimmed == "system32"
        || unanchored_trimmed.starts_with(r"system32\")
        || unanchored_trimmed == "syswow64"
        || unanchored_trimmed.starts_with(r"syswow64\")
        || unanchored_trimmed == "winsxs"
        || unanchored_trimmed.starts_with(r"winsxs\")
    {
        return (true, Some("Windows core system directory is protected"));
    }

    // 3. System Volume Information & Recycle Bin on any volume
    if norm_trimmed.ends_with(r"\system volume information")
        || norm_trimmed.contains(r"\system volume information\")
        || raw_trimmed.ends_with(r"\system volume information")
        || raw_trimmed.contains(r"\system volume information\")
        || unanchored_trimmed == "system volume information"
        || unanchored_trimmed.starts_with(r"system volume information\")
    {
        return (true, Some("System Volume Information is a protected OS structure"));
    }
    if norm_trimmed.ends_with(r"\$recycle.bin")
        || norm_trimmed.contains(r"\$recycle.bin\")
        || norm_trimmed.ends_with(r"\$winreagent")
        || norm_trimmed.contains(r"\$winreagent\")
        || raw_trimmed.ends_with(r"\$recycle.bin")
        || raw_trimmed.contains(r"\$recycle.bin\")
        || raw_trimmed.ends_with(r"\$winreagent")
        || raw_trimmed.contains(r"\$winreagent\")
        || unanchored_trimmed == "$recycle.bin"
        || unanchored_trimmed.starts_with(r"$recycle.bin\")
        || unanchored_trimmed == "$winreagent"
        || unanchored_trimmed.starts_with(r"$winreagent\")
    {
        return (true, Some("System recovery and Recycle Bin directories are protected"));
    }

    // 4. Critical Boot, EFI, Recovery and Crash Dumps
    let critical_exact_suffixes = [
        r"\boot",
        r"\efi",
        r"\recovery",
        r"\bootmgr",
        r"\bootnxt",
        r"\bootstat.dat",
        r"\pagefile.sys",
        r"\hiberfil.sys",
        r"\swapfile.sys",
        r"\dumpstack.log",
        r"\dumpstack.log.tmp",
        r"\memory.dmp",
    ];

    for suffix in critical_exact_suffixes {
        let bare_name = suffix.trim_start_matches('\\');
        let bare_dir_prefix = format!(r"{}\", bare_name);
        if unanchored_trimmed == bare_name || unanchored_trimmed.starts_with(&bare_dir_prefix) {
            return (true, Some("Critical OS boot, swap or recovery file is protected"));
        }
        if norm_trimmed.ends_with(suffix) || raw_trimmed.ends_with(suffix) {
            if let Some(idx) = norm_trimmed.rfind(suffix) {
                let prefix = &norm_trimmed[..idx];
                if is_drive_root(prefix) || prefix.is_empty() {
                    return (true, Some("Critical OS boot, swap or recovery file is protected"));
                }
            }
            if let Some(idx) = raw_trimmed.rfind(suffix) {
                let prefix = &raw_trimmed[..idx];
                if is_drive_root(prefix) || prefix.is_empty() {
                    return (true, Some("Critical OS boot, swap or recovery file is protected"));
                }
            }
        }
    }

    // 5. Protected Program & System roots (Exact match prevents deleting entire folder)
    let program_files = std::env::var("ProgramFiles")
        .unwrap_or_else(|_| r"C:\Program Files".to_string())
        .replace('/', "\\")
        .to_lowercase();
    let program_files_trimmed = program_files.trim_end_matches('\\');

    let program_files_x86 = std::env::var("ProgramFiles(x86)")
        .unwrap_or_else(|_| r"C:\Program Files (x86)".to_string())
        .replace('/', "\\")
        .to_lowercase();
    let program_files_x86_trimmed = program_files_x86.trim_end_matches('\\');

    let program_data = std::env::var("ProgramData")
        .unwrap_or_else(|_| r"C:\ProgramData".to_string())
        .replace('/', "\\")
        .to_lowercase();
    let program_data_trimmed = program_data.trim_end_matches('\\');

    if norm_trimmed == program_files_trimmed
        || norm_trimmed == program_files_x86_trimmed
        || norm_trimmed == program_data_trimmed
        || raw_trimmed == program_files_trimmed
        || raw_trimmed == program_files_x86_trimmed
        || raw_trimmed == program_data_trimmed
        || unanchored_trimmed == "program files"
        || unanchored_trimmed == "program files (x86)"
        || unanchored_trimmed == "programdata"
    {
        return (true, Some("Deletion of entire Program Files or ProgramData root is blocked"));
    }

    // 6. Users Directory Root & Critical User Roots
    if (norm_trimmed.ends_with(r"\users") && is_drive_root(&norm_trimmed[..norm_trimmed.len() - 6]))
        || unanchored_trimmed == "users"
    {
        return (true, Some("Deletion of the Users root folder is blocked"));
    }
    if norm_trimmed.ends_with(r"\users\default")
        || norm_trimmed.ends_with(r"\users\public")
        || unanchored_trimmed == r"users\default"
        || unanchored_trimmed == r"users\public"
    {
        return (true, Some("Default and Public user profile roots are protected"));
    }

    // Protect active user profile directory root itself (e.g. C:\Users\Username)
    if let Ok(user_profile) = std::env::var("USERPROFILE") {
        let user_prof_norm = user_profile.replace('/', "\\").to_lowercase();
        let user_prof_trimmed = user_prof_norm.trim_end_matches('\\');
        if norm_trimmed == user_prof_trimmed || raw_trimmed == user_prof_trimmed {
            return (true, Some("Deletion of current user profile root is blocked"));
        }
    }

    (false, None)
}

/// Evaluates path protection and returns detailed status for frontend consumption.
pub fn check_path_protection_status<P: AsRef<Path>>(path: P) -> PathProtectionStatus {
    let p = path.as_ref();
    let path_str = p.to_string_lossy().to_string();
    let resolved = resolve_and_normalize_path(p);
    let raw_check = is_system_protected_path(p);
    let (is_protected, reason_opt) = if raw_check.0 {
        raw_check
    } else {
        is_system_protected_path(&resolved)
    };

    let protection_level = if !is_protected {
        "Safe".to_string()
    } else if let Some(r) = reason_opt {
        if r.contains("Drive root") {
            "DriveRoot".to_string()
        } else if r.contains("SystemRoot") || r.contains("Windows") {
            "CriticalSystem".to_string()
        } else if r.contains("Program") || r.contains("Users") {
            "SystemRoot".to_string()
        } else {
            "ProtectedDirectory".to_string()
        }
    } else {
        "CriticalSystem".to_string()
    };

    PathProtectionStatus {
        path: path_str,
        is_protected,
        reason: reason_opt.map(|s| s.to_string()),
        protection_level,
    }
}

/// Guardrail validation function for deletion operations.
/// Returns `Ok(canonical_path)` if safe, or `Err(AppError::InvalidConfig)` if protected.
pub fn validate_path_deletion_guardrail<P: AsRef<Path>>(path: P) -> Result<PathBuf, AppError> {
    let p = path.as_ref();
    let resolved = resolve_and_normalize_path(p);
    let raw_check = is_system_protected_path(p);
    let (is_protected, reason) = if raw_check.0 {
        raw_check
    } else {
        is_system_protected_path(&resolved)
    };

    if is_protected {
        let msg = reason.unwrap_or("Protected Windows system component cannot be deleted");
        log::warn!(
            "[Storage Guardrail] Blocked deletion attempt of protected path '{:?}': {}",
            resolved,
            msg
        );
        Err(AppError::InvalidConfig(format!(
            "Security Violation: Path '{:?}' is protected ({})",
            resolved, msg
        )))
    } else {
        Ok(resolved)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_guardrail_blocks_drive_roots() {
        let drives = [
            Path::new(r"C:\"),
            Path::new(r"C:"),
            Path::new(r"D:\"),
            Path::new(r"d:"),
            Path::new(r"\\?\C:"),
            Path::new(r"\\?\C:\"),
            Path::new(r"\\?\d:"),
            Path::new(r"\??\C:"),
            Path::new("/"),
            Path::new(r"\"),
        ];
        for d in drives {
            let (prot, reason) = is_system_protected_path(d);
            assert!(prot, "Drive root {:?} must be protected", d);
            assert!(reason.unwrap().contains("Drive root"));
            assert!(validate_path_deletion_guardrail(d).is_err());
        }
    }

    #[test]
    fn test_guardrail_blocks_windows_system_directories() {
        let paths = [
            Path::new(r"C:\Windows"),
            Path::new(r"C:\Windows\System32"),
            Path::new(r"C:\Windows\System32\drivers\etc\hosts"),
            Path::new(r"C:\Windows\SysWOW64"),
            Path::new(r"C:\Windows\WinSxS"),
            Path::new(r"c:/windows/system32/cmd.exe"),
            Path::new(r"..\..\..\..\Windows"),
            Path::new(r"..\..\..\Windows\System32"),
            Path::new(r"Windows"),
            Path::new(r"System32"),
        ];
        for p in paths {
            let (prot, reason) = is_system_protected_path(p);
            assert!(prot, "Path {:?} must be protected", p);
            assert!(reason.is_some());
            assert!(validate_path_deletion_guardrail(p).is_err());
        }
    }

    #[test]
    fn test_guardrail_blocks_critical_os_files_and_volumes() {
        let paths = [
            Path::new(r"C:\System Volume Information"),
            Path::new(r"D:\System Volume Information"),
            Path::new(r"C:\$Recycle.Bin"),
            Path::new(r"E:\$Recycle.Bin\S-1-5-21"),
            Path::new(r"C:\pagefile.sys"),
            Path::new(r"C:\hiberfil.sys"),
            Path::new(r"C:\swapfile.sys"),
            Path::new(r"C:\Boot"),
            Path::new(r"C:\bootmgr"),
        ];
        for p in paths {
            let (prot, reason) = is_system_protected_path(p);
            assert!(prot, "Critical path {:?} must be protected", p);
            assert!(reason.is_some());
            assert!(validate_path_deletion_guardrail(p).is_err());
        }
    }

    #[test]
    fn test_guardrail_blocks_program_and_user_roots() {
        let roots = [
            Path::new(r"C:\Program Files"),
            Path::new(r"C:\Program Files (x86)"),
            Path::new(r"C:\ProgramData"),
            Path::new(r"C:\Users"),
            Path::new(r"C:\Users\Default"),
            Path::new(r"C:\Users\Public"),
        ];
        for r in roots {
            let (prot, reason) = is_system_protected_path(r);
            assert!(prot, "Root {:?} must be protected from entire deletion", r);
            assert!(reason.is_some());
            assert!(validate_path_deletion_guardrail(r).is_err());
        }
    }

    #[test]
    fn test_guardrail_path_traversal_detection() {
        let traversal_attack = Path::new(r"C:\Users\Public\..\..\Windows\System32");
        let (prot, reason) = is_system_protected_path(traversal_attack);
        assert!(prot, "Traversal resolving to Windows must be blocked");
        assert!(reason.is_some());
        assert!(validate_path_deletion_guardrail(traversal_attack).is_err());
    }

    #[test]
    fn test_guardrail_allows_safe_user_directories() {
        let temp = tempdir().unwrap();
        let safe_sub = temp.path().join("my_app_cache").join("data.tmp");
        std::fs::create_dir_all(temp.path().join("my_app_cache")).unwrap();
        std::fs::write(&safe_sub, b"test").unwrap();

        let (prot, reason) = is_system_protected_path(&safe_sub);
        assert!(!prot, "Safe sub-file should not be protected: {:?}", safe_sub);
        assert!(reason.is_none());
        assert!(validate_path_deletion_guardrail(&safe_sub).is_ok());

        let status = check_path_protection_status(&safe_sub);
        assert!(!status.is_protected);
        assert_eq!(status.protection_level, "Safe");
    }
}
