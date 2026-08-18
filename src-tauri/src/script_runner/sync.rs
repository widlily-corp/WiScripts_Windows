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
                let src_script = local_dir.join(&entry.path);
                if src_script.exists() {
                    let dest_script = scripts_dir.join(&entry.path);
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

/// Retrieves the cached scripts library manifest. If cache is empty, tries local project seed.
#[tauri::command]
pub async fn get_cached_scripts_library() -> Result<ScriptsLibraryManifest, AppError> {
    let cache_dir = get_scripts_cache_dir()?;
    let cached_manifest_path = cache_dir.join("manifest.json");

    if cached_manifest_path.exists() {
        let content = fs::read_to_string(&cached_manifest_path)
            .map_err(|e| AppError::Io(format!("Failed to read cached manifest: {}", e)))?;
        let manifest: ScriptsLibraryManifest = serde_json::from_str(&content)
            .map_err(|e| AppError::InvalidConfig(format!("Failed to parse cached manifest: {}", e)))?;
        return Ok(manifest);
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
                    let content = fs::read_to_string(&cached_manifest_path)
                        .map_err(|e| AppError::Io(format!("Failed to read cached manifest: {}", e)))?;
                    Some(serde_json::from_str::<ScriptsLibraryManifest>(&content).map_err(|e| {
                        AppError::InvalidConfig(format!("Failed to parse cached manifest: {}", e))
                    })?)
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
            if cached_manifest_path.exists() {
                let content = fs::read_to_string(&cached_manifest_path)
                    .map_err(|e| AppError::Io(format!("Failed to read cached manifest: {}", e)))?;
                serde_json::from_str::<ScriptsLibraryManifest>(&content)
                    .map_err(|e| AppError::InvalidConfig(format!("Failed to parse cached manifest: {}", e)))?
            } else if let Some(local_manifest) = seed_cache_from_local_project(&cache_dir)? {
                local_manifest
            } else {
                return Err(AppError::Execution(
                    "Cannot sync script library: network is unreachable and no offline cache is available."
                        .to_string(),
                ));
            }
        }
    };

    // Sync individual scripts: verify hashes and download/copy missing or modified ones
    let local_project_dir = get_local_project_scripts_dir();

    for script in &manifest.scripts {
        let cached_script_path = scripts_cache_dir.join(&script.path);
        let mut needs_download = true;

        if cached_script_path.exists() {
            if let Ok(bytes) = fs::read(&cached_script_path) {
                let hash = compute_sha256(&bytes);
                if hash.eq_ignore_ascii_case(&script.sha256) {
                    needs_download = false;
                } else {
                    log::warn!(
                        "[SyncEngine] Script '{}' hash mismatch in cache (got {}, expected {}). Re-fetching.",
                        script.id,
                        hash,
                        script.sha256
                    );
                }
            }
        }

        if needs_download {
            let mut script_bytes: Option<Vec<u8>> = None;

            // 1. Try local project directory first (fast & offline)
            if let Some(ref local_dir) = local_project_dir {
                let local_path = local_dir.join(&script.path);
                if local_path.exists() {
                    if let Ok(bytes) = fs::read(&local_path) {
                        let hash = compute_sha256(&bytes);
                        if hash.eq_ignore_ascii_case(&script.sha256) {
                            script_bytes = Some(bytes);
                        }
                    }
                }
            }

            // 2. Download from GitHub raw url if not found locally
            if script_bytes.is_none() {
                let script_url = format!("{}/{}", manifest.raw_base_url.trim_end_matches('/'), script.path);
                match client.get(&script_url).send().await {
                    Ok(resp) if resp.status().is_success() => {
                        if let Ok(bytes) = resp.bytes().await {
                            let hash = compute_sha256(&bytes);
                            if hash.eq_ignore_ascii_case(&script.sha256) {
                                script_bytes = Some(bytes.to_vec());
                            } else {
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
                        log::warn!("[SyncEngine] Failed to download script '{}': HTTP {}", script.id, resp.status());
                    }
                    Err(err) => {
                        log::warn!("[SyncEngine] Network error downloading script '{}': {}", script.id, err);
                    }
                }
            }

            // 3. Write verified script to cache
            if let Some(bytes) = script_bytes {
                if let Some(parent) = cached_script_path.parent() {
                    let _ = fs::create_dir_all(parent);
                }
                if let Err(e) = fs::write(&cached_script_path, &bytes) {
                    log::error!("[SyncEngine] Failed to write cached script '{}': {}", script.id, e);
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

    let cache_dir = get_scripts_cache_dir()?;
    let cached_path = cache_dir.join("scripts").join(&entry.path);

    if cached_path.exists() {
        let bytes = fs::read(&cached_path)
            .map_err(|e| AppError::Io(format!("Failed to read cached script file: {}", e)))?;
        let hash = compute_sha256(&bytes);
        if hash.eq_ignore_ascii_case(&entry.sha256) {
            return String::from_utf8(bytes)
                .map_err(|e| AppError::Execution(format!("Script file contains invalid UTF-8: {}", e)));
        } else {
            log::warn!(
                "[SyncEngine] Cached script '{}' hash mismatch (got {}, expected {}). Re-syncing.",
                script_id,
                hash,
                entry.sha256
            );
        }
    }

    // If not in cache or corrupt, check local project folder
    if let Some(local_dir) = get_local_project_scripts_dir() {
        let local_script_path = local_dir.join(&entry.path);
        if local_script_path.exists() {
            let bytes = fs::read(&local_script_path)
                .map_err(|e| AppError::Io(format!("Failed to read local script file: {}", e)))?;
            let hash = compute_sha256(&bytes);
            if hash.eq_ignore_ascii_case(&entry.sha256) {
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

    // Force sync and retry
    let _ = sync_scripts_library(true).await?;
    if cached_path.exists() {
        let bytes = fs::read(&cached_path)
            .map_err(|e| AppError::Io(format!("Failed to read cached script file after sync: {}", e)))?;
        let hash = compute_sha256(&bytes);
        if hash.eq_ignore_ascii_case(&entry.sha256) {
            return String::from_utf8(bytes)
                .map_err(|e| AppError::Execution(format!("Script file contains invalid UTF-8: {}", e)));
        }
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
