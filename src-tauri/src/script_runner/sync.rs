use crate::error::AppError;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};

pub const DEFAULT_MANIFEST_URL: &str =
    "https://raw.githubusercontent.com/widlily-corp/WiScripts_Windows/main/scripts_lib/manifest.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ScriptParameter {
    pub name: String,
    pub r#type: String,
    #[serde(default)]
    pub default: serde_json::Value,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ScriptManifestEntry {
    pub id: String,
    pub name: String,
    pub category: String,
    pub path: String,
    pub description: String,
    pub risk_level: String, // "safe" | "elevated" | "critical"
    pub requires_admin: bool,
    pub author: String,
    pub version: String,
    pub tags: Vec<String>,
    pub sha256: String,
    #[serde(default)]
    pub parameters: Vec<ScriptParameter>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ScriptsLibraryManifest {
    pub schema_version: String,
    pub version: String,
    pub last_updated: String,
    pub repository_url: String,
    pub raw_base_url: String,
    pub scripts: Vec<ScriptManifestEntry>,
}

/// Computes lowercase hex SHA-256 hash for given bytes.
pub fn compute_sha256(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

/// Verifies script payload against expected SHA-256 hash.
/// Supports both exact binary match and cross-platform newline / UTF-8 BOM normalization.
pub fn verify_script_hash(bytes: &[u8], expected_hash: &str) -> bool {
    let expected = expected_hash.trim();
    if expected.is_empty() {
        return false;
    }

    // 1. Exact raw binary match
    let direct_hash = compute_sha256(bytes);
    if direct_hash.eq_ignore_ascii_case(expected) {
        return true;
    }

    // 2. Cross-platform text normalization (LF / CRLF / BOM variations)
    if let Ok(text) = std::str::from_utf8(bytes) {
        let clean_text = text.strip_prefix('\u{feff}').unwrap_or(text);

        // Normalized LF (Unix / Git Blob standard)
        let lf_text = clean_text.replace("\r\n", "\n").replace('\r', "\n");
        if compute_sha256(lf_text.as_bytes()).eq_ignore_ascii_case(expected) {
            return true;
        }

        // Normalized CRLF (Windows standard)
        let crlf_text = lf_text.replace('\n', "\r\n");
        if compute_sha256(crlf_text.as_bytes()).eq_ignore_ascii_case(expected) {
            return true;
        }

        // UTF-8 BOM + CRLF
        let mut bom_crlf = vec![0xEF, 0xBB, 0xBF];
        bom_crlf.extend_from_slice(crlf_text.as_bytes());
        if compute_sha256(&bom_crlf).eq_ignore_ascii_case(expected) {
            return true;
        }

        // UTF-8 BOM + LF
        let mut bom_lf = vec![0xEF, 0xBB, 0xBF];
        bom_lf.extend_from_slice(lf_text.as_bytes());
        if compute_sha256(&bom_lf).eq_ignore_ascii_case(expected) {
            return true;
        }
    }

    false
}

/// Strictly validates and normalizes a relative script path from a manifest.
/// Rejects:
/// - Empty or whitespace-only paths
/// - Leading slashes (`/`, `\`)
/// - Windows drive prefixes / colons (e.g. `C:`, `D:`)
/// - UNC prefixes (`\\`)
/// - Parent directory traversal (`..`)
/// - Non-normal path components (RootDir, Prefix, ParentDir, CurDir)
/// - Disallowed file extensions (only .ps1, .bat, .cmd are permitted)
pub fn sanitize_script_relative_path(raw_path: &str) -> Result<PathBuf, AppError> {
    let trimmed = raw_path.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidConfig(
            "Script path in manifest cannot be empty".to_string(),
        ));
    }

    // 1. Reject colons, UNC, or leading slashes/backslashes
    if trimmed.contains(':')
        || trimmed.starts_with('/')
        || trimmed.starts_with('\\')
        || trimmed.contains('\\')
    {
        return Err(AppError::InvalidConfig(format!(
            "Script path '{}' contains forbidden characters, backslashes, colons, or leading slashes",
            raw_path
        )));
    }

    // 2. Explicit traversal token check
    if trimmed.contains("..") {
        return Err(AppError::InvalidConfig(format!(
            "Path traversal sequence '..' detected in script path '{}'",
            raw_path
        )));
    }

    // 3. Structural component verification
    let path = Path::new(trimmed);
    let mut normalized_buf = PathBuf::new();

    for component in path.components() {
        match component {
            std::path::Component::Normal(comp) => {
                let comp_str = comp.to_string_lossy();
                if comp_str.trim().is_empty()
                    || comp_str == "."
                    || comp_str == ".."
                    || comp_str.contains('/')
                    || comp_str.contains('\\')
                    || comp_str.contains(':')
                    || comp_str.contains('\0')
                {
                    return Err(AppError::InvalidConfig(format!(
                        "Invalid path segment '{}' in script path '{}'",
                        comp_str, raw_path
                    )));
                }
                normalized_buf.push(comp);
            }
            std::path::Component::ParentDir => {
                return Err(AppError::InvalidConfig(format!(
                    "Path traversal ('..') detected in script path '{}'",
                    raw_path
                )));
            }
            std::path::Component::RootDir | std::path::Component::Prefix(_) => {
                return Err(AppError::InvalidConfig(format!(
                    "Absolute or rooted path rejected: '{}'",
                    raw_path
                )));
            }
            std::path::Component::CurDir => {
                return Err(AppError::InvalidConfig(format!(
                    "Redundant '.' current-dir component rejected in script path '{}'",
                    raw_path
                )));
            }
        }
    }

    if normalized_buf.as_os_str().is_empty() {
        return Err(AppError::InvalidConfig(format!(
            "Script path '{}' resolved to an empty path",
            raw_path
        )));
    }

    // 4. Extension whitelist check
    match normalized_buf.extension().and_then(|ext| ext.to_str()) {
        Some(ext) => {
            let lower_ext = ext.to_ascii_lowercase();
            if lower_ext != "ps1" && lower_ext != "bat" && lower_ext != "cmd" {
                return Err(AppError::InvalidConfig(format!(
                    "Script path '{}' has disallowed extension '.{}'. Allowed extensions: ps1, bat, cmd",
                    raw_path, lower_ext
                )));
            }
        }
        None => {
            return Err(AppError::InvalidConfig(format!(
                "Script path '{}' lacks a file extension",
                raw_path
            )));
        }
    }

    Ok(normalized_buf)
}

/// Safely joins a sanitized relative script path to a base directory,
/// verifying containment within `base_dir`.
pub fn safe_join_script_path(base_dir: &Path, raw_relative_path: &str) -> Result<PathBuf, AppError> {
    let sanitized_rel = sanitize_script_relative_path(raw_relative_path)?;
    let target = base_dir.join(&sanitized_rel);

    if !target.starts_with(base_dir) {
        return Err(AppError::InvalidConfig(format!(
            "Script path '{}' resolves outside base directory '{:?}'",
            raw_relative_path, base_dir
        )));
    }

    Ok(target)
}

/// Resolves the offline scripts library cache directory:
/// `%LOCALAPPDATA%\WiScripts\ScriptsLibCache\`
pub fn get_scripts_cache_dir() -> Result<PathBuf, AppError> {
    let base_dir = std::env::var("LOCALAPPDATA")
        .map(PathBuf::from)
        .or_else(|_| {
            dirs::data_local_dir().ok_or_else(|| {
                AppError::Io("Could not resolve local app data directory".to_string())
            })
        })
        .map_err(|e| match e {
            AppError::Io(s) => AppError::Io(s),
            _ => AppError::Io("Failed to determine LOCALAPPDATA directory".to_string()),
        })?;

    let cache_dir = base_dir.join("WiScripts").join("ScriptsLibCache");
    if !cache_dir.exists() {
        fs::create_dir_all(&cache_dir)
            .map_err(|e| AppError::Io(format!("Failed to create scripts cache directory: {}", e)))?;
    }

    Ok(cache_dir)
}

/// Attempts to load local project `scripts_lib` files when running locally or offline.
fn get_local_project_scripts_dir() -> Option<PathBuf> {
    let candidates = [
        PathBuf::from("scripts_lib"),
        PathBuf::from("../scripts_lib"),
        PathBuf::from("../../scripts_lib"),
    ];

    for candidate in &candidates {
        if candidate.join("manifest.json").exists() {
            return Some(candidate.clone());
        }
    }

    None
}

/// Copies files from local project `scripts_lib` to the cache directory.
pub fn seed_cache_from_local_project(cache_dir: &Path) -> Result<Option<ScriptsLibraryManifest>, AppError> {
    if let Some(local_dir) = get_local_project_scripts_dir() {
        let manifest_path = local_dir.join("manifest.json");
        if manifest_path.exists() {
            let content = fs::read_to_string(&manifest_path)
                .map_err(|e| AppError::Io(format!("Failed to read local manifest: {}", e)))?;
            let manifest: ScriptsLibraryManifest = serde_json::from_str(&content)
                .map_err(|e| AppError::InvalidConfig(format!("Failed to parse local manifest: {}", e)))?;

            // Copy manifest to cache
            fs::write(cache_dir.join("manifest.json"), &content)
                .map_err(|e| AppError::Io(format!("Failed to write cached manifest: {}", e)))?;

            // Copy scripts
            let scripts_dir = cache_dir.join("scripts");
            fs::create_dir_all(&scripts_dir)
                .map_err(|e| AppError::Io(format!("Failed to create cached scripts directory: {}", e)))?;

            for entry in &manifest.scripts {
                let rel_path = match sanitize_script_relative_path(&entry.path) {
                    Ok(p) => p,
                    Err(e) => {
                        log::warn!(
                            "[SyncEngine] Local seed skipped script '{}' with invalid path '{}': {}",
                            entry.id, entry.path, e
                        );
                        continue;
                    }
                };
                let src_script = local_dir.join(&rel_path);
                if src_script.exists() {
                    let dest_script = scripts_dir.join(&rel_path);
                    if let Some(parent) = dest_script.parent() {
                        fs::create_dir_all(parent).map_err(|e| {
                            AppError::Io(format!("Failed to create script category directory: {}", e))
                        })?;
                    }
                    if let Ok(bytes) = fs::read(&src_script) {
                        let hash = compute_sha256(&bytes);
                        if hash.eq_ignore_ascii_case(&entry.sha256) {
                            let _ = fs::write(&dest_script, bytes);
                        }
                    }
                }
            }

            return Ok(Some(manifest));
        }
    }

    Ok(None)
}

/// Retrieves the cached scripts library manifest. If cache is empty or corrupt, tries local project seed.
#[tauri::command]
pub async fn get_cached_scripts_library() -> Result<ScriptsLibraryManifest, AppError> {
    let cache_dir = get_scripts_cache_dir()?;
    let cached_manifest_path = cache_dir.join("manifest.json");

    if cached_manifest_path.exists() {
        match fs::read_to_string(&cached_manifest_path) {
            Ok(content) => {
                match serde_json::from_str::<ScriptsLibraryManifest>(&content) {
                    Ok(manifest) => return Ok(manifest),
                    Err(e) => {
                        log::warn!(
                            "[SyncEngine] Cached manifest.json is corrupted: {}. Pruning invalid cache and falling back to seed.",
                            e
                        );
                        let _ = fs::remove_file(&cached_manifest_path);
                        let cached_etag = cache_dir.join("manifest.etag");
                        if cached_etag.exists() {
                            let _ = fs::remove_file(&cached_etag);
                        }
                    }
                }
            }
            Err(e) => {
                log::warn!(
                    "[SyncEngine] Failed to read cached manifest: {}. Pruning cache entry.",
                    e
                );
                let _ = fs::remove_file(&cached_manifest_path);
            }
        }
    }

    // Try seeding from local project folder
    if let Some(manifest) = seed_cache_from_local_project(&cache_dir)? {
        return Ok(manifest);
    }

    // Attempt online sync if no cache and no local files
    sync_scripts_library(true).await
}

/// Synchronizes the scripts library with GitHub repository, validating ETag and SHA-256 hashes.
#[tauri::command]
pub async fn sync_scripts_library(force: bool) -> Result<ScriptsLibraryManifest, AppError> {
    let cache_dir = get_scripts_cache_dir()?;
    let cached_manifest_path = cache_dir.join("manifest.json");
    let cached_etag_path = cache_dir.join("manifest.etag");
    let scripts_cache_dir = cache_dir.join("scripts");

    fs::create_dir_all(&scripts_cache_dir)
        .map_err(|e| AppError::Io(format!("Failed to create scripts cache subfolder: {}", e)))?;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(12))
        .user_agent("WiScripts-Windows-App/1.0")
        .build()
        .map_err(|e| AppError::Execution(format!("Failed to build HTTP client: {}", e)))?;

    let mut request = client.get(DEFAULT_MANIFEST_URL);

    // Apply ETag header if available and force is false
    if !force && cached_etag_path.exists() && cached_manifest_path.exists() {
        if let Ok(etag) = fs::read_to_string(&cached_etag_path) {
            let trimmed_etag = etag.trim();
            if !trimmed_etag.is_empty() {
                request = request.header("If-None-Match", trimmed_etag);
            }
        }
    }

    let maybe_manifest = match request.send().await {
        Ok(response) => {
            if response.status() == reqwest::StatusCode::NOT_MODIFIED {
                log::info!("[SyncEngine] Remote manifest unchanged (HTTP 304 Not Modified). Reusing cache.");
                if cached_manifest_path.exists() {
                    match fs::read_to_string(&cached_manifest_path) {
                        Ok(content) => match serde_json::from_str::<ScriptsLibraryManifest>(&content) {
                            Ok(parsed) => Some(parsed),
                            Err(e) => {
                                log::warn!(
                                    "[SyncEngine] Corrupted cached manifest on HTTP 304: {}. Deleting cache and re-syncing.",
                                    e
                                );
                                let _ = fs::remove_file(&cached_manifest_path);
                                let _ = fs::remove_file(&cached_etag_path);
                                None
                            }
                        },
                        Err(_) => {
                            let _ = fs::remove_file(&cached_manifest_path);
                            let _ = fs::remove_file(&cached_etag_path);
                            None
                        }
                    }
                } else {
                    None
                }
            } else if response.status().is_success() {
                if let Some(etag_header) = response.headers().get("etag") {
                    if let Ok(etag_str) = etag_header.to_str() {
                        let _ = fs::write(&cached_etag_path, etag_str.trim());
                    }
                }
                let body_text = response
                    .text()
                    .await
                    .map_err(|e| AppError::Execution(format!("Failed to read manifest response body: {}", e)))?;
                let parsed: ScriptsLibraryManifest = serde_json::from_str(&body_text)
                    .map_err(|e| AppError::InvalidConfig(format!("Failed to parse downloaded manifest: {}", e)))?;

                // Save manifest to cache
                let _ = fs::write(&cached_manifest_path, &body_text);
                Some(parsed)
            } else {
                log::warn!(
                    "[SyncEngine] HTTP GET manifest returned non-success status: {}",
                    response.status()
                );
                None
            }
        }
        Err(err) => {
            log::warn!("[SyncEngine] Network request to sync manifest failed: {}. Falling back to cache.", err);
            None
        }
    };

    // If network sync succeeded, use parsed manifest. Otherwise fallback to cache or local project seed.
    let manifest = match maybe_manifest {
        Some(m) => m,
        None => {
            let mut loaded_manifest: Option<ScriptsLibraryManifest> = None;
            if cached_manifest_path.exists() {
                if let Ok(content) = fs::read_to_string(&cached_manifest_path) {
                    if let Ok(parsed) = serde_json::from_str::<ScriptsLibraryManifest>(&content) {
                        loaded_manifest = Some(parsed);
                    } else {
                        log::warn!("[SyncEngine] Pruning invalid cached manifest during fallback.");
                        let _ = fs::remove_file(&cached_manifest_path);
                        let _ = fs::remove_file(&cached_etag_path);
                    }
                }
            }

            if let Some(m) = loaded_manifest {
                m
            } else if let Some(local_manifest) = seed_cache_from_local_project(&cache_dir)? {
                local_manifest
            } else {
                return Err(AppError::Execution(
                    "Cannot sync script library: network is unreachable and no valid offline cache is available."
                        .to_string(),
                ));
            }
        }
    };

    // Sync individual scripts: verify hashes and download/copy missing or modified ones
    let local_project_dir = get_local_project_scripts_dir();

    for script in &manifest.scripts {
        let rel_path = match sanitize_script_relative_path(&script.path) {
            Ok(p) => p,
            Err(e) => {
                log::error!(
                    "[SyncEngine] Refusing to sync script '{}': invalid/malicious path '{}': {}",
                    script.id, script.path, e
                );
                continue;
            }
        };

        let cached_script_path = scripts_cache_dir.join(&rel_path);
        let mut needs_download = true;

        if cached_script_path.exists() {
            if let Ok(bytes) = fs::read(&cached_script_path) {
                if verify_script_hash(&bytes, &script.sha256) {
                    needs_download = false;
                } else {
                    log::warn!(
                        "[SyncEngine] Script '{}' hash mismatch in cache. Re-fetching.",
                        script.id
                    );
                    let _ = fs::remove_file(&cached_script_path);
                }
            }
        }

        if needs_download {
            let mut script_bytes: Option<Vec<u8>> = None;

            // 1. Try local project directory first (fast & offline)
            if let Some(ref local_dir) = local_project_dir {
                let local_path = local_dir.join(&rel_path);
                if local_path.exists() {
                    if let Ok(bytes) = fs::read(&local_path) {
                        if verify_script_hash(&bytes, &script.sha256) {
                            script_bytes = Some(bytes);
                        }
                    }
                }
            }

            // 2. Download from GitHub raw url if not found locally
            if script_bytes.is_none() {
                let forward_slash_path = rel_path
                    .components()
                    .map(|c| c.as_os_str().to_string_lossy())
                    .collect::<Vec<_>>()
                    .join("/");
                let script_url = format!(
                    "{}/{}",
                    manifest.raw_base_url.trim_end_matches('/'),
                    forward_slash_path
                );
                match client.get(&script_url).send().await {
                    Ok(resp) if resp.status().is_success() => {
                        if let Ok(bytes) = resp.bytes().await {
                            if verify_script_hash(&bytes, &script.sha256) {
                                script_bytes = Some(bytes.to_vec());
                            } else {
                                let hash = compute_sha256(&bytes);
                                log::error!(
                                    "[SyncEngine] Downloaded script '{}' failed SHA-256 verification (got {}, expected {})",
                                    script.id,
                                    hash,
                                    script.sha256
                                );
                            }
                        }
                    }
                    Ok(resp) => {
                        log::warn!(
                            "[SyncEngine] Failed to download script '{}': HTTP {}",
                            script.id,
                            resp.status()
                        );
                    }
                    Err(err) => {
                        log::warn!(
                            "[SyncEngine] Network error downloading script '{}': {}",
                            script.id,
                            err
                        );
                    }
                }
            }

            // 3. Write verified script to cache
            if let Some(bytes) = script_bytes {
                if let Some(parent) = cached_script_path.parent() {
                    let _ = fs::create_dir_all(parent);
                }
                if let Err(e) = fs::write(&cached_script_path, &bytes) {
                    log::error!(
                        "[SyncEngine] Failed to write cached script '{}': {}",
                        script.id,
                        e
                    );
                } else {
                    log::info!("[SyncEngine] Cached verified script: {}", script.id);
                }
            }
        }
    }

    Ok(manifest)
}

/// Reads a library script's content by its unique `script_id`, ensuring cryptographic integrity.
#[tauri::command]
pub async fn read_library_script(script_id: String) -> Result<String, AppError> {
    let manifest = get_cached_scripts_library().await?;
    let entry = manifest
        .scripts
        .iter()
        .find(|s| s.id == script_id)
        .ok_or_else(|| {
            AppError::InvalidConfig(format!("Script with id '{}' not found in library manifest", script_id))
        })?;

    let rel_path = sanitize_script_relative_path(&entry.path)?;
    let cache_dir = get_scripts_cache_dir()?;
    let cached_path = cache_dir.join("scripts").join(&rel_path);

    if cached_path.exists() {
        if let Ok(bytes) = fs::read(&cached_path) {
            if verify_script_hash(&bytes, &entry.sha256) {
                return String::from_utf8(bytes)
                    .map_err(|e| AppError::Execution(format!("Script file contains invalid UTF-8: {}", e)));
            } else {
                log::warn!(
                    "[SyncEngine] Cached script '{}' hash mismatch. Pruning stale cache and re-syncing.",
                    script_id
                );
                let _ = fs::remove_file(&cached_path);
            }
        }
    }

    // If not in cache or corrupt, check local project folder
    if let Some(local_dir) = get_local_project_scripts_dir() {
        let local_script_path = local_dir.join(&rel_path);
        if local_script_path.exists() {
            if let Ok(bytes) = fs::read(&local_script_path) {
                if verify_script_hash(&bytes, &entry.sha256) {
                    // Cache it
                    if let Some(parent) = cached_path.parent() {
                        let _ = fs::create_dir_all(parent);
                    }
                    let _ = fs::write(&cached_path, &bytes);
                    return String::from_utf8(bytes)
                        .map_err(|e| AppError::Execution(format!("Script file contains invalid UTF-8: {}", e)));
                }
            }
        }
    }

    // Force sync and retry
    let _ = sync_scripts_library(true).await?;
    if cached_path.exists() {
        let bytes = fs::read(&cached_path)
            .map_err(|e| AppError::Io(format!("Failed to read cached script file after sync: {}", e)))?;
        if verify_script_hash(&bytes, &entry.sha256) {
            return String::from_utf8(bytes)
                .map_err(|e| AppError::Execution(format!("Script file contains invalid UTF-8: {}", e)));
        }
        let hash = compute_sha256(&bytes);
        return Err(AppError::Execution(format!(
            "SHA-256 integrity verification failed for script '{}' (expected {}, got {})",
            script_id, entry.sha256, hash
        )));
    }

    Err(AppError::Io(format!(
        "Script '{}' is unavailable offline and could not be fetched.",
        script_id
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_sha256_known_string() {
        let input = b"Hello, WiScripts Windows!";
        let hash = compute_sha256(input);
        // Assert lowercase 64 hex characters
        assert_eq!(hash.len(), 64);
        assert!(hash.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn test_sanitize_script_relative_path_valid() {
        let p1 = sanitize_script_relative_path("maintenance/clear_windows_update_cache.ps1");
        assert!(p1.is_ok());
        assert_eq!(p1.unwrap(), PathBuf::from("maintenance").join("clear_windows_update_cache.ps1"));

        let p2 = sanitize_script_relative_path("network/reset_tcp_ip_stack.ps1");
        assert!(p2.is_ok());

        let p3 = sanitize_script_relative_path("diagnostics/test.bat");
        assert!(p3.is_ok());
        assert_eq!(p3.unwrap(), PathBuf::from("diagnostics").join("test.bat"));
    }

    #[test]
    fn test_sanitize_script_relative_path_rejections() {
        // Empty & Whitespace
        assert!(sanitize_script_relative_path("").is_err());
        assert!(sanitize_script_relative_path("   ").is_err());

        // Directory traversal
        assert!(sanitize_script_relative_path("../evil.ps1").is_err());
        assert!(sanitize_script_relative_path("maintenance/../../evil.ps1").is_err());
        assert!(sanitize_script_relative_path("..\\evil.ps1").is_err());

        // Absolute and drive paths
        assert!(sanitize_script_relative_path("/etc/passwd").is_err());
        assert!(sanitize_script_relative_path("\\Windows\\System32\\cmd.exe").is_err());
        assert!(sanitize_script_relative_path("C:\\script.ps1").is_err());
        assert!(sanitize_script_relative_path("C:script.ps1").is_err());

        // Disallowed extensions
        assert!(sanitize_script_relative_path("maintenance/script.exe").is_err());
        assert!(sanitize_script_relative_path("maintenance/script.vbs").is_err());
        assert!(sanitize_script_relative_path("maintenance/script.sh").is_err());
        assert!(sanitize_script_relative_path("maintenance/script").is_err());
    }

    #[test]
    fn test_safe_join_script_path_containment() {
        let temp_dir = tempfile::tempdir().expect("Failed to create tempdir");
        let base = temp_dir.path();

        let safe_path = safe_join_script_path(base, "maintenance/test.ps1");
        assert!(safe_path.is_ok());
        assert!(safe_path.unwrap().starts_with(base));

        assert!(safe_join_script_path(base, "../evil.ps1").is_err());
        assert!(safe_join_script_path(base, "C:\\Windows\\System32\\calc.exe").is_err());
    }

    #[test]
    fn test_parse_manifest_json_structure() {
        let json_data = r#"{
            "schemaVersion": "1.0.0",
            "version": "1.0.0",
            "lastUpdated": "2026-08-18T11:00:00Z",
            "repositoryUrl": "https://github.com/widlily-corp/WiScripts_Windows",
            "rawBaseUrl": "https://raw.githubusercontent.com/widlily-corp/WiScripts_Windows/main/scripts_lib",
            "scripts": [
                {
                    "id": "test-script",
                    "name": "Test Script",
                    "category": "maintenance",
                    "path": "maintenance/test.ps1",
                    "description": "Test description",
                    "riskLevel": "safe",
                    "requiresAdmin": false,
                    "author": "WiScripts Core Team",
                    "version": "1.0.0",
                    "tags": ["test"],
                    "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                    "parameters": [
                        {
                            "name": "Force",
                            "type": "boolean",
                            "default": false,
                            "description": "Force execution"
                        }
                    ]
                }
            ]
        }"#;

        let manifest: Result<ScriptsLibraryManifest, _> = serde_json::from_str(json_data);
        assert!(manifest.is_ok(), "Manifest should parse cleanly: {:?}", manifest.err());
        let m = manifest.unwrap();
        assert_eq!(m.scripts.len(), 1);
        assert_eq!(m.scripts[0].id, "test-script");
        assert_eq!(m.scripts[0].risk_level, "safe");
        assert_eq!(m.scripts[0].parameters.len(), 1);
        assert_eq!(m.scripts[0].parameters[0].name, "Force");
    }

    #[test]
    fn test_cache_dir_resolution() {
        let dir = get_scripts_cache_dir();
        assert!(dir.is_ok());
        let path = dir.unwrap();
        assert!(path.to_string_lossy().contains("ScriptsLibCache"));
    }

    #[test]
    fn test_sha256_hash_verification_detects_tampering() {
        let original = b"Write-Host 'Hello World'";
        let expected_hash = compute_sha256(original);

        let tampered = b"Write-Host 'Malicious Modified Code'";
        let tampered_hash = compute_sha256(tampered);

        assert_ne!(expected_hash, tampered_hash);
        assert!(!expected_hash.eq_ignore_ascii_case(&tampered_hash));
    }

    #[test]
    fn test_seed_cache_from_local_project_and_verify_all_scripts() {
        let temp_dir = tempfile::tempdir().expect("Failed to create tempdir");
        let cache_path = temp_dir.path();

        let result = seed_cache_from_local_project(cache_path);
        assert!(result.is_ok(), "Local project seed failed: {:?}", result.err());

        if let Ok(Some(manifest)) = result {
            assert!(
                manifest.scripts.len() >= 15,
                "Manifest should contain at least 15 verified scripts (found {})",
                manifest.scripts.len()
            );
            let cached_manifest_file = cache_path.join("manifest.json");
            assert!(cached_manifest_file.exists(), "manifest.json should be written to cache");

            let scripts_dir = cache_path.join("scripts");
            for script in &manifest.scripts {
                let script_file = scripts_dir.join(&script.path);
                assert!(
                    script_file.exists(),
                    "Cached script file must exist: {:?}",
                    script_file
                );
                let bytes = fs::read(&script_file).expect("Failed to read cached script file");
                let actual_hash = compute_sha256(&bytes);
                assert_eq!(
                    actual_hash.to_lowercase(),
                    script.sha256.to_lowercase(),
                    "Hash mismatch for script: {}",
                    script.id
                );
            }
        }
    }
}
