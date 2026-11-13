use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

#[cfg(windows)]
use windows::Win32::{
    Foundation::{CloseHandle, BOOL, HWND, LPARAM},
    System::{
        Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
            TH32CS_SNAPPROCESS,
        },
        ProcessStatus::{K32GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS},
        Threading::{
            GetExitCodeProcess, GetProcessAffinityMask, OpenProcess, SetPriorityClass,
            SetProcessAffinityMask, SetProcessPriorityBoost, HIGH_PRIORITY_CLASS,
            PROCESS_QUERY_INFORMATION, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SET_INFORMATION,
        },
    },
    UI::WindowsAndMessaging::{
        EnumWindows, GetForegroundWindow, GetWindowTextLengthW, GetWindowTextW,
        GetWindowThreadProcessId, IsWindowVisible,
    },
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProcessSelectorItem {
    pub pid: u32,
    pub name: String,
    pub window_title: String,
    pub memory_mb: u64,
    pub priority_class: u32,
    pub is_known_game: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DaemonStatus {
    pub active: bool,
    pub auto_detect: bool,
    pub boosted_pid: Option<u32>,
    pub boosted_name: Option<String>,
    pub timer_resolution_applied: bool,
    pub physical_affinity_applied: bool,
    pub suspended_services: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GameOptimizationConfig {
    pub target_pid: u32,
    pub process_name: String,
    pub set_high_priority: bool,
    pub pin_physical_cores: bool,
    pub set_timer_resolution: bool,
    pub purge_standby_ram: bool,
    pub suspend_services: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DaemonActiveSession {
    pub boosted_pid: u32,
    pub boosted_name: String,
    pub suspended_services: Vec<String>,
    pub timer_resolution_applied: bool,
    pub timestamp: u64,
}

struct DaemonInternalState {
    status: DaemonStatus,
    active_config: Option<GameOptimizationConfig>,
    original_affinity: Option<usize>,
}

static DAEMON_STATE: Mutex<Option<DaemonInternalState>> = Mutex::new(None);
static MONITOR_THREAD_RUNNING: AtomicBool = AtomicBool::new(false);

const KNOWN_GAME_EXECUTABLES: &[&str] = &[
    "cs2.exe",
    "csgo.exe",
    "valorant.exe",
    "valorant-win64-shipping.exe",
    "dota2.exe",
    "league of legends.exe",
    "overwatch.exe",
    "r5apex.exe",
    "apex.exe",
    "fortniteclient-win64-shipping.exe",
    "cyberpunk2077.exe",
    "gta5.exe",
    "witcher3.exe",
    "starfield.exe",
    "bg3.exe",
    "bg3_dx11.exe",
    "tslgame.exe",
    "rustclient.exe",
    "warframe.x64.exe",
    "helldivers2.exe",
    "destiny2.exe",
    "forza_horizon5.exe",
    "rainbowsix.exe",
    "eldenring.exe",
    "cod.exe",
];

fn is_known_game(name: &str) -> bool {
    let lower = name.to_lowercase();
    KNOWN_GAME_EXECUTABLES.iter().any(|&g| lower == g)
}

fn get_session_journal_path() -> PathBuf {
    let base = dirs::config_dir()
        .or_else(dirs::data_local_dir)
        .unwrap_or_else(|| PathBuf::from(r"C:\Users\Default\AppData\Roaming"));
    base.join("WiScripts").join("daemon_active_session.json")
}

fn write_session_journal(session: &DaemonActiveSession) {
    let path = get_session_journal_path();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string_pretty(session) {
        let _ = std::fs::write(&path, json);
    }
}

fn remove_session_journal() {
    let path = get_session_journal_path();
    if path.exists() {
        let _ = std::fs::remove_file(path);
    }
}

pub fn check_and_recover_daemon_session() -> Result<bool, AppError> {
    let path = get_session_journal_path();
    if !path.exists() {
        return Ok(false);
    }

    log::info!("[Daemon] Orphaned session journal found at {:?}. Executing crash recovery...", path);
    if let Ok(content) = std::fs::read_to_string(&path) {
        if let Ok(session) = serde_json::from_str::<DaemonActiveSession>(&content) {
            // 1. Restart suspended services
            for svc in &session.suspended_services {
                let _ = crate::winapi::services::start_service(svc);
                log::info!("[Daemon Recovery] Restarted suspended service: {}", svc);
            }

            // 2. Revert timer resolution to default (15.625 ms = 156250 100ns units)
            if session.timer_resolution_applied {
                let _ = crate::gaming::set_timer_resolution(156250);
                log::info!("[Daemon Recovery] Reverted timer resolution to standard (15.6 ms)");
            }
        }
    }

    remove_session_journal();
    log::info!("[Daemon Recovery] Session recovery journal cleared.");
    Ok(true)
}

fn ensure_daemon_initialized() {
    let mut lock = DAEMON_STATE.lock().unwrap();
    if lock.is_none() {
        *lock = Some(DaemonInternalState {
            status: DaemonStatus {
                active: true,
                auto_detect: false,
                boosted_pid: None,
                boosted_name: None,
                timer_resolution_applied: false,
                physical_affinity_applied: false,
                suspended_services: Vec::new(),
            },
            active_config: None,
            original_affinity: None,
        });
    }
}

#[cfg(windows)]
struct WindowEnumContext {
    pid: u32,
    title: String,
}

#[cfg(windows)]
unsafe extern "system" fn enum_windows_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let ctx = &mut *(lparam.0 as *mut WindowEnumContext);
    let mut win_pid = 0u32;
    GetWindowThreadProcessId(hwnd, Some(&mut win_pid));

    if win_pid == ctx.pid && IsWindowVisible(hwnd).as_bool() {
        let len = GetWindowTextLengthW(hwnd);
        if len > 0 {
            let mut buf = vec![0u16; (len + 1) as usize];
            let copied = GetWindowTextW(hwnd, &mut buf);
            if copied > 0 {
                let text = String::from_utf16_lossy(&buf[..copied as usize]);
                if !text.trim().is_empty() {
                    ctx.title = text.trim().to_string();
                    return BOOL(0); // Stop enumerating
                }
            }
        }
    }
    BOOL(1)
}

#[cfg(windows)]
fn get_window_title_for_pid(pid: u32) -> String {
    let mut ctx = WindowEnumContext {
        pid,
        title: String::new(),
    };
    unsafe {
        let _ = EnumWindows(
            Some(enum_windows_callback),
            LPARAM(&mut ctx as *mut _ as isize),
        );
    }
    ctx.title
}

pub fn get_running_processes_for_selector() -> Result<Vec<ProcessSelectorItem>, AppError> {
    #[cfg(windows)]
    {
        let mut results = Vec::new();
        unsafe {
            let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
                .map_err(|e| AppError::System(format!("Failed to create toolhelp snapshot: {}", e)))?;

            let mut entry = PROCESSENTRY32W::default();
            entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;

            let system_exclusions: HashSet<&str> = [
                "system",
                "registry",
                "smss.exe",
                "csrss.exe",
                "wininit.exe",
                "services.exe",
                "lsass.exe",
                "svchost.exe",
                "fontdrvhost.exe",
                "dwm.exe",
                "conhost.exe",
                "sihost.exe",
                "wiscripts_windows.exe",
            ]
            .into_iter()
            .collect();

            if Process32FirstW(snapshot, &mut entry).is_ok() {
                loop {
                    let pid = entry.th32ProcessID;
                    if pid > 4 {
                        let name_len = entry
                            .szExeFile
                            .iter()
                            .position(|&c| c == 0)
                            .unwrap_or(entry.szExeFile.len());
                        let name = String::from_utf16_lossy(&entry.szExeFile[..name_len]);
                        let lower_name = name.to_lowercase();

                        if !system_exclusions.contains(lower_name.as_str()) {
                            let mut memory_mb = 0u64;
                            let priority = 0u32;

                            if let Ok(handle) = OpenProcess(
                                PROCESS_QUERY_LIMITED_INFORMATION,
                                false,
                                pid,
                            ) {
                                let mut pmc = PROCESS_MEMORY_COUNTERS::default();
                                pmc.cb = std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32;
                                if K32GetProcessMemoryInfo(
                                    handle,
                                    &mut pmc,
                                    std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32,
                                )
                                .as_bool()
                                {
                                    memory_mb = (pmc.WorkingSetSize / (1024 * 1024)) as u64;
                                }
                                let _ = CloseHandle(handle);
                            }

                            let window_title = get_window_title_for_pid(pid);
                            let known = is_known_game(&name);

                            // Only include processes that have either a visible window, are known games, or have > 50 MB RAM
                            if !window_title.is_empty() || known || memory_mb >= 50 {
                                results.push(ProcessSelectorItem {
                                    pid,
                                    name,
                                    window_title,
                                    memory_mb,
                                    priority_class: priority,
                                    is_known_game: known,
                                });
                            }
                        }
                    }

                    if Process32NextW(snapshot, &mut entry).is_err() {
                        break;
                    }
                }
            }
            let _ = CloseHandle(snapshot);
        }

        // Sort: Known games first, then by memory usage descending
        results.sort_by(|a, b| {
            b.is_known_game
                .cmp(&a.is_known_game)
                .then_with(|| b.memory_mb.cmp(&a.memory_mb))
        });

        Ok(results)
    }

    #[cfg(not(windows))]
    {
        Ok(vec![
            ProcessSelectorItem {
                pid: 1337,
                name: "mock_game.exe".to_string(),
                window_title: "Mock Game Window".to_string(),
                memory_mb: 2048,
                priority_class: 32,
                is_known_game: true,
            },
            ProcessSelectorItem {
                pid: 2468,
                name: "browser.exe".to_string(),
                window_title: "Browser".to_string(),
                memory_mb: 512,
                priority_class: 32,
                is_known_game: false,
            },
        ])
    }
}

pub fn optimize_game_process(config: GameOptimizationConfig) -> Result<DaemonStatus, AppError> {
    ensure_daemon_initialized();
    let pid = config.target_pid;

    #[cfg(windows)]
    {
        let mut original_mask = 0usize;
        let mut sys_mask = 0usize;

        // 1. Process Priority & Affinity Tuning
        if let Ok(handle) = unsafe {
            OpenProcess(
                PROCESS_SET_INFORMATION | PROCESS_QUERY_INFORMATION,
                false,
                pid,
            )
        } {
            unsafe {
                if config.set_high_priority {
                    let _ = SetPriorityClass(handle, HIGH_PRIORITY_CLASS);
                    let _ = SetProcessPriorityBoost(handle, false);
                }

                if config.pin_physical_cores {
                    if GetProcessAffinityMask(handle, &mut original_mask, &mut sys_mask).is_ok() {
                        // Mask physical cores (even bits: 0, 2, 4...)
                        let physical_mask = original_mask & 0x5555_5555_5555_5555usize;
                        if physical_mask > 0 {
                            let _ = SetProcessAffinityMask(handle, physical_mask);
                        }
                    }
                }
                let _ = CloseHandle(handle);
            }
        }

        // 2. High-precision system timer resolution (0.5 ms)
        let mut timer_applied = false;
        if config.set_timer_resolution {
            timer_applied = crate::gaming::set_timer_resolution(5000).is_ok();
        }

        // 3. Purge Standby Memory
        if config.purge_standby_ram {
            let _ = crate::memory::purge_standby_memory(crate::memory::StandbyPurgeMode::All);
        }

        // 4. Suspend non-essential services
        let mut suspended = Vec::new();
        if config.suspend_services {
            let services = ["SysMain", "DiagTrack", "WSearch", "Spooler"];
            for svc in &services {
                if let Ok(status) = crate::winapi::services::query_service_status(svc) {
                    if status == 4 && crate::winapi::services::stop_service(svc).is_ok() {
                        suspended.push(svc.to_string());
                    }
                }
            }
        }

        // 5. Write crash recovery journal
        let session = DaemonActiveSession {
            boosted_pid: pid,
            boosted_name: config.process_name.clone(),
            suspended_services: suspended.clone(),
            timer_resolution_applied: timer_applied,
            timestamp: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0),
        };
        write_session_journal(&session);

        // 6. Update internal daemon state
        let status = {
            let mut lock = DAEMON_STATE.lock().unwrap();
            let state = lock.as_mut().unwrap();
            state.status.active = true;
            state.status.boosted_pid = Some(pid);
            state.status.boosted_name = Some(config.process_name.clone());
            state.status.timer_resolution_applied = timer_applied;
            state.status.physical_affinity_applied = config.pin_physical_cores;
            state.status.suspended_services = suspended.clone();
            state.active_config = Some(config);
            state.original_affinity = if original_mask > 0 {
                Some(original_mask)
            } else {
                None
            };
            state.status.clone()
        };

        // Ensure background monitor thread is running
        ensure_monitor_thread_running();

        Ok(status)
    }

    #[cfg(not(windows))]
    {
        let mut lock = DAEMON_STATE.lock().unwrap();
        let state = lock.as_mut().unwrap();
        state.status.active = true;
        state.status.boosted_pid = Some(pid);
        state.status.boosted_name = Some(config.process_name);
        state.status.timer_resolution_applied = config.set_timer_resolution;
        state.status.physical_affinity_applied = config.pin_physical_cores;
        Ok(state.status.clone())
    }
}

pub fn restore_game_process() -> Result<DaemonStatus, AppError> {
    ensure_daemon_initialized();

    #[cfg(windows)]
    {
        let (boosted_pid, orig_affinity, suspended, timer_applied) = {
            let mut lock = DAEMON_STATE.lock().unwrap();
            let state = lock.as_mut().unwrap();
            let pid = state.status.boosted_pid;
            let aff = state.original_affinity;
            let susp = state.status.suspended_services.clone();
            let timer = state.status.timer_resolution_applied;

            state.status.boosted_pid = None;
            state.status.boosted_name = None;
            state.status.timer_resolution_applied = false;
            state.status.physical_affinity_applied = false;
            state.status.suspended_services.clear();
            state.active_config = None;
            state.original_affinity = None;

            (pid, aff, susp, timer)
        };

        // 1. Revert CPU affinity if process still alive
        if let (Some(pid), Some(mask)) = (boosted_pid, orig_affinity) {
            unsafe {
                if let Ok(handle) = OpenProcess(PROCESS_SET_INFORMATION, false, pid) {
                    let _ = SetProcessAffinityMask(handle, mask);
                    let _ = CloseHandle(handle);
                }
            }
        }

        // 2. Revert timer resolution
        if timer_applied {
            let _ = crate::gaming::set_timer_resolution(156250);
        }

        // 3. Restart suspended services
        for svc in &suspended {
            let _ = crate::winapi::services::start_service(svc);
        }

        // 4. Remove session journal
        remove_session_journal();

        let lock = DAEMON_STATE.lock().unwrap();
        Ok(lock.as_ref().unwrap().status.clone())
    }

    #[cfg(not(windows))]
    {
        let mut lock = DAEMON_STATE.lock().unwrap();
        let state = lock.as_mut().unwrap();
        state.status.boosted_pid = None;
        state.status.boosted_name = None;
        state.status.timer_resolution_applied = false;
        state.status.physical_affinity_applied = false;
        state.status.suspended_services.clear();
        Ok(state.status.clone())
    }
}

pub fn get_daemon_status() -> Result<DaemonStatus, AppError> {
    ensure_daemon_initialized();
    let lock = DAEMON_STATE.lock().unwrap();
    Ok(lock.as_ref().unwrap().status.clone())
}

pub fn set_daemon_auto_detect(enabled: bool) -> Result<DaemonStatus, AppError> {
    ensure_daemon_initialized();
    let mut lock = DAEMON_STATE.lock().unwrap();
    let state = lock.as_mut().unwrap();
    state.status.auto_detect = enabled;
    ensure_monitor_thread_running();
    Ok(state.status.clone())
}

fn is_process_alive(pid: u32) -> bool {
    #[cfg(windows)]
    unsafe {
        if let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
            let mut exit_code = 0u32;
            let res = GetExitCodeProcess(handle, &mut exit_code);
            let _ = CloseHandle(handle);
            return res.is_ok() && exit_code == 259; // 259 is STILL_ACTIVE
        }
        false
    }
    #[cfg(not(windows))]
    {
        let _ = pid;
        true
    }
}

fn ensure_monitor_thread_running() {
    if MONITOR_THREAD_RUNNING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_ok()
    {
        std::thread::spawn(|| {
            log::info!("[Daemon] Background monitor thread started.");
            loop {
                std::thread::sleep(std::time::Duration::from_millis(1500));

                let (boosted_pid, auto_detect) = {
                    let lock = DAEMON_STATE.lock().unwrap();
                    if let Some(ref state) = *lock {
                        (state.status.boosted_pid, state.status.auto_detect)
                    } else {
                        (None, false)
                    }
                };

                // Check liveness of active boosted game process
                if let Some(pid) = boosted_pid {
                    if !is_process_alive(pid) {
                        log::info!("[Daemon] Boosted process PID {} exited. Triggering auto-restore...", pid);
                        let _ = restore_game_process();
                    }
                } else if auto_detect {
                    // Check if foreground window is a known game
                    #[cfg(windows)]
                    unsafe {
                        let hwnd = GetForegroundWindow();
                        if !hwnd.0.is_null() {
                            let mut fg_pid = 0u32;
                            GetWindowThreadProcessId(hwnd, Some(&mut fg_pid));
                            if fg_pid > 4 {
                                if let Ok(handle) = OpenProcess(
                                    PROCESS_QUERY_LIMITED_INFORMATION,
                                    false,
                                    fg_pid,
                                ) {
                                    let mut name_buf = [0u16; 260];
                                    let len = windows::Win32::System::ProcessStatus::K32GetProcessImageFileNameW(
                                        handle,
                                        &mut name_buf,
                                    );
                                    let _ = CloseHandle(handle);
                                    if len > 0 {
                                        let path = String::from_utf16_lossy(&name_buf[..len as usize]);
                                        let name = path.rsplit('\\').next().unwrap_or(&path).to_string();
                                        if is_known_game(&name) {
                                            log::info!("[Daemon] Auto-detected game process '{}' (PID {}). Auto-boosting...", name, fg_pid);
                                            let _ = optimize_game_process(GameOptimizationConfig {
                                                target_pid: fg_pid,
                                                process_name: name,
                                                set_high_priority: true,
                                                pin_physical_cores: true,
                                                set_timer_resolution: true,
                                                purge_standby_ram: true,
                                                suspend_services: true,
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_known_game_detection() {
        assert!(is_known_game("CS2.exe"));
        assert!(is_known_game("csgo.exe"));
        assert!(is_known_game("valorant.exe"));
        assert!(is_known_game("Cyberpunk2077.exe"));
        assert!(!is_known_game("notepad.exe"));
        assert!(!is_known_game("explorer.exe"));
    }

    #[test]
    fn test_physical_affinity_mask_calculation() {
        // 8 logical cores mask (0xFF = 1111 1111)
        let mask = 0xFFusize;
        let physical_mask = mask & 0x5555_5555_5555_5555usize;
        // Even bits: 0, 2, 4, 6 -> 0b01010101 = 0x55
        assert_eq!(physical_mask, 0x55usize);
    }

    #[test]
    fn test_session_journal_serialization() {
        let session = DaemonActiveSession {
            boosted_pid: 9999,
            boosted_name: "test_game.exe".to_string(),
            suspended_services: vec!["SysMain".to_string()],
            timer_resolution_applied: true,
            timestamp: 12345678,
        };

        let json = serde_json::to_string(&session).unwrap();
        let deserialized: DaemonActiveSession = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.boosted_pid, 9999);
        assert_eq!(deserialized.boosted_name, "test_game.exe");
        assert_eq!(deserialized.suspended_services.len(), 1);
        assert!(deserialized.timer_resolution_applied);
    }
}
