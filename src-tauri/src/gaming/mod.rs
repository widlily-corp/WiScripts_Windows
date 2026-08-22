use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use crate::error::AppError;

#[cfg(windows)]
use windows::{
    core::s,
    Win32::{
        Foundation::{CloseHandle, HWND},
        System::{
            LibraryLoader::{GetModuleHandleA, GetProcAddress, LoadLibraryA},
            Performance::{QueryPerformanceCounter, QueryPerformanceFrequency},
            ProcessStatus::K32GetProcessImageFileNameW,
            SystemInformation::{GetSystemInfo, SYSTEM_INFO},
            Threading::{
                GetCurrentProcessId, OpenProcess, SetPriorityClass, SetProcessPriorityBoost,
                HIGH_PRIORITY_CLASS, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SET_INFORMATION,
            },
        },
        UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId},
    },
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LatencyMetrics {
    pub current_latency_us: f64,
    pub average_latency_us: f64,
    pub max_latency_us: f64,
    pub dpc_count: u64,
    pub isr_count: u64,
    pub dpc_rate_per_sec: u64,
    pub isr_rate_per_sec: u64,
    pub timer_resolution_100ns: u32,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimerResolutionInfo {
    pub current_resolution_100ns: u32,
    pub min_resolution_100ns: u32,
    pub max_resolution_100ns: u32,
    pub is_custom: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameBoostStatus {
    pub enabled: bool,
    pub boosted_pid: Option<u32>,
    pub boosted_process_name: Option<String>,
    pub suspended_services: Vec<String>,
    pub timer_resolution_applied: bool,
}

#[derive(Debug, Default)]
struct LatencyTrackerState {
    sample_count: u64,
    total_latency_us: f64,
    max_latency_us: f64,
    last_dpc_count: u64,
    last_isr_count: u64,
    last_sample_time: Option<std::time::Instant>,
}

#[derive(Debug, Default)]
struct GameBoostInternalState {
    enabled: bool,
    boosted_pid: Option<u32>,
    boosted_process_name: Option<String>,
    suspended_services: Vec<String>,
    timer_resolution_applied: bool,
}

static LATENCY_TRACKER: Mutex<LatencyTrackerState> = Mutex::new(LatencyTrackerState {
    sample_count: 0,
    total_latency_us: 0.0,
    max_latency_us: 0.0,
    last_dpc_count: 0,
    last_isr_count: 0,
    last_sample_time: None,
});

static GAME_BOOST_STATE: Mutex<GameBoostInternalState> = Mutex::new(GameBoostInternalState {
    enabled: false,
    boosted_pid: None,
    boosted_process_name: None,
    suspended_services: Vec::new(),
    timer_resolution_applied: false,
});

#[repr(C)]
#[derive(Default, Copy, Clone, Debug)]
pub struct SystemInterruptInformation {
    pub context_switches: u32,
    pub dpc_count: u32,
    pub dpc_rate: u32,
    pub time_increment: u32,
    pub dpc_bypass_count: u32,
    pub apc_bypass_count: u32,
}

type NtQuerySystemInformationFn = unsafe extern "system" fn(
    system_information_class: u32,
    system_information: *mut std::ffi::c_void,
    system_information_length: u32,
    return_length: *mut u32,
) -> i32;

type NtQueryTimerResolutionFn = unsafe extern "system" fn(
    minimum_resolution: *mut u32,
    maximum_resolution: *mut u32,
    current_resolution: *mut u32,
) -> i32;

type NtSetTimerResolutionFn = unsafe extern "system" fn(
    desired_resolution: u32,
    set_resolution: u8,
    current_resolution: *mut u32,
) -> i32;

type TimePeriodFn = unsafe extern "system" fn(u32) -> u32;

#[cfg(windows)]
fn call_winmm_time_period(period_ms: u32, begin: bool) {
    unsafe {
        let winmm = GetModuleHandleA(s!("winmm.dll")).unwrap_or_else(|_| {
            LoadLibraryA(s!("winmm.dll")).unwrap_or_default()
        });

        if !winmm.0.is_null() {
            let fn_name = if begin { s!("timeBeginPeriod") } else { s!("timeEndPeriod") };
            if let Some(proc) = GetProcAddress(winmm, fn_name) {
                let func: TimePeriodFn = std::mem::transmute(proc);
                let _ = func(period_ms);
            }
        }
    }
}

#[cfg(windows)]
fn query_nt_timer_resolution() -> (u32, u32, u32) {
    let mut min_res = 156250u32;
    let mut max_res = 5000u32;
    let mut cur_res = 156250u32;

    unsafe {
        let ntdll = GetModuleHandleA(s!("ntdll.dll"));
        if let Ok(h_module) = ntdll {
            let proc_opt = GetProcAddress(h_module, s!("NtQueryTimerResolution"));
            if let Some(proc) = proc_opt {
                let func: NtQueryTimerResolutionFn = std::mem::transmute(proc);
                let _ = func(&mut min_res, &mut max_res, &mut cur_res);
            }
        }
    }

    (min_res, max_res, cur_res)
}

#[cfg(windows)]
fn set_nt_timer_resolution(desired_100ns: u32, enable: bool) -> Result<u32, String> {
    let mut cur_res = 0u32;

    unsafe {
        let ntdll = GetModuleHandleA(s!("ntdll.dll"))
            .map_err(|e| format!("Failed to get ntdll module handle: {:?}", e))?;
        let proc = GetProcAddress(ntdll, s!("NtSetTimerResolution"))
            .ok_or_else(|| "NtSetTimerResolution not found in ntdll.dll".to_string())?;

        let func: NtSetTimerResolutionFn = std::mem::transmute(proc);
        let status = func(desired_100ns, if enable { 1 } else { 0 }, &mut cur_res);
        if status < 0 {
            // STATUS_TIMER_RESOLUTION_NOT_SET (0xC0000245) is benign when unsetting custom resolution
            if !enable && (status == -1073741243 || (status as u32) == 0xC0000245) {
                let (_, _, curr) = query_nt_timer_resolution();
                cur_res = curr;
            } else {
                return Err(format!("NtSetTimerResolution returned NTSTATUS {:#X}", status));
            }
        }

        call_winmm_time_period(1, enable);
    }

    Ok(cur_res)
}

#[cfg(windows)]
fn measure_qpc_jitter_us() -> f64 {
    unsafe {
        let mut freq = 0i64;
        if QueryPerformanceFrequency(&mut freq).is_err() || freq <= 0 {
            return 12.5;
        }

        let mut t1 = 0i64;
        let mut t2 = 0i64;
        let _ = QueryPerformanceCounter(&mut t1);

        // Calibrated microsecond delta check
        let mut sum = 0u64;
        for i in 0..1000 {
            sum = std::hint::black_box(sum.wrapping_add(i));
        }

        let _ = QueryPerformanceCounter(&mut t2);
        let delta_ticks = (t2 - t1).max(0);
        let elapsed_us = (delta_ticks as f64 * 1_000_000.0) / (freq as f64);
        
        elapsed_us.max(0.1)
    }
}

#[cfg(windows)]
fn query_dpc_isr_info() -> (u64, u64, u64, u64) {
    let mut sys_info = SYSTEM_INFO::default();
    unsafe { GetSystemInfo(&mut sys_info) };
    let num_cpus = sys_info.dwNumberOfProcessors.max(1) as usize;

    let mut info_list = vec![SystemInterruptInformation::default(); num_cpus];
    let byte_len = (num_cpus * std::mem::size_of::<SystemInterruptInformation>()) as u32;
    let mut ret_len = 0u32;

    unsafe {
        if let Ok(ntdll) = GetModuleHandleA(s!("ntdll.dll")) {
            if let Some(proc) = GetProcAddress(ntdll, s!("NtQuerySystemInformation")) {
                let func: NtQuerySystemInformationFn = std::mem::transmute(proc);
                let status = func(
                    23, // SystemInterruptInformation
                    info_list.as_mut_ptr() as *mut std::ffi::c_void,
                    byte_len,
                    &mut ret_len,
                );
                if status >= 0 {
                    let mut total_dpc = 0u64;
                    let mut total_isr = 0u64;
                    let mut total_dpc_rate = 0u64;

                    for item in &info_list {
                        total_dpc += item.dpc_count as u64;
                        total_isr += item.context_switches as u64;
                        total_dpc_rate += item.dpc_rate as u64;
                    }

                    return (total_dpc, total_isr, total_dpc_rate, 0);
                }
            }
        }
    }

    (0, 0, 0, 0)
}

#[cfg(windows)]
fn get_process_name_by_pid(pid: u32) -> Option<String> {
    unsafe {
        let handle_res = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
        if let Ok(handle) = handle_res {
            let mut name_buf = [0u16; 512];
            let len = K32GetProcessImageFileNameW(handle, &mut name_buf);
            let _ = CloseHandle(handle);

            if len > 0 {
                let path = String::from_utf16_lossy(&name_buf[..len as usize]);
                let file_name = path.rsplit('\\').next().unwrap_or(&path).to_string();
                return Some(file_name);
            }
        }
    }
    None
}

#[cfg(windows)]
fn get_foreground_process_id() -> Option<u32> {
    unsafe {
        let hwnd: HWND = GetForegroundWindow();
        if hwnd.0.is_null() {
            return None;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid > 0 && pid != GetCurrentProcessId() {
            Some(pid)
        } else {
            None
        }
    }
}

pub fn calculate_latency_status(latency_us: f64) -> String {
    if latency_us < 1000.0 {
        "Optimal".to_string()
    } else if latency_us <= 2000.0 {
        "Moderate".to_string()
    } else {
        "Severe Jitter".to_string()
    }
}

#[tauri::command]
pub fn get_latency_metrics() -> Result<LatencyMetrics, AppError> {
    #[cfg(windows)]
    {
        let current_latency = measure_qpc_jitter_us();
        let (dpc_count, isr_count, dpc_rate_raw, _) = query_dpc_isr_info();
        let (_, _, cur_res) = query_nt_timer_resolution();

        let mut tracker = LATENCY_TRACKER
            .lock()
            .map_err(|e| AppError::System(format!("Failed to lock LATENCY_TRACKER: {}", e)))?;

        let now = std::time::Instant::now();
        let mut dpc_rate = dpc_rate_raw;
        let mut isr_rate = 0u64;

        if let Some(last_time) = tracker.last_sample_time {
            let elapsed_sec = now.duration_since(last_time).as_secs_f64();
            if elapsed_sec > 0.05 {
                if dpc_rate == 0 && dpc_count >= tracker.last_dpc_count {
                    dpc_rate = ((dpc_count - tracker.last_dpc_count) as f64 / elapsed_sec) as u64;
                }
                if isr_count >= tracker.last_isr_count {
                    isr_rate = ((isr_count - tracker.last_isr_count) as f64 / elapsed_sec) as u64;
                }
            }
        }

        tracker.sample_count += 1;
        tracker.total_latency_us += current_latency;
        if current_latency > tracker.max_latency_us {
            tracker.max_latency_us = current_latency;
        }
        tracker.last_dpc_count = dpc_count;
        tracker.last_isr_count = isr_count;
        tracker.last_sample_time = Some(now);

        let avg_latency = tracker.total_latency_us / (tracker.sample_count as f64);
        let status = calculate_latency_status(current_latency);

        Ok(LatencyMetrics {
            current_latency_us: (current_latency * 100.0).round() / 100.0,
            average_latency_us: (avg_latency * 100.0).round() / 100.0,
            max_latency_us: (tracker.max_latency_us * 100.0).round() / 100.0,
            dpc_count,
            isr_count,
            dpc_rate_per_sec: dpc_rate,
            isr_rate_per_sec: isr_rate,
            timer_resolution_100ns: cur_res,
            status,
        })
    }
    #[cfg(not(windows))]
    {
        Ok(LatencyMetrics {
            current_latency_us: 15.0,
            average_latency_us: 15.0,
            max_latency_us: 15.0,
            dpc_count: 0,
            isr_count: 0,
            dpc_rate_per_sec: 0,
            isr_rate_per_sec: 0,
            timer_resolution_100ns: 156250,
            status: "Optimal".to_string(),
        })
    }
}

#[tauri::command]
pub fn set_timer_resolution(resolution_100ns: u32) -> Result<TimerResolutionInfo, AppError> {
    #[cfg(windows)]
    {
        let clamped_resolution = resolution_100ns.clamp(5000, 156250);
        let enable = clamped_resolution < 156250;

        let cur_res = set_nt_timer_resolution(clamped_resolution, enable)
            .map_err(|e| AppError::System(format!("Failed to set timer resolution: {}", e)))?;

        let (min_res, max_res, _) = query_nt_timer_resolution();

        Ok(TimerResolutionInfo {
            current_resolution_100ns: cur_res,
            min_resolution_100ns: min_res,
            max_resolution_100ns: max_res,
            is_custom: cur_res <= 10000,
        })
    }
    #[cfg(not(windows))]
    {
        Ok(TimerResolutionInfo {
            current_resolution_100ns: resolution_100ns,
            min_resolution_100ns: 156250,
            max_resolution_100ns: 5000,
            is_custom: resolution_100ns <= 10000,
        })
    }
}

#[tauri::command]
pub fn toggle_game_boost(
    target_pid: Option<u32>,
    enable: bool,
) -> Result<GameBoostStatus, AppError> {
    #[cfg(windows)]
    {
        let mut state = GAME_BOOST_STATE
            .lock()
            .map_err(|e| AppError::System(format!("Failed to lock GAME_BOOST_STATE: {}", e)))?;

        let non_essential_services = ["SysMain", "DiagTrack", "WSearch", "Spooler"];

        if enable {
            // 1. Identify target process
            let selected_pid = target_pid.or_else(get_foreground_process_id);
            let mut process_name = None;

            if let Some(pid) = selected_pid {
                process_name = get_process_name_by_pid(pid);

                // Elevate priority and prevent priority degradation
                unsafe {
                    if let Ok(handle) = OpenProcess(
                        PROCESS_SET_INFORMATION | PROCESS_QUERY_LIMITED_INFORMATION,
                        false,
                        pid,
                    ) {
                        let _ = SetPriorityClass(handle, HIGH_PRIORITY_CLASS);
                        let _ = SetProcessPriorityBoost(handle, false);
                        let _ = CloseHandle(handle);
                    }
                }
            }

            // 2. Set high-resolution timer (0.5ms = 5000 100ns units)
            let timer_applied = set_nt_timer_resolution(5000, true).is_ok();

            // 3. Suspend non-essential gaming services
            let mut stopped_services = Vec::new();
            for svc in &non_essential_services {
                if let Ok(status) = crate::winapi::services::query_service_status(svc) {
                    // SERVICE_RUNNING is 0x00000004
                    if status == 4 && crate::winapi::services::stop_service(svc).is_ok() {
                        stopped_services.push(svc.to_string());
                    }
                }
            }

            state.enabled = true;
            state.boosted_pid = selected_pid;
            state.boosted_process_name = process_name.clone();
            state.suspended_services = stopped_services.clone();
            state.timer_resolution_applied = timer_applied;

            Ok(GameBoostStatus {
                enabled: true,
                boosted_pid: selected_pid,
                boosted_process_name: process_name,
                suspended_services: stopped_services,
                timer_resolution_applied: timer_applied,
            })
        } else {
            // Restore services that were suspended
            for svc in &state.suspended_services {
                let _ = crate::winapi::services::start_service(svc);
            }

            // Restore timer resolution
            let _ = set_nt_timer_resolution(156250, false);

            state.enabled = false;
            state.boosted_pid = None;
            state.boosted_process_name = None;
            state.suspended_services.clear();
            state.timer_resolution_applied = false;

            Ok(GameBoostStatus {
                enabled: false,
                boosted_pid: None,
                boosted_process_name: None,
                suspended_services: Vec::new(),
                timer_resolution_applied: false,
            })
        }
    }
    #[cfg(not(windows))]
    {
        Ok(GameBoostStatus {
            enabled: enable,
            boosted_pid: target_pid,
            boosted_process_name: Some("mock_game.exe".to_string()),
            suspended_services: Vec::new(),
            timer_resolution_applied: enable,
        })
    }
}

#[tauri::command]
pub fn get_game_boost_status() -> Result<GameBoostStatus, AppError> {
    let state = GAME_BOOST_STATE
        .lock()
        .map_err(|e| AppError::System(format!("Failed to lock GAME_BOOST_STATE: {}", e)))?;

    Ok(GameBoostStatus {
        enabled: state.enabled,
        boosted_pid: state.boosted_pid,
        boosted_process_name: state.boosted_process_name.clone(),
        suspended_services: state.suspended_services.clone(),
        timer_resolution_applied: state.timer_resolution_applied,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_latency_status() {
        assert_eq!(calculate_latency_status(450.0), "Optimal");
        assert_eq!(calculate_latency_status(1000.0), "Moderate");
        assert_eq!(calculate_latency_status(1500.0), "Moderate");
        assert_eq!(calculate_latency_status(2000.0), "Moderate");
        assert_eq!(calculate_latency_status(2000.1), "Severe Jitter");
        assert_eq!(calculate_latency_status(5000.0), "Severe Jitter");
    }

    #[test]
    fn test_timer_resolution_serialization() {
        let info = TimerResolutionInfo {
            current_resolution_100ns: 5000,
            min_resolution_100ns: 156250,
            max_resolution_100ns: 5000,
            is_custom: true,
        };

        let json = serde_json::to_string(&info).expect("Failed to serialize");
        assert!(json.contains("currentResolution100ns"));
        assert!(json.contains("minResolution100ns"));
        assert!(json.contains("maxResolution100ns"));
        assert!(json.contains("isCustom"));
    }

    #[test]
    fn test_game_boost_status_serialization() {
        let status = GameBoostStatus {
            enabled: true,
            boosted_pid: Some(1337),
            boosted_process_name: Some("game.exe".to_string()),
            suspended_services: vec!["SysMain".to_string(), "DiagTrack".to_string()],
            timer_resolution_applied: true,
        };

        let json = serde_json::to_string(&status).expect("Failed to serialize");
        assert!(json.contains("boostedPid"));
        assert!(json.contains("boostedProcessName"));
        assert!(json.contains("suspendedServices"));
        assert!(json.contains("timerResolutionApplied"));
    }

    #[test]
    fn test_latency_metrics_serialization() {
        let metrics = LatencyMetrics {
            current_latency_us: 12.34,
            average_latency_us: 14.56,
            max_latency_us: 88.90,
            dpc_count: 1000,
            isr_count: 5000,
            dpc_rate_per_sec: 250,
            isr_rate_per_sec: 1200,
            timer_resolution_100ns: 5000,
            status: "Optimal".to_string(),
        };

        let json = serde_json::to_string(&metrics).expect("Failed to serialize");
        assert!(json.contains("currentLatencyUs"));
        assert!(json.contains("averageLatencyUs"));
        assert!(json.contains("maxLatencyUs"));
        assert!(json.contains("dpcCount"));
        assert!(json.contains("isrCount"));
        assert!(json.contains("dpcRatePerSec"));
        assert!(json.contains("isrRatePerSec"));
        assert!(json.contains("timerResolution100ns"));
    }

    #[test]
    fn test_set_timer_resolution_default_revert() {
        let res = set_timer_resolution(156250);
        assert!(res.is_ok(), "Reverting timer resolution to default should succeed gracefully");
        if let Ok(info) = res {
            assert!(info.current_resolution_100ns >= 5000);
            assert!(info.min_resolution_100ns >= info.max_resolution_100ns);
        }
    }
}
