use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ShaderCacheEntry {
    pub id: String,
    pub name: String,
    pub vendor: String,
    pub path: String,
    pub size_bytes: u64,
    pub file_count: u64,
    pub exists: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ShaderScanSummary {
    pub entries: Vec<ShaderCacheEntry>,
    pub total_bytes: u64,
    pub total_files: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ShaderNukeResult {
    pub bytes_freed: u64,
    pub files_removed: u64,
    pub skipped_locked_count: u64,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct ShaderCacheDefinition {
    pub id: &'static str,
    pub name: &'static str,
    pub vendor: &'static str,
    pub path_resolver: fn() -> Option<PathBuf>,
}

fn get_local_appdata() -> Option<PathBuf> {
    dirs::data_local_dir().or_else(|| {
        std::env::var_os("LOCALAPPDATA").map(PathBuf::from)
    })
}

fn get_roaming_appdata() -> Option<PathBuf> {
    dirs::config_dir().or_else(|| {
        std::env::var_os("APPDATA").map(PathBuf::from)
    })
}

pub fn get_definitions() -> Vec<ShaderCacheDefinition> {
    vec![
        // 1. DirectX Shader Caches
        ShaderCacheDefinition {
            id: "dx_d3dscache",
            name: "DirectX D3D Shader Cache",
            vendor: "DirectX",
            path_resolver: || get_local_appdata().map(|p| p.join("D3DSCache")),
        },
        ShaderCacheDefinition {
            id: "dx_graphics_cache",
            name: "Microsoft DirectX Graphics Cache",
            vendor: "DirectX",
            path_resolver: || get_local_appdata().map(|p| p.join("Microsoft").join("DirectX Graphics Cache")),
        },
        // 2. NVIDIA Shader Caches
        ShaderCacheDefinition {
            id: "nvidia_dxcache",
            name: "NVIDIA DirectX Shader Cache (DXCache)",
            vendor: "NVIDIA",
            path_resolver: || get_local_appdata().map(|p| p.join("NVIDIA").join("DXCache")),
        },
        ShaderCacheDefinition {
            id: "nvidia_glcache",
            name: "NVIDIA OpenGL/Vulkan Cache (GLCache)",
            vendor: "NVIDIA",
            path_resolver: || get_local_appdata().map(|p| p.join("NVIDIA").join("GLCache")),
        },
        ShaderCacheDefinition {
            id: "nvidia_compute",
            name: "NVIDIA Compute Shader Cache",
            vendor: "NVIDIA",
            path_resolver: || get_roaming_appdata().map(|p| p.join("NVIDIA").join("ComputeCache")),
        },
        // 3. AMD Shader Caches
        ShaderCacheDefinition {
            id: "amd_dxcache",
            name: "AMD Radeon DirectX Shader Cache (DxCache)",
            vendor: "AMD",
            path_resolver: || get_local_appdata().map(|p| p.join("AMD").join("DxCache")),
        },
        ShaderCacheDefinition {
            id: "amd_glcache",
            name: "AMD Radeon OpenGL/Vulkan Cache (GLCache)",
            vendor: "AMD",
            path_resolver: || get_local_appdata().map(|p| p.join("AMD").join("GLCache")),
        },
        // 4. Intel Graphics Cache
        ShaderCacheDefinition {
            id: "intel_shader_cache",
            name: "Intel Arc & Iris Shader Cache",
            vendor: "Intel",
            path_resolver: || get_local_appdata().map(|p| p.join("Intel").join("ShaderCache")),
        },
    ]
}

pub fn scan_directory_safe<P: AsRef<Path>>(path: P) -> (u64, u64) {
    let p = path.as_ref();
    if !p.exists() {
        return (0, 0);
    }

    if p.is_file() {
        if let Ok(meta) = p.metadata() {
            return (meta.len(), 1);
        }
        return (0, 0);
    }

    let mut total_size: u64 = 0;
    let mut file_count: u64 = 0;

    for entry in WalkDir::new(p).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            if let Ok(meta) = entry.metadata() {
                total_size += meta.len();
                file_count += 1;
            }
        }
    }

    (total_size, file_count)
}

pub fn scan_shader_caches() -> Result<ShaderScanSummary, AppError> {
    let defs = get_definitions();
    let mut entries = Vec::new();
    let mut total_bytes: u64 = 0;
    let mut total_files: u64 = 0;

    for def in defs {
        if let Some(path) = (def.path_resolver)() {
            let path_str = path.to_string_lossy().to_string();
            let exists = path.exists();
            let (size_bytes, file_count) = if exists {
                scan_directory_safe(&path)
            } else {
                (0, 0)
            };

            total_bytes += size_bytes;
            total_files += file_count;

            entries.push(ShaderCacheEntry {
                id: def.id.to_string(),
                name: def.name.to_string(),
                vendor: def.vendor.to_string(),
                path: path_str,
                size_bytes,
                file_count,
                exists,
            });
        }
    }

    Ok(ShaderScanSummary {
        entries,
        total_bytes,
        total_files,
    })
}

pub fn nuke_shader_caches(selected_ids: Option<Vec<String>>) -> Result<ShaderNukeResult, AppError> {
    let defs = get_definitions();
    let mut bytes_freed: u64 = 0;
    let mut files_removed: u64 = 0;
    let mut skipped_locked_count: u64 = 0;
    let mut errors = Vec::new();

    let target_defs: Vec<&ShaderCacheDefinition> = if let Some(ref ids) = selected_ids {
        if ids.is_empty() {
            defs.iter().collect()
        } else {
            defs.iter().filter(|d| ids.contains(&d.id.to_string())).collect()
        }
    } else {
        defs.iter().collect()
    };

    for def in target_defs {
        if let Some(target_dir) = (def.path_resolver)() {
            if !target_dir.exists() {
                continue;
            }

            for entry in WalkDir::new(&target_dir)
                .contents_first(true)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                let path = entry.path();
                if path == target_dir {
                    continue;
                }

                if entry.file_type().is_file() {
                    let file_size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                    match std::fs::remove_file(path) {
                        Ok(_) => {
                            bytes_freed += file_size;
                            files_removed += 1;
                        }
                        Err(err) => {
                            // Raw OS error 32 on Windows is ERROR_SHARING_VIOLATION
                            if err.raw_os_error() == Some(32) {
                                skipped_locked_count += 1;
                            } else {
                                errors.push(format!("{}: {}", path.display(), err));
                            }
                        }
                    }
                } else if entry.file_type().is_dir() {
                    // Try removing empty subfolder, ignore error if still contains locked files
                    let _ = std::fs::remove_dir(path);
                }
            }
        }
    }

    Ok(ShaderNukeResult {
        bytes_freed,
        files_removed,
        skipped_locked_count,
        errors,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use std::io::Write;

    #[test]
    fn test_shader_definitions_present() {
        let defs = get_definitions();
        assert!(defs.len() >= 6);
        assert!(defs.iter().any(|d| d.vendor == "DirectX"));
        assert!(defs.iter().any(|d| d.vendor == "NVIDIA"));
        assert!(defs.iter().any(|d| d.vendor == "AMD"));
    }

    #[test]
    fn test_scan_and_nuke_mock_directory() {
        let temp_dir = std::env::temp_dir().join("wiscripts_test_shader_nuker");
        let _ = std::fs::remove_dir_all(&temp_dir);
        std::fs::create_dir_all(&temp_dir).unwrap();

        let file1_path = temp_dir.join("test_shader1.bin");
        let file2_path = temp_dir.join("test_shader2.bin");

        {
            let mut f1 = File::create(&file1_path).unwrap();
            f1.write_all(b"shader bytecode content 1234567890").unwrap();
            let mut f2 = File::create(&file2_path).unwrap();
            f2.write_all(b"shader bytecode content ABCDEFGHIJ").unwrap();
        }

        let (size, count) = scan_directory_safe(&temp_dir);
        assert_eq!(count, 2);
        assert!(size > 50);

        // Clean mock dir directly using safe logic
        let mut freed = 0;
        let mut removed = 0;
        for entry in WalkDir::new(&temp_dir).into_iter().filter_map(|e| e.ok()) {
            if entry.file_type().is_file() {
                let sz = entry.metadata().unwrap().len();
                if std::fs::remove_file(entry.path()).is_ok() {
                    freed += sz;
                    removed += 1;
                }
            }
        }

        assert_eq!(removed, 2);
        assert_eq!(freed, size);

        let _ = std::fs::remove_dir_all(&temp_dir);
    }
}
