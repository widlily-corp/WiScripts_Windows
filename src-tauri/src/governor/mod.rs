use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};

#[cfg(target_os = "windows")]
use windows::Win32::Foundation::CloseHandle;
#[cfg(target_os = "windows")]
use windows::Win32::System::ProcessStatus::{K32GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS};
#[cfg(target_os = "windows")]
use windows::Win32::System::Threading::{
    GetPriorityClass, GetProcessAffinityMask, OpenProcess, SetPriorityClass, SetProcessAffinityMask,
    SetProcessWorkingSetSize, PROCESS_CREATION_FLAGS, PROCESS_QUERY_INFORMATION,
    PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SET_INFORMATION, PROCESS_SET_QUOTA, PROCESS_VM_READ,
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResourceGovernorRule {
    pub process_name: String,
    pub target_priority: String,
    pub core_affinity_mask: String,
    pub audio_endpoint_id: Option<String>,
    pub auto_trim_memory_mb_threshold: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ManagedProcessInfo {
    pub pid: u32,
    pub name: String,
    pub cpu_usage: f32,
    pub current_priority: String,
    pub assigned_cores: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GovernorStatus {
    pub active_rules_count: usize,
    pub pro_balance_events_triggered: u64,
    pub total_memory_trimmed_mb: u64,
    pub managed_processes: Vec<ManagedProcessInfo>,
}

struct GovernorState {
    rules: HashMap<String, ResourceGovernorRule>,
    pro_balance_events_triggered: u64,
    total_memory_trimmed_mb: u64,
}

impl GovernorState {
    fn new() -> Self {
        Self {
            rules: HashMap::new(),
            pro_balance_events_triggered: 0,
            total_memory_trimmed_mb: 0,
        }
    }
}

static GOVERNOR_STATE: OnceLock<Arc<Mutex<GovernorState>>> = OnceLock::new();

fn get_state() -> Arc<Mutex<GovernorState>> {
    GOVERNOR_STATE
        .get_or_init(|| Arc::new(Mutex::new(GovernorState::new())))
        .clone()
}

// ---------------------------------------------------------------------------
// Priority & Affinity Helpers
// ---------------------------------------------------------------------------

pub fn priority_str_to_win32(priority: &str) -> u32 {
    match priority.to_uppercase().as_str() {
        "IDLE" => 0x00000040,         // IDLE_PRIORITY_CLASS
        "BELOW_NORMAL" => 0x00004000, // BELOW_NORMAL_PRIORITY_CLASS
        "NORMAL" => 0x00000020,       // NORMAL_PRIORITY_CLASS
        "ABOVE_NORMAL" => 0x00008000, // ABOVE_NORMAL_PRIORITY_CLASS
        "HIGH" => 0x00000080,         // HIGH_PRIORITY_CLASS
        "REALTIME" => 0x00000100,     // REALTIME_PRIORITY_CLASS
        _ => 0x00000020,
    }
}

pub fn win32_to_priority_str(code: u32) -> String {
    match code {
        0x00000040 => "IDLE".to_string(),
        0x00004000 => "BELOW_NORMAL".to_string(),
        0x00000020 => "NORMAL".to_string(),
        0x00008000 => "ABOVE_NORMAL".to_string(),
        0x00000080 => "HIGH".to_string(),
        0x00000100 => "REALTIME".to_string(),
        _ => "NORMAL".to_string(),
    }
}

pub fn parse_affinity_mask(mask_str: &str) -> Result<usize, String> {
    let clean = mask_str.trim();
    if clean.is_empty() {
        return Err("Affinity mask string cannot be empty".to_string());
    }

    let mask = if clean.starts_with("0x") || clean.starts_with("0X") {
        usize::from_str_radix(&clean[2..], 16)
            .map_err(|e| format!("Invalid hex affinity mask '{}': {}", mask_str, e))?
    } else if clean.chars().all(|c| c.is_ascii_hexdigit()) && clean.chars().any(|c| c.is_alphabetic()) {
        usize::from_str_radix(clean, 16)
            .map_err(|e| format!("Invalid hex affinity mask '{}': {}", mask_str, e))?
    } else {
        clean
            .parse::<usize>()
            .map_err(|e| format!("Invalid decimal affinity mask '{}': {}", mask_str, e))?
    };

    if mask == 0 {
        return Err("Affinity mask cannot be 0 (must assign at least 1 CPU core)".to_string());
    }

    Ok(mask)
}

pub fn format_affinity_mask_hex(mask: usize) -> String {
    format!("0x{:08X}", mask)
}

pub fn format_assigned_cores(mask: usize) -> String {
    if mask == 0 {
        return "None".to_string();
    }
    if mask == usize::MAX {
        return "All Cores".to_string();
    }

    let mut set_cores = Vec::new();
    for bit in 0..(std::mem::size_of::<usize>() * 8) {
        if (mask & (1 << bit)) != 0 {
            set_cores.push(bit);
        }
    }

    if set_cores.is_empty() {
        return "None".to_string();
    }

    // Check if set_cores is a single contiguous range
    let mut ranges = Vec::new();
    let mut start = set_cores[0];
    let mut prev = set_cores[0];

    for &core in set_cores.iter().skip(1) {
        if core == prev + 1 {
            prev = core;
        } else {
            if start == prev {
                ranges.push(format!("{}", start));
            } else {
                ranges.push(format!("{}-{}", start, prev));
            }
            start = core;
            prev = core;
        }
    }
    if start == prev {
        ranges.push(format!("{}", start));
    } else {
        ranges.push(format!("{}-{}", start, prev));
    }

    if ranges.len() == 1 && set_cores.len() > 1 {
        format!("Cores {}", ranges[0])
    } else if set_cores.len() == 1 {
        format!("Core {}", ranges[0])
    } else {
        format!("Cores {}", ranges.join(", "))
    }
}

// ---------------------------------------------------------------------------
// Win32 Engine Operations
// ---------------------------------------------------------------------------

pub fn set_process_priority(pid: u32, priority_str: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let priority_code = priority_str_to_win32(priority_str);
        unsafe {
            let handle = match OpenProcess(PROCESS_SET_INFORMATION, false, pid) {
                Ok(h) => h,
                Err(e) => return Err(format!("Failed to open process PID {}: {}", pid, e)),
            };
            if handle.is_invalid() {
                return Err(format!("Invalid process handle for PID {}", pid));
            }

            let res = SetPriorityClass(handle, PROCESS_CREATION_FLAGS(priority_code));
            let _ = CloseHandle(handle);

            res.map_err(|e| format!("SetPriorityClass failed for PID {}: {}", pid, e))
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (pid, priority_str);
        Ok(())
    }
}

pub fn get_process_priority(pid: u32) -> String {
    #[cfg(target_os = "windows")]
    {
        unsafe {
            let handle = match OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
                Ok(h) => h,
                Err(_) => return "NORMAL".to_string(),
            };
            if handle.is_invalid() {
                return "NORMAL".to_string();
            }

            let code = GetPriorityClass(handle);
            let _ = CloseHandle(handle);

            if code == 0 {
                "NORMAL".to_string()
            } else {
                win32_to_priority_str(code)
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = pid;
        "NORMAL".to_string()
    }
}

pub fn set_process_affinity(pid: u32, mask_str: &str) -> Result<(), String> {
    let mask = parse_affinity_mask(mask_str)?;
    #[cfg(target_os = "windows")]
    {
        unsafe {
            let handle = match OpenProcess(PROCESS_SET_INFORMATION, false, pid) {
                Ok(h) => h,
                Err(e) => return Err(format!("Failed to open process PID {}: {}", pid, e)),
            };
            if handle.is_invalid() {
                return Err(format!("Invalid process handle for PID {}", pid));
            }

            let res = SetProcessAffinityMask(handle, mask);
            let _ = CloseHandle(handle);

            res.map_err(|e| format!("SetProcessAffinityMask failed for PID {}: {}", pid, e))
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (pid, mask);
        Ok(())
    }
}

pub fn get_process_affinity(pid: u32) -> String {
    #[cfg(target_os = "windows")]
    {
        unsafe {
            let handle = match OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
                Ok(h) => h,
                Err(_) => return "All Cores".to_string(),
            };
            if handle.is_invalid() {
                return "All Cores".to_string();
            }

            let mut process_mask: usize = 0;
            let mut system_mask: usize = 0;
            let res = GetProcessAffinityMask(handle, &mut process_mask, &mut system_mask);
            let _ = CloseHandle(handle);

            if res.is_ok() && process_mask != 0 {
                format_assigned_cores(process_mask)
            } else {
                "All Cores".to_string()
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = pid;
        "All Cores".to_string()
    }
}

pub fn trim_process_working_set_internal(pid: u32) -> Result<u64, String> {
    #[cfg(target_os = "windows")]
    {
        unsafe {
            let handle = match OpenProcess(
                PROCESS_QUERY_INFORMATION | PROCESS_SET_QUOTA | PROCESS_VM_READ,
                false,
                pid,
            ) {
                Ok(h) => h,
                Err(e) => return Err(format!("Failed to open process PID {}: {}", pid, e)),
            };
            if handle.is_invalid() {
                return Err(format!("Invalid handle for PID {}", pid));
            }

            let mut counters_before = PROCESS_MEMORY_COUNTERS {
                cb: std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32,
                ..Default::default()
            };
            let _ = K32GetProcessMemoryInfo(handle, &mut counters_before, counters_before.cb);

            let trim_res = SetProcessWorkingSetSize(handle, usize::MAX, usize::MAX);

            let mut counters_after = PROCESS_MEMORY_COUNTERS {
                cb: std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32,
                ..Default::default()
            };
            let _ = K32GetProcessMemoryInfo(handle, &mut counters_after, counters_after.cb);

            let _ = CloseHandle(handle);

            if trim_res.is_ok() {
                let before_bytes = counters_before.WorkingSetSize as u64;
                let after_bytes = counters_after.WorkingSetSize as u64;
                let trimmed_bytes = before_bytes.saturating_sub(after_bytes);
                let trimmed_mb = trimmed_bytes / (1024 * 1024);
                // Return trimmed MB, or at least 1MB if successfully trimmed a working set > 1MB
                let final_trimmed = if trimmed_mb == 0 && before_bytes > 1024 * 1024 {
                    1
                } else {
                    trimmed_mb
                };
                Ok(final_trimmed)
            } else {
                Err(format!("SetProcessWorkingSetSize failed for PID {}", pid))
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = pid;
        Ok(16) // Mock return for non-windows tests
    }
}

// ---------------------------------------------------------------------------
// Engine IPC API Implementation
// ---------------------------------------------------------------------------

pub fn apply_process_governor_rule(rule: ResourceGovernorRule) -> Result<bool, String> {
    let clean_name = rule.process_name.trim();
    if clean_name.is_empty() {
        return Err("Process name cannot be empty".to_string());
    }

    // Validate affinity mask
    parse_affinity_mask(&rule.core_affinity_mask)?;

    let valid_priorities = [
        "IDLE",
        "BELOW_NORMAL",
        "NORMAL",
        "ABOVE_NORMAL",
        "HIGH",
        "REALTIME",
    ];
    if !valid_priorities.contains(&rule.target_priority.to_uppercase().as_str()) {
        return Err(format!(
            "Invalid priority '{}'. Allowed: IDLE, BELOW_NORMAL, NORMAL, ABOVE_NORMAL, HIGH, REALTIME",
            rule.target_priority
        ));
    }

    let key = clean_name.to_lowercase();
    let state_arc = get_state();
    let mut state = state_arc
        .lock()
        .map_err(|e| format!("State lock poison: {}", e))?;

    state.rules.insert(key, rule.clone());

    // Enforce rule on currently running processes matching rule.process_name
    let mut sys = sysinfo::System::new_all();
    sys.refresh_all();

    for (pid, process) in sys.processes() {
        let p_name = process.name().to_lowercase();
        if p_name == clean_name.to_lowercase()
            || p_name == format!("{}.exe", clean_name.to_lowercase())
        {
            let pid_u32 = pid.as_u32();

            // Set Priority
            let _ = set_process_priority(pid_u32, &rule.target_priority);

            // Set Affinity
            let _ = set_process_affinity(pid_u32, &rule.core_affinity_mask);

            // Set Audio endpoint if specified
            if let Some(ref endpoint_id) = rule.audio_endpoint_id {
                let _ = crate::audio::set_app_audio_device(
                    pid_u32,
                    endpoint_id,
                    crate::audio::types::AudioFlow::Render,
                );
            }

            // Auto memory trim if memory usage exceeds threshold
            if let Some(thresh_mb) = rule.auto_trim_memory_mb_threshold {
                let mem_mb = process.memory() / (1024 * 1024);
                if mem_mb >= thresh_mb {
                    if let Ok(trimmed) = trim_process_working_set_internal(pid_u32) {
                        state.total_memory_trimmed_mb += trimmed;
                    }
                }
            }
        }
    }

    Ok(true)
}

pub fn trim_process_working_set(pid: u32) -> Result<u64, String> {
    let trimmed = trim_process_working_set_internal(pid)?;
    let state_arc = get_state();
    if let Ok(mut state) = state_arc.lock() {
        state.total_memory_trimmed_mb += trimmed;
    }
    Ok(trimmed)
}

pub fn delete_governor_rule(process_name: String) -> Result<bool, String> {
    let key = process_name.trim().to_lowercase();
    let state_arc = get_state();
    let mut state = state_arc
        .lock()
        .map_err(|e| format!("State lock poison: {}", e))?;

    Ok(state.rules.remove(&key).is_some())
}

pub fn list_active_rules() -> Result<Vec<ResourceGovernorRule>, String> {
    let state_arc = get_state();
    let state = state_arc
        .lock()
        .map_err(|e| format!("State lock poison: {}", e))?;

    let rules: Vec<ResourceGovernorRule> = state.rules.values().cloned().collect();
    Ok(rules)
}

pub fn get_governor_status() -> Result<GovernorStatus, String> {
    let mut sys = sysinfo::System::new_all();
    sys.refresh_all();

    let state_arc = get_state();
    let mut state = state_arc
        .lock()
        .map_err(|e| format!("State lock poison: {}", e))?;

    let mut managed_processes = Vec::new();

    for (pid, process) in sys.processes() {
        let pid_u32 = pid.as_u32();
        let name = process.name().to_string();
        let cpu_usage = process.cpu_usage();
        let name_lower = name.to_lowercase();
        let name_no_ext = name_lower.strip_suffix(".exe").unwrap_or(&name_lower);

        // Check if matching rule exists
        let matching_rule = state
            .rules
            .get(&name_lower)
            .or_else(|| state.rules.get(name_no_ext))
            .cloned();

        let current_priority = if let Some(ref rule) = matching_rule {
            // Enforce priority rule if different
            let curr = get_process_priority(pid_u32);
            if curr.to_uppercase() != rule.target_priority.to_uppercase() {
                let _ = set_process_priority(pid_u32, &rule.target_priority);
            }
            rule.target_priority.clone()
        } else {
            get_process_priority(pid_u32)
        };

        let assigned_cores = if let Some(ref rule) = matching_rule {
            let _ = set_process_affinity(pid_u32, &rule.core_affinity_mask);
            format_assigned_cores(parse_affinity_mask(&rule.core_affinity_mask).unwrap_or(!0))
        } else {
            get_process_affinity(pid_u32)
        };

        // ProBalance Dynamic CPU Spike Suppressor Check
        if matching_rule.is_none() && cpu_usage > 25.0 {
            // High CPU spike detected on an unruled process!
            // ProBalance dynamically suppresses spike by lowering priority to BELOW_NORMAL
            if (current_priority == "NORMAL" || current_priority == "HIGH" || current_priority == "ABOVE_NORMAL")
                && set_process_priority(pid_u32, "BELOW_NORMAL").is_ok()
            {
                state.pro_balance_events_triggered += 1;
            }
        }

        // Auto trim memory check for ruled processes
        if let Some(ref rule) = matching_rule {
            if let Some(thresh_mb) = rule.auto_trim_memory_mb_threshold {
                let mem_mb = process.memory() / (1024 * 1024);
                if mem_mb >= thresh_mb {
                    if let Ok(trimmed) = trim_process_working_set_internal(pid_u32) {
                        state.total_memory_trimmed_mb += trimmed;
                    }
                }
            }
        }

        managed_processes.push(ManagedProcessInfo {
            pid: pid_u32,
            name,
            cpu_usage,
            current_priority,
            assigned_cores,
        });
    }

    // Sort managed processes by CPU usage descending
    managed_processes.sort_by(|a, b| b.cpu_usage.partial_cmp(&a.cpu_usage).unwrap_or(std::cmp::Ordering::Equal));

    Ok(GovernorStatus {
        active_rules_count: state.rules.len(),
        pro_balance_events_triggered: state.pro_balance_events_triggered,
        total_memory_trimmed_mb: state.total_memory_trimmed_mb,
        managed_processes,
    })
}

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_priority_mapping_bidirectional() {
        // Arrange & Act & Assert
        assert_eq!(priority_str_to_win32("IDLE"), 0x00000040);
        assert_eq!(priority_str_to_win32("BELOW_NORMAL"), 0x00004000);
        assert_eq!(priority_str_to_win32("NORMAL"), 0x00000020);
        assert_eq!(priority_str_to_win32("ABOVE_NORMAL"), 0x00008000);
        assert_eq!(priority_str_to_win32("HIGH"), 0x00000080);
        assert_eq!(priority_str_to_win32("REALTIME"), 0x00000100);
        assert_eq!(priority_str_to_win32("UNKNOWN"), 0x00000020);

        assert_eq!(win32_to_priority_str(0x00000040), "IDLE");
        assert_eq!(win32_to_priority_str(0x00004000), "BELOW_NORMAL");
        assert_eq!(win32_to_priority_str(0x00000020), "NORMAL");
        assert_eq!(win32_to_priority_str(0x00008000), "ABOVE_NORMAL");
        assert_eq!(win32_to_priority_str(0x00000080), "HIGH");
        assert_eq!(win32_to_priority_str(0x00000100), "REALTIME");
        assert_eq!(win32_to_priority_str(0x9999), "NORMAL");
    }

    #[test]
    fn test_affinity_mask_parsing_hex_and_decimal() {
        // Arrange & Act & Assert
        assert_eq!(parse_affinity_mask("0x000000FF").unwrap(), 255);
        assert_eq!(parse_affinity_mask("0xFF").unwrap(), 255);
        assert_eq!(parse_affinity_mask("FF").unwrap(), 255);
        assert_eq!(parse_affinity_mask("255").unwrap(), 255);
        assert_eq!(parse_affinity_mask("0x0000000F").unwrap(), 15);

        assert!(parse_affinity_mask("0").is_err());
        assert!(parse_affinity_mask("0x0").is_err());
        assert!(parse_affinity_mask("").is_err());
        assert!(parse_affinity_mask("invalid_mask_xyz").is_err());
    }

    #[test]
    fn test_assigned_cores_formatting() {
        // Arrange & Act & Assert
        assert_eq!(format_assigned_cores(1), "Core 0");
        assert_eq!(format_assigned_cores(3), "Cores 0-1");
        assert_eq!(format_assigned_cores(255), "Cores 0-7");
        assert_eq!(format_assigned_cores(5), "Cores 0, 2");
        assert_eq!(format_assigned_cores(usize::MAX), "All Cores");
        assert_eq!(format_assigned_cores(0), "None");
    }

    #[test]
    fn test_rule_management_lifecycle() {
        // Arrange
        let rule = ResourceGovernorRule {
            process_name: "test_game.exe".to_string(),
            target_priority: "HIGH".to_string(),
            core_affinity_mask: "0x0000000F".to_string(),
            audio_endpoint_id: None,
            auto_trim_memory_mb_threshold: Some(1024),
        };

        // Act
        let apply_res = apply_process_governor_rule(rule.clone());
        assert!(apply_res.is_ok());

        let active_rules = list_active_rules().unwrap();

        // Assert
        assert!(active_rules.iter().any(|r| r.process_name == "test_game.exe"));

        // Act - delete rule
        let del_res = delete_governor_rule("test_game.exe".to_string());
        assert_eq!(del_res, Ok(true));

        let updated_rules = list_active_rules().unwrap();
        assert!(!updated_rules.iter().any(|r| r.process_name == "test_game.exe"));
    }

    #[test]
    fn test_apply_rule_validation() {
        // Arrange - empty process name
        let empty_rule = ResourceGovernorRule {
            process_name: "".to_string(),
            target_priority: "HIGH".to_string(),
            core_affinity_mask: "0x000000FF".to_string(),
            audio_endpoint_id: None,
            auto_trim_memory_mb_threshold: None,
        };
        assert!(apply_process_governor_rule(empty_rule).is_err());

        // Arrange - invalid priority
        let bad_priority_rule = ResourceGovernorRule {
            process_name: "app.exe".to_string(),
            target_priority: "ULTRA_SUPER_HIGH".to_string(),
            core_affinity_mask: "0x000000FF".to_string(),
            audio_endpoint_id: None,
            auto_trim_memory_mb_threshold: None,
        };
        assert!(apply_process_governor_rule(bad_priority_rule).is_err());

        // Arrange - invalid mask
        let bad_mask_rule = ResourceGovernorRule {
            process_name: "app.exe".to_string(),
            target_priority: "HIGH".to_string(),
            core_affinity_mask: "0x0".to_string(),
            audio_endpoint_id: None,
            auto_trim_memory_mb_threshold: None,
        };
        assert!(apply_process_governor_rule(bad_mask_rule).is_err());
    }

    #[test]
    fn test_working_set_trimming_and_status() {
        // Arrange
        let pid = std::process::id();

        // Act
        let trim_res = trim_process_working_set(pid);

        // Assert
        assert!(trim_res.is_ok());

        let status = get_governor_status().unwrap();
        assert!(status.managed_processes.len() > 0);
    }
}
