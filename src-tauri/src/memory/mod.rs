use serde::{Deserialize, Serialize};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use crate::error::AppError;

#[cfg(windows)]
use windows::{
    core::{s, PCWSTR},
    Win32::{
        Foundation::{CloseHandle, HANDLE},
        Security::{
            AdjustTokenPrivileges, LookupPrivilegeValueW, LUID_AND_ATTRIBUTES,
            SE_PRIVILEGE_ENABLED, TOKEN_ADJUST_PRIVILEGES, TOKEN_PRIVILEGES, TOKEN_QUERY,
        },
        System::{
            LibraryLoader::{GetModuleHandleA, GetProcAddress},
            ProcessStatus::{
                GetPerformanceInfo, K32EmptyWorkingSet, K32EnumProcesses,
                K32GetProcessImageFileNameW, K32GetProcessMemoryInfo, PERFORMANCE_INFORMATION,
                PROCESS_MEMORY_COUNTERS,
            },
            SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX},
            Threading::{
                GetCurrentProcess, OpenProcess, OpenProcessToken, PROCESS_QUERY_INFORMATION,
                PROCESS_SET_QUOTA, PROCESS_VM_READ,
            },
        },
    },
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryBreakdown {
    pub total_physical_bytes: u64,
    pub available_bytes: u64,
    pub used_bytes: u64,
    pub usage_percent: f32,
    pub standby_bytes: u64,
    pub modified_bytes: u64,
    pub free_bytes: u64,
    pub paged_pool_bytes: u64,
    pub non_paged_pool_bytes: u64,
    pub system_cache_bytes: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum StandbyPurgeMode {
    All,
    LowPriorityOnly,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PurgeResult {
    pub bytes_freed: u64,
    pub mb_freed: f64,
    pub processes_trimmed: u32,
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoTrimmerConfig {
    pub enabled: bool,
    pub threshold_percent: f32,
    pub interval_seconds: u64,
    pub purge_standby: bool,
    pub purge_working_sets: bool,
    pub excluded_process_names: Vec<String>,
}

impl Default for AutoTrimmerConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            threshold_percent: 85.0,
            interval_seconds: 120,
            purge_standby: true,
            purge_working_sets: true,
            excluded_process_names: vec![
                "csrss.exe".to_string(),
                "lsass.exe".to_string(),
                "dwm.exe".to_string(),
                "smss.exe".to_string(),
                "services.exe".to_string(),
                "wiscripts.exe".to_string(),
                "wiscripts_windows.exe".to_string(),
            ],
        }
    }
}

static AUTO_TRIMMER_CONFIG: Mutex<Option<AutoTrimmerConfig>> = Mutex::new(None);
static AUTO_TRIMMER_RUNNING: AtomicBool = AtomicBool::new(false);

type NtSetSystemInformationFn = unsafe extern "system" fn(
    system_information_class: u32,
    system_information: *mut std::ffi::c_void,
    system_information_length: u32,
) -> i32;

#[cfg(windows)]
unsafe fn enable_privilege(privilege_name: &str) -> Result<(), String> {
    let mut token = HANDLE::default();
    OpenProcessToken(
        GetCurrentProcess(),
        TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY,
        &mut token,
    )
    .map_err(|e| format!("OpenProcessToken failed: {:?}", e))?;

    let name_wide: Vec<u16> = privilege_name
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    let mut luid = windows::Win32::Foundation::LUID::default();
    let lookup_res = LookupPrivilegeValueW(
        PCWSTR::null(),
        PCWSTR(name_wide.as_ptr()),
        &mut luid,
    );

    if let Err(e) = lookup_res {
        let _ = CloseHandle(token);
        return Err(format!(
            "LookupPrivilegeValueW for '{}' failed: {:?}",
            privilege_name, e
        ));
    }

    let tp = TOKEN_PRIVILEGES {
        PrivilegeCount: 1,
        Privileges: [LUID_AND_ATTRIBUTES {
            Luid: luid,
            Attributes: SE_PRIVILEGE_ENABLED,
        }],
    };

    let adjust_res = AdjustTokenPrivileges(
        token,
        false,
        Some(&tp as *const _),
        0,
        None,
        None,
    );

    let _ = CloseHandle(token);

    if let Err(e) = adjust_res {
        return Err(format!(
            "AdjustTokenPrivileges for '{}' failed: {:?}",
            privilege_name, e
        ));
    }

    Ok(())
}

#[cfg(windows)]
fn execute_standby_purge_internal(mode: StandbyPurgeMode) -> Result<(), String> {
    unsafe {
        let _ = enable_privilege("SeProfileSingleProcessPrivilege");
        let _ = enable_privilege("SeIncreaseQuotaPrivilege");

        let ntdll = GetModuleHandleA(s!("ntdll.dll"))
            .map_err(|e| format!("GetModuleHandleA(ntdll.dll) failed: {:?}", e))?;
        let proc = GetProcAddress(ntdll, s!("NtSetSystemInformation"))
            .ok_or_else(|| "NtSetSystemInformation not found in ntdll.dll".to_string())?;

        let func: NtSetSystemInformationFn = std::mem::transmute(proc);

        // SystemMemoryListInformation = 80
        // MemoryPurgeStandbyList = 4, MemoryPurgeLowPriorityStandbyList = 5
        let mut command: u32 = match mode {
            StandbyPurgeMode::All => 4,
            StandbyPurgeMode::LowPriorityOnly => 5,
        };

        let status = func(
            80,
            &mut command as *mut u32 as *mut std::ffi::c_void,
            std::mem::size_of::<u32>() as u32,
        );

        if status < 0 {
            return Err(format!("NtSetSystemInformation(80) returned NTSTATUS {:#X}", status));
        }
    }

    Ok(())
}

#[cfg(windows)]
fn query_system_memory_status() -> Result<(u64, u64, f32), String> {
    unsafe {
        let mut mem_status = MEMORYSTATUSEX {
            dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32,
            ..Default::default()
        };

        GlobalMemoryStatusEx(&mut mem_status)
            .map_err(|e| format!("GlobalMemoryStatusEx failed: {:?}", e))?;

        let total = mem_status.ullTotalPhys;
        let avail = mem_status.ullAvailPhys;
        let percent = mem_status.dwMemoryLoad as f32;

        Ok((total, avail, percent))
    }
}

#[tauri::command]
pub fn get_memory_breakdown() -> Result<MemoryBreakdown, AppError> {
    #[cfg(windows)]
    {
        unsafe {
            let mut mem_status = MEMORYSTATUSEX {
                dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32,
                ..Default::default()
            };
            GlobalMemoryStatusEx(&mut mem_status)
                .map_err(|e| AppError::System(format!("GlobalMemoryStatusEx failed: {:?}", e)))?;

            let mut perf_info = PERFORMANCE_INFORMATION {
                cb: std::mem::size_of::<PERFORMANCE_INFORMATION>() as u32,
                ..Default::default()
            };
            let _ = GetPerformanceInfo(&mut perf_info, perf_info.cb);

            let page_size = perf_info.PageSize.max(4096) as u64;
            let total = mem_status.ullTotalPhys;
            let available = mem_status.ullAvailPhys;
            let used = total.saturating_sub(available);
            let usage_percent = if total > 0 {
                ((used as f64 / total as f64) * 100.0) as f32
            } else {
                mem_status.dwMemoryLoad as f32
            };

            let system_cache_bytes = (perf_info.SystemCache as u64) * page_size;
            let paged_pool_bytes = (perf_info.KernelPaged as u64) * page_size;
            let non_paged_pool_bytes = (perf_info.KernelNonpaged as u64) * page_size;

            // Standby is approximated by system cache memory available for pages
            let standby_bytes = system_cache_bytes.min(available);
            let free_bytes = available.saturating_sub(standby_bytes);
            let modified_bytes = (perf_info.CommitTotal as u64 * page_size)
                .saturating_sub(used)
                .min(available / 4);

            Ok(MemoryBreakdown {
                total_physical_bytes: total,
                available_bytes: available,
                used_bytes: used,
                usage_percent: (usage_percent * 10.0).round() / 10.0,
                standby_bytes,
                modified_bytes,
                free_bytes,
                paged_pool_bytes,
                non_paged_pool_bytes,
                system_cache_bytes,
            })
        }
    }
    #[cfg(not(windows))]
    {
        Ok(MemoryBreakdown {
            total_physical_bytes: 16 * 1024 * 1024 * 1024,
            available_bytes: 8 * 1024 * 1024 * 1024,
            used_bytes: 8 * 1024 * 1024 * 1024,
            usage_percent: 50.0,
            standby_bytes: 3 * 1024 * 1024 * 1024,
            modified_bytes: 512 * 1024 * 1024,
            free_bytes: 4500 * 1024 * 1024,
            paged_pool_bytes: 600 * 1024 * 1024,
            non_paged_pool_bytes: 400 * 1024 * 1024,
            system_cache_bytes: 3 * 1024 * 1024 * 1024,
        })
    }
}

#[tauri::command]
pub fn purge_standby_memory(mode: StandbyPurgeMode) -> Result<PurgeResult, AppError> {
    #[cfg(windows)]
    {
        let before_mem = query_system_memory_status().unwrap_or((0, 0, 0.0));
        let purge_res = execute_standby_purge_internal(mode);

        let after_mem = query_system_memory_status().unwrap_or((0, 0, 0.0));
        let freed_bytes = after_mem.1.saturating_sub(before_mem.1);
        let mb_freed = (freed_bytes as f64) / (1024.0 * 1024.0);

        match purge_res {
            Ok(_) => Ok(PurgeResult {
                bytes_freed: freed_bytes,
                mb_freed: (mb_freed * 100.0).round() / 100.0,
                processes_trimmed: 0,
                success: true,
                message: format!(
                    "Successfully purged Windows standby cache (mode: {:?})",
                    mode
                ),
            }),
            Err(e) => {
                // Return gracefully without crashing if unprivileged
                Ok(PurgeResult {
                    bytes_freed: 0,
                    mb_freed: 0.0,
                    processes_trimmed: 0,
                    success: false,
                    message: format!("Standby purge notice (requires elevation): {}", e),
                })
            }
        }
    }
    #[cfg(not(windows))]
    {
        Ok(PurgeResult {
            bytes_freed: 512 * 1024 * 1024,
            mb_freed: 512.0,
            processes_trimmed: 0,
            success: true,
            message: format!("Mock purged standby list (mode: {:?})", mode),
        })
    }
}

#[tauri::command]
pub fn purge_working_sets(excluded_pids: Vec<u32>) -> Result<PurgeResult, AppError> {
    #[cfg(windows)]
    {
        let system_exclusions = [
            "csrss.exe",
            "lsass.exe",
            "dwm.exe",
            "smss.exe",
            "services.exe",
            "wiscripts.exe",
            "wiscripts_windows.exe",
        ];

        let mut pids = [0u32; 2048];
        let mut bytes_returned = 0u32;
        let enum_res = unsafe {
            K32EnumProcesses(
                pids.as_mut_ptr(),
                (pids.len() * std::mem::size_of::<u32>()) as u32,
                &mut bytes_returned,
            )
        };

        if !enum_res.as_bool() {
            return Err(AppError::System("K32EnumProcesses failed".to_string()));
        }

        let pid_count = (bytes_returned as usize) / std::mem::size_of::<u32>();
        let mut total_freed_bytes = 0u64;
        let mut trimmed_count = 0u32;

        for &pid in &pids[..pid_count] {
            if pid == 0 || pid == 4 || excluded_pids.contains(&pid) {
                continue;
            }

            unsafe {
                let handle_res = OpenProcess(
                    PROCESS_QUERY_INFORMATION | PROCESS_SET_QUOTA | PROCESS_VM_READ,
                    false,
                    pid,
                );

                if let Ok(handle) = handle_res {
                    // Check process name
                    let mut name_buf = [0u16; 260];
                    let name_len = K32GetProcessImageFileNameW(handle, &mut name_buf);
                    let mut is_system = false;

                    if name_len > 0 {
                        let full_path = String::from_utf16_lossy(&name_buf[..name_len as usize]);
                        let process_name = full_path.rsplit('\\').next().unwrap_or(&full_path).to_lowercase();
                        for excluded in &system_exclusions {
                            if process_name == *excluded {
                                is_system = true;
                                break;
                            }
                        }
                    }

                    if !is_system {
                        let mut mem_counters_before = PROCESS_MEMORY_COUNTERS {
                            cb: std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32,
                            ..Default::default()
                        };
                        let _ = K32GetProcessMemoryInfo(
                            handle,
                            &mut mem_counters_before,
                            mem_counters_before.cb,
                        );

                        if K32EmptyWorkingSet(handle).as_bool() {
                            let mut mem_counters_after = PROCESS_MEMORY_COUNTERS {
                                cb: std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32,
                                ..Default::default()
                            };
                            let _ = K32GetProcessMemoryInfo(
                                handle,
                                &mut mem_counters_after,
                                mem_counters_after.cb,
                            );

                            let freed = (mem_counters_before.WorkingSetSize as u64)
                                .saturating_sub(mem_counters_after.WorkingSetSize as u64);
                            total_freed_bytes += freed;
                            trimmed_count += 1;
                        }
                    }

                    let _ = CloseHandle(handle);
                }
            }
        }

        let mb_freed = (total_freed_bytes as f64) / (1024.0 * 1024.0);

        Ok(PurgeResult {
            bytes_freed: total_freed_bytes,
            mb_freed: (mb_freed * 100.0).round() / 100.0,
            processes_trimmed: trimmed_count,
            success: true,
            message: format!(
                "Successfully trimmed working sets across {} processes ({:.2} MB reclaimed)",
                trimmed_count, mb_freed
            ),
        })
    }
    #[cfg(not(windows))]
    {
        Ok(PurgeResult {
            bytes_freed: 256 * 1024 * 1024,
            mb_freed: 256.0,
            processes_trimmed: 14,
            success: true,
            message: "Mock trimmed working sets across 14 processes".to_string(),
        })
    }
}

fn start_background_auto_trimmer_if_needed() {
    if AUTO_TRIMMER_RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }

    std::thread::spawn(move || {
        log::info!("RAM auto-trimmer background thread initialized");
        while AUTO_TRIMMER_RUNNING.load(Ordering::SeqCst) {
            let config_opt = {
                let guard = AUTO_TRIMMER_CONFIG.lock().unwrap_or_else(|e| e.into_inner());
                guard.clone()
            };

            if let Some(config) = config_opt {
                if config.enabled {
                    #[cfg(windows)]
                    {
                        if let Ok((_, _, usage_percent)) = query_system_memory_status() {
                            if usage_percent >= config.threshold_percent {
                                log::info!(
                                    "RAM auto-trimmer triggered at {:.1}% (threshold: {:.1}%)",
                                    usage_percent,
                                    config.threshold_percent
                                );

                                if config.purge_standby {
                                    let _ = execute_standby_purge_internal(StandbyPurgeMode::All);
                                }

                                if config.purge_working_sets {
                                    let _ = purge_working_sets(Vec::new());
                                }
                            }
                        }
                    }
                }

                let interval = config.interval_seconds.max(10);
                for _ in 0..interval {
                    if !AUTO_TRIMMER_RUNNING.load(Ordering::SeqCst) {
                        break;
                    }
                    std::thread::sleep(std::time::Duration::from_secs(1));
                }
            } else {
                std::thread::sleep(std::time::Duration::from_secs(5));
            }
        }
        log::info!("RAM auto-trimmer background thread terminated");
    });
}

#[tauri::command]
pub fn configure_ram_auto_trimmer(
    config: AutoTrimmerConfig,
) -> Result<AutoTrimmerConfig, AppError> {
    {
        let mut guard = AUTO_TRIMMER_CONFIG
            .lock()
            .map_err(|e| AppError::System(format!("Failed to lock AUTO_TRIMMER_CONFIG: {}", e)))?;
        *guard = Some(config.clone());
    }

    if config.enabled {
        start_background_auto_trimmer_if_needed();
    }

    Ok(config)
}

#[tauri::command]
pub fn get_ram_auto_trimmer_config() -> Result<AutoTrimmerConfig, AppError> {
    let guard = AUTO_TRIMMER_CONFIG
        .lock()
        .map_err(|e| AppError::System(format!("Failed to lock AUTO_TRIMMER_CONFIG: {}", e)))?;

    Ok(guard.clone().unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_memory_breakdown_serialization() {
        let breakdown = MemoryBreakdown {
            total_physical_bytes: 16_000_000_000,
            available_bytes: 8_000_000_000,
            used_bytes: 8_000_000_000,
            usage_percent: 50.0,
            standby_bytes: 2_000_000_000,
            modified_bytes: 500_000_000,
            free_bytes: 5_500_000_000,
            paged_pool_bytes: 400_000_000,
            non_paged_pool_bytes: 300_000_000,
            system_cache_bytes: 2_500_000_000,
        };

        let json = serde_json::to_string(&breakdown).expect("Failed to serialize breakdown");
        assert!(json.contains("totalPhysicalBytes"));
        assert!(json.contains("availableBytes"));
        assert!(json.contains("usedBytes"));
        assert!(json.contains("usagePercent"));
        assert!(json.contains("standbyBytes"));
        assert!(json.contains("systemCacheBytes"));
    }

    #[test]
    fn test_purge_result_serialization() {
        let res = PurgeResult {
            bytes_freed: 104_857_600,
            mb_freed: 100.0,
            processes_trimmed: 5,
            success: true,
            message: "Purged successfully".to_string(),
        };

        let json = serde_json::to_string(&res).expect("Failed to serialize purge result");
        assert!(json.contains("bytesFreed"));
        assert!(json.contains("mbFreed"));
        assert!(json.contains("processesTrimmed"));
        assert!(json.contains("success"));
    }

    #[test]
    fn test_auto_trimmer_config_default() {
        let config = AutoTrimmerConfig::default();
        assert!(!config.enabled);
        assert_eq!(config.threshold_percent, 85.0);
        assert_eq!(config.interval_seconds, 120);
        assert!(config.purge_standby);
        assert!(config.purge_working_sets);
        assert!(config.excluded_process_names.contains(&"dwm.exe".to_string()));
    }

    #[test]
    fn test_standby_purge_mode_serde() {
        let mode_all = StandbyPurgeMode::All;
        let mode_low = StandbyPurgeMode::LowPriorityOnly;

        let json_all = serde_json::to_string(&mode_all).unwrap();
        let json_low = serde_json::to_string(&mode_low).unwrap();

        assert_eq!(json_all, "\"all\"");
        assert_eq!(json_low, "\"lowPriorityOnly\"");
    }
}
