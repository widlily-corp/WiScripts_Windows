use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::{Ipv4Addr, Ipv6Addr};
use std::process::Command;
use crate::error::AppError;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(windows)]
use windows::Win32::{
    Foundation::CloseHandle,
    NetworkManagement::IpHelper::{
        GetExtendedTcpTable, GetExtendedUdpTable, MIB_TCP6TABLE_OWNER_PID,
        MIB_TCPTABLE_OWNER_PID, MIB_UDP6TABLE_OWNER_PID, MIB_UDPTABLE_OWNER_PID,
        TCP_TABLE_OWNER_PID_ALL, UDP_TABLE_OWNER_PID,
    },
    Networking::WinSock::{AF_INET, AF_INET6},
    System::{
        ProcessStatus::K32GetProcessImageFileNameW,
        Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION},
    },
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkConnection {
    pub protocol: String,
    pub local_address: String,
    pub local_port: u16,
    pub remote_address: String,
    pub remote_port: u16,
    pub state: String,
    pub pid: u32,
    pub process_name: String,
    pub process_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FirewallRuleInfo {
    pub name: String,
    pub direction: String,
    pub action: String,
    pub program: String,
    pub enabled: bool,
    pub profile: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FirewallActionResult {
    pub success: bool,
    pub rule_name: String,
    pub message: String,
}

pub fn decode_port(port_raw: u32) -> u16 {
    (((port_raw & 0xFF) << 8) | ((port_raw >> 8) & 0xFF)) as u16
}

pub fn tcp_state_to_string(state: u32) -> &'static str {
    match state {
        1 => "CLOSED",
        2 => "LISTEN",
        3 => "SYN_SENT",
        4 => "SYN_RCVD",
        5 => "ESTABLISHED",
        6 => "FIN_WAIT1",
        7 => "FIN_WAIT2",
        8 => "CLOSE_WAIT",
        9 => "CLOSING",
        10 => "LAST_ACK",
        11 => "TIME_WAIT",
        12 => "DELETE_TCB",
        _ => "UNKNOWN",
    }
}

#[cfg(windows)]
fn get_process_info_map() -> HashMap<u32, (String, Option<String>)> {
    let mut map = HashMap::new();
    let mut sys = sysinfo::System::new();
    sys.refresh_processes();

    for (&pid, process) in sys.processes() {
        let pid_u32 = pid.as_u32();
        let name = process.name().to_string();
        let exe_path = process.exe().map(|p| p.to_string_lossy().to_string());
        map.insert(pid_u32, (name, exe_path));
    }

    map
}

#[cfg(windows)]
fn resolve_process(
    pid: u32,
    process_map: &HashMap<u32, (String, Option<String>)>,
) -> (String, Option<String>) {
    if pid == 0 {
        return ("System Idle".to_string(), None);
    }
    if pid == 4 {
        return ("System".to_string(), None);
    }

    if let Some(info) = process_map.get(&pid) {
        return info.clone();
    }

    // Direct fallback using Win32 API
    unsafe {
        if let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
            let mut name_buf = [0u16; 1024];
            let mut size = name_buf.len() as u32;

            if QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, windows::core::PWSTR(name_buf.as_mut_ptr()), &mut size).is_ok() && size > 0 {
                let _ = CloseHandle(handle);
                let path = String::from_utf16_lossy(&name_buf[..size as usize]);
                let file_name = path.rsplit('\\').next().unwrap_or(&path).to_string();
                return (file_name, Some(path));
            }

            let len = K32GetProcessImageFileNameW(handle, &mut name_buf);
            let _ = CloseHandle(handle);
            if len > 0 {
                let path = String::from_utf16_lossy(&name_buf[..len as usize]);
                let file_name = path.rsplit('\\').next().unwrap_or(&path).to_string();
                return (file_name, Some(path));
            }
        }
    }

    (format!("Process [{}]", pid), None)
}

/// Safely reads `Row` entries from a Windows MIB_*TABLE_OWNER_PID byte buffer using
/// unaligned reads and strict bounds checking against `dwNumEntries`.
#[cfg(windows)]
fn parse_mib_table_rows<Row: Copy>(buffer: &[u8], rows_offset: usize) -> Vec<Row> {
    if buffer.len() < 4 || buffer.len() < rows_offset {
        return Vec::new();
    }
    let declared_entries = u32::from_ne_bytes([buffer[0], buffer[1], buffer[2], buffer[3]]) as usize;
    let row_size = std::mem::size_of::<Row>();
    if row_size == 0 {
        return Vec::new();
    }
    let max_possible = (buffer.len() - rows_offset) / row_size;
    let safe_entries = declared_entries.min(max_possible);
    let mut rows = Vec::with_capacity(safe_entries);
    for i in 0..safe_entries {
        let offset = rows_offset + i * row_size;
        // SAFETY: `offset + row_size <= buffer.len()` is guaranteed by `safe_entries`.
        let row = unsafe { std::ptr::read_unaligned(buffer.as_ptr().add(offset) as *const Row) };
        rows.push(row);
    }
    rows
}

#[cfg(windows)]
fn fetch_tcp_ipv4_connections(
    connections: &mut Vec<NetworkConnection>,
    process_map: &HashMap<u32, (String, Option<String>)>,
) {
    use windows::Win32::NetworkManagement::IpHelper::MIB_TCPROW_OWNER_PID;

    unsafe {
        let mut size = 0u32;
        let _ = GetExtendedTcpTable(
            None,
            &mut size,
            true,
            AF_INET.0 as u32,
            TCP_TABLE_OWNER_PID_ALL,
            0,
        );

        if size == 0 {
            return;
        }

        let mut buffer = vec![0u8; size as usize];
        let res = GetExtendedTcpTable(
            Some(buffer.as_mut_ptr() as *mut _),
            &mut size,
            true,
            AF_INET.0 as u32,
            TCP_TABLE_OWNER_PID_ALL,
            0,
        );

        if res == 0 {
            let valid_len = (size as usize).min(buffer.len());
            let rows_offset = std::mem::offset_of!(MIB_TCPTABLE_OWNER_PID, table);
            for row in parse_mib_table_rows::<MIB_TCPROW_OWNER_PID>(&buffer[..valid_len], rows_offset) {
                let local_ip = Ipv4Addr::from(u32::from_be(row.dwLocalAddr)).to_string();
                let local_port = decode_port(row.dwLocalPort);
                let remote_ip = Ipv4Addr::from(u32::from_be(row.dwRemoteAddr)).to_string();
                let remote_port = decode_port(row.dwRemotePort);
                let state = tcp_state_to_string(row.dwState).to_string();
                let pid = row.dwOwningPid;
                let (process_name, process_path) = resolve_process(pid, process_map);

                connections.push(NetworkConnection {
                    protocol: "TCP".to_string(),
                    local_address: local_ip,
                    local_port,
                    remote_address: remote_ip,
                    remote_port,
                    state,
                    pid,
                    process_name,
                    process_path,
                });
            }
        }
    }
}

#[cfg(windows)]
fn fetch_tcp_ipv6_connections(
    connections: &mut Vec<NetworkConnection>,
    process_map: &HashMap<u32, (String, Option<String>)>,
) {
    use windows::Win32::NetworkManagement::IpHelper::MIB_TCP6ROW_OWNER_PID;

    unsafe {
        let mut size = 0u32;
        let _ = GetExtendedTcpTable(
            None,
            &mut size,
            true,
            AF_INET6.0 as u32,
            TCP_TABLE_OWNER_PID_ALL,
            0,
        );

        if size == 0 {
            return;
        }

        let mut buffer = vec![0u8; size as usize];
        let res = GetExtendedTcpTable(
            Some(buffer.as_mut_ptr() as *mut _),
            &mut size,
            true,
            AF_INET6.0 as u32,
            TCP_TABLE_OWNER_PID_ALL,
            0,
        );

        if res == 0 {
            let valid_len = (size as usize).min(buffer.len());
            let rows_offset = std::mem::offset_of!(MIB_TCP6TABLE_OWNER_PID, table);
            for row in parse_mib_table_rows::<MIB_TCP6ROW_OWNER_PID>(&buffer[..valid_len], rows_offset) {
                let local_ip = Ipv6Addr::from(row.ucLocalAddr).to_string();
                let local_port = decode_port(row.dwLocalPort);
                let remote_ip = Ipv6Addr::from(row.ucRemoteAddr).to_string();
                let remote_port = decode_port(row.dwRemotePort);
                let state = tcp_state_to_string(row.dwState).to_string();
                let pid = row.dwOwningPid;
                let (process_name, process_path) = resolve_process(pid, process_map);

                connections.push(NetworkConnection {
                    protocol: "TCPv6".to_string(),
                    local_address: local_ip,
                    local_port,
                    remote_address: remote_ip,
                    remote_port,
                    state,
                    pid,
                    process_name,
                    process_path,
                });
            }
        }
    }
}

#[cfg(windows)]
fn fetch_udp_ipv4_connections(
    connections: &mut Vec<NetworkConnection>,
    process_map: &HashMap<u32, (String, Option<String>)>,
) {
    use windows::Win32::NetworkManagement::IpHelper::MIB_UDPROW_OWNER_PID;

    unsafe {
        let mut size = 0u32;
        let _ = GetExtendedUdpTable(
            None,
            &mut size,
            true,
            AF_INET.0 as u32,
            UDP_TABLE_OWNER_PID,
            0,
        );

        if size == 0 {
            return;
        }

        let mut buffer = vec![0u8; size as usize];
        let res = GetExtendedUdpTable(
            Some(buffer.as_mut_ptr() as *mut _),
            &mut size,
            true,
            AF_INET.0 as u32,
            UDP_TABLE_OWNER_PID,
            0,
        );

        if res == 0 {
            let valid_len = (size as usize).min(buffer.len());
            let rows_offset = std::mem::offset_of!(MIB_UDPTABLE_OWNER_PID, table);
            for row in parse_mib_table_rows::<MIB_UDPROW_OWNER_PID>(&buffer[..valid_len], rows_offset) {
                let local_ip = Ipv4Addr::from(u32::from_be(row.dwLocalAddr)).to_string();
                let local_port = decode_port(row.dwLocalPort);
                let pid = row.dwOwningPid;
                let (process_name, process_path) = resolve_process(pid, process_map);

                connections.push(NetworkConnection {
                    protocol: "UDP".to_string(),
                    local_address: local_ip,
                    local_port,
                    remote_address: "*".to_string(),
                    remote_port: 0,
                    state: "UDP".to_string(),
                    pid,
                    process_name,
                    process_path,
                });
            }
        }
    }
}

#[cfg(windows)]
fn fetch_udp_ipv6_connections(
    connections: &mut Vec<NetworkConnection>,
    process_map: &HashMap<u32, (String, Option<String>)>,
) {
    use windows::Win32::NetworkManagement::IpHelper::MIB_UDP6ROW_OWNER_PID;

    unsafe {
        let mut size = 0u32;
        let _ = GetExtendedUdpTable(
            None,
            &mut size,
            true,
            AF_INET6.0 as u32,
            UDP_TABLE_OWNER_PID,
            0,
        );

        if size == 0 {
            return;
        }

        let mut buffer = vec![0u8; size as usize];
        let res = GetExtendedUdpTable(
            Some(buffer.as_mut_ptr() as *mut _),
            &mut size,
            true,
            AF_INET6.0 as u32,
            UDP_TABLE_OWNER_PID,
            0,
        );

        if res == 0 {
            let valid_len = (size as usize).min(buffer.len());
            let rows_offset = std::mem::offset_of!(MIB_UDP6TABLE_OWNER_PID, table);
            for row in parse_mib_table_rows::<MIB_UDP6ROW_OWNER_PID>(&buffer[..valid_len], rows_offset) {
                let local_ip = Ipv6Addr::from(row.ucLocalAddr).to_string();
                let local_port = decode_port(row.dwLocalPort);
                let pid = row.dwOwningPid;
                let (process_name, process_path) = resolve_process(pid, process_map);

                connections.push(NetworkConnection {
                    protocol: "UDPv6".to_string(),
                    local_address: local_ip,
                    local_port,
                    remote_address: "*".to_string(),
                    remote_port: 0,
                    state: "UDP".to_string(),
                    pid,
                    process_name,
                    process_path,
                });
            }
        }
    }
}

#[tauri::command]
pub fn get_active_network_connections() -> Result<Vec<NetworkConnection>, AppError> {
    #[cfg(windows)]
    {
        let mut connections = Vec::with_capacity(128);
        let process_map = get_process_info_map();

        fetch_tcp_ipv4_connections(&mut connections, &process_map);
        fetch_tcp_ipv6_connections(&mut connections, &process_map);
        fetch_udp_ipv4_connections(&mut connections, &process_map);
        fetch_udp_ipv6_connections(&mut connections, &process_map);

        // Sort connections by PID and local port
        connections.sort_by(|a, b| a.pid.cmp(&b.pid).then_with(|| a.local_port.cmp(&b.local_port)));

        Ok(connections)
    }
    #[cfg(not(windows))]
    {
        Ok(vec![
            NetworkConnection {
                protocol: "TCP".to_string(),
                local_address: "127.0.0.1".to_string(),
                local_port: 8080,
                remote_address: "127.0.0.1".to_string(),
                remote_port: 54321,
                state: "ESTABLISHED".to_string(),
                pid: 1234,
                process_name: "chrome.exe".to_string(),
                process_path: Some("C:\\Program Files\\Google\\Chrome\\chrome.exe".to_string()),
            },
            NetworkConnection {
                protocol: "UDP".to_string(),
                local_address: "0.0.0.0".to_string(),
                local_port: 5353,
                remote_address: "*".to_string(),
                remote_port: 0,
                state: "UDP".to_string(),
                pid: 5678,
                process_name: "discord.exe".to_string(),
                process_path: Some("C:\\Users\\User\\AppData\\Local\\Discord\\discord.exe".to_string()),
            },
        ])
    }
}

#[tauri::command]
pub fn get_firewall_rules() -> Result<Vec<FirewallRuleInfo>, AppError> {
    #[cfg(windows)]
    {
        let output = Command::new("netsh")
            .creation_flags(CREATE_NO_WINDOW)
            .args(["advfirewall", "firewall", "show", "rule", "name=all"])
            .output()
            .map_err(|e| AppError::System(format!("Failed to execute netsh: {}", e)))?;

        if !output.status.success() {
            let err_msg = crate::runner::decode_bytes(&output.stderr);
            let out_msg = crate::runner::decode_bytes(&output.stdout);
            return Err(AppError::Execution(format!(
                "netsh advfirewall show rule failed (exit {:?}): {} {}",
                output.status.code(),
                err_msg.trim(),
                out_msg.trim()
            )));
        }

        let text = crate::runner::decode_bytes(&output.stdout);

        let mut rules = Vec::new();
        let mut current_name = String::new();
        let mut current_dir = String::new();
        let mut current_action = String::new();
        let mut current_program = String::new();
        let mut current_enabled = false;
        let mut current_profile = String::new();

        for line in text.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with("---") {
                if !current_name.is_empty() {
                    rules.push(FirewallRuleInfo {
                        name: current_name.clone(),
                        direction: if current_dir.is_empty() { "Inbound".to_string() } else { current_dir.clone() },
                        action: if current_action.is_empty() { "Allow".to_string() } else { current_action.clone() },
                        program: current_program.clone(),
                        enabled: current_enabled,
                        profile: if current_profile.is_empty() { "All".to_string() } else { current_profile.clone() },
                    });
                    current_name.clear();
                    current_dir.clear();
                    current_action.clear();
                    current_program.clear();
                    current_enabled = false;
                    current_profile.clear();
                }
                continue;
            }

            if line.starts_with("Rule Name:") || line.starts_with("Имя правила:") {
                if !current_name.is_empty() {
                    rules.push(FirewallRuleInfo {
                        name: current_name.clone(),
                        direction: if current_dir.is_empty() { "Inbound".to_string() } else { current_dir.clone() },
                        action: if current_action.is_empty() { "Allow".to_string() } else { current_action.clone() },
                        program: current_program.clone(),
                        enabled: current_enabled,
                        profile: if current_profile.is_empty() { "All".to_string() } else { current_profile.clone() },
                    });
                    current_name.clear();
                }
                let val = line.split_once(':').map(|x| x.1.trim()).unwrap_or("");
                current_name = val.to_string();
            } else if line.starts_with("Direction:") || line.starts_with("Направление:") {
                let val = line.split_once(':').map(|x| x.1.trim()).unwrap_or("");
                current_dir = if val.eq_ignore_ascii_case("In") || val.contains("Вход") {
                    "Inbound".to_string()
                } else {
                    "Outbound".to_string()
                };
            } else if line.starts_with("Action:") || line.starts_with("Действие:") {
                let val = line.split_once(':').map(|x| x.1.trim()).unwrap_or("");
                current_action = if val.eq_ignore_ascii_case("Block") || val.contains("Блокировать") {
                    "Block".to_string()
                } else {
                    "Allow".to_string()
                };
            } else if line.starts_with("Program:") || line.starts_with("Программа:") {
                let val = line.split_once(':').map(|x| x.1.trim()).unwrap_or("");
                current_program = val.to_string();
            } else if line.starts_with("Enabled:") || line.starts_with("Включено:") {
                let val = line.split_once(':').map(|x| x.1.trim()).unwrap_or("");
                current_enabled = val.eq_ignore_ascii_case("Yes") || val.contains("Да");
            } else if line.starts_with("Profiles:") || line.starts_with("Профили:") {
                let val = line.split_once(':').map(|x| x.1.trim()).unwrap_or("");
                current_profile = val.to_string();
            }
        }

        if !current_name.is_empty() {
            rules.push(FirewallRuleInfo {
                name: current_name,
                direction: if current_dir.is_empty() { "Inbound".to_string() } else { current_dir },
                action: if current_action.is_empty() { "Allow".to_string() } else { current_action },
                program: current_program,
                enabled: current_enabled,
                profile: if current_profile.is_empty() { "All".to_string() } else { current_profile },
            });
        }

        // Filter and prioritize WiScripts rules or blocked rules
        let mut sorted_rules = rules;
        sorted_rules.sort_by(|a, b| {
            let a_wiscripts = a.name.contains("WiScripts");
            let b_wiscripts = b.name.contains("WiScripts");
            b_wiscripts.cmp(&a_wiscripts).then_with(|| a.name.cmp(&b.name))
        });

        Ok(sorted_rules)
    }
    #[cfg(not(windows))]
    {
        Ok(vec![
            FirewallRuleInfo {
                name: "WiScripts Block: Discord".to_string(),
                direction: "Inbound".to_string(),
                action: "Block".to_string(),
                program: "C:\\Users\\User\\AppData\\Local\\Discord\\discord.exe".to_string(),
                enabled: true,
                profile: "Domain,Private,Public".to_string(),
            },
        ])
    }
}

/// Validates a firewall rule name against a strict allowlist (must start with `WiScripts ` or
/// `WiScripts_`, never equal `"all"`, and contain no quotes, newlines, or control/meta characters).
pub fn validate_firewall_rule_name(rule_name: &str) -> Result<String, AppError> {
    let trimmed = rule_name.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidConfig("Rule name cannot be empty".to_string()));
    }
    if trimmed.eq_ignore_ascii_case("all") {
        return Err(AppError::InvalidConfig(
            "Security Violation: Rule name 'all' is strictly forbidden".to_string(),
        ));
    }
    if !(trimmed.starts_with("WiScripts ") || trimmed.starts_with("WiScripts_")) {
        return Err(AppError::InvalidConfig(format!(
            "Security Violation: Rule name '{}' must start with 'WiScripts ' or 'WiScripts_'",
            trimmed
        )));
    }
    if trimmed.len() > 128 {
        return Err(AppError::InvalidConfig(
            "Rule name exceeds maximum length (128 characters)".to_string(),
        ));
    }
    if !trimmed.chars().all(|c| {
        c.is_alphanumeric() || matches!(c, ' ' | ':' | '.' | '-' | '_' | '(' | ')')
    }) {
        return Err(AppError::InvalidConfig(format!(
            "Rule name '{}' contains disallowed characters",
            trimmed
        )));
    }
    Ok(trimmed.to_string())
}

#[tauri::command]
pub fn block_process_firewall(
    process_path: String,
    rule_name: String,
) -> Result<FirewallActionResult, AppError> {
    let trimmed_path = process_path.trim();
    if trimmed_path.is_empty() {
        return Err(AppError::InvalidConfig("Process path cannot be empty".to_string()));
    }
    if trimmed_path.contains(['"', '\'', '\r', '\n', '\0']) {
        return Err(AppError::InvalidConfig(
            "Process path contains disallowed control or quote characters".to_string(),
        ));
    }

    let sanitized_name = if rule_name.trim().is_empty() {
        let exe_name = trimmed_path.rsplit(['\\', '/']).next().unwrap_or("App");
        validate_firewall_rule_name(&format!("WiScripts Block: {}", exe_name))?
    } else {
        validate_firewall_rule_name(&rule_name)?
    };

    #[cfg(windows)]
    {
        // 1. Inbound rule
        let in_name = format!("{}_In", sanitized_name);
        let in_output = Command::new("netsh")
            .creation_flags(CREATE_NO_WINDOW)
            .args([
                "advfirewall", "firewall", "add", "rule",
                &format!("name={}", in_name),
                "dir=in",
                "action=block",
                &format!("program={}", trimmed_path),
                "enable=yes",
            ])
            .output()
            .map_err(|e| AppError::System(format!("Failed to execute netsh for inbound rule: {}", e)))?;

        // 2. Outbound rule
        let out_name = format!("{}_Out", sanitized_name);
        let out_output = Command::new("netsh")
            .creation_flags(CREATE_NO_WINDOW)
            .args([
                "advfirewall", "firewall", "add", "rule",
                &format!("name={}", out_name),
                "dir=out",
                "action=block",
                &format!("program={}", trimmed_path),
                "enable=yes",
            ])
            .output()
            .map_err(|e| AppError::System(format!("Failed to execute netsh for outbound rule: {}", e)))?;

        let success = in_output.status.success() && out_output.status.success();
        let message = if success {
            format!("Firewall block rules successfully added for '{}'", trimmed_path)
        } else {
            let err_in = crate::runner::decode_bytes(&in_output.stderr);
            let err_out = crate::runner::decode_bytes(&out_output.stderr);
            let out_in = crate::runner::decode_bytes(&in_output.stdout);
            let out_out = crate::runner::decode_bytes(&out_output.stdout);
            format!(
                "Failed to add firewall rule: {} {} {} {}",
                err_in.trim(),
                err_out.trim(),
                out_in.trim(),
                out_out.trim()
            )
        };

        Ok(FirewallActionResult {
            success,
            rule_name: sanitized_name,
            message,
        })
    }
    #[cfg(not(windows))]
    {
        Ok(FirewallActionResult {
            success: true,
            rule_name: sanitized_name,
            message: format!("Mock blocked '{}' in firewall", trimmed_path),
        })
    }
}

#[tauri::command]
pub fn unblock_process_firewall(
    rule_name: String,
) -> Result<FirewallActionResult, AppError> {
    let valid_name = validate_firewall_rule_name(&rule_name)?;

    #[cfg(windows)]
    {
        // Try deleting base name, _In suffix, and _Out suffix
        let in_name = format!("{}_In", valid_name);
        let out_name = format!("{}_Out", valid_name);

        let res_base = Command::new("netsh")
            .creation_flags(CREATE_NO_WINDOW)
            .args(["advfirewall", "firewall", "delete", "rule", &format!("name={}", valid_name)])
            .output()
            .map_err(|e| AppError::System(format!("Failed to execute netsh delete (base): {}", e)))?;

        let res_in = Command::new("netsh")
            .creation_flags(CREATE_NO_WINDOW)
            .args(["advfirewall", "firewall", "delete", "rule", &format!("name={}", in_name)])
            .output()
            .map_err(|e| AppError::System(format!("Failed to execute netsh delete (in): {}", e)))?;

        let res_out = Command::new("netsh")
            .creation_flags(CREATE_NO_WINDOW)
            .args(["advfirewall", "firewall", "delete", "rule", &format!("name={}", out_name)])
            .output()
            .map_err(|e| AppError::System(format!("Failed to execute netsh delete (out): {}", e)))?;

        let success = res_base.status.success() || res_in.status.success() || res_out.status.success();
        let message = if success {
            format!("Firewall rules for '{}' deleted successfully", valid_name)
        } else {
            let err_base = crate::runner::decode_bytes(&res_base.stderr);
            let out_base = crate::runner::decode_bytes(&res_base.stdout);
            format!(
                "Failed to delete firewall rule '{}': {} {}",
                valid_name,
                err_base.trim(),
                out_base.trim()
            )
        };

        Ok(FirewallActionResult {
            success,
            rule_name: valid_name,
            message,
        })
    }
    #[cfg(not(windows))]
    {
        Ok(FirewallActionResult {
            success: true,
            rule_name: valid_name.clone(),
            message: format!("Mock unblocked '{}' in firewall", valid_name),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_decode_port() {
        // Port 80 in network byte order is 0x5000 (20480)
        assert_eq!(decode_port(0x5000), 80);
        // Port 443 in network byte order is 0xBB01
        assert_eq!(decode_port(0xBB01), 443);
        // Port 8080 in network byte order is 0x901F
        assert_eq!(decode_port(0x901F), 8080);
    }

    #[test]
    fn test_tcp_state_to_string() {
        assert_eq!(tcp_state_to_string(1), "CLOSED");
        assert_eq!(tcp_state_to_string(2), "LISTEN");
        assert_eq!(tcp_state_to_string(5), "ESTABLISHED");
        assert_eq!(tcp_state_to_string(11), "TIME_WAIT");
        assert_eq!(tcp_state_to_string(99), "UNKNOWN");
    }

    #[test]
    fn test_network_connection_serialization() {
        let conn = NetworkConnection {
            protocol: "TCP".to_string(),
            local_address: "192.168.1.100".to_string(),
            local_port: 54321,
            remote_address: "142.250.190.46".to_string(),
            remote_port: 443,
            state: "ESTABLISHED".to_string(),
            pid: 4096,
            process_name: "chrome.exe".to_string(),
            process_path: Some("C:\\Program Files\\Google\\Chrome\\chrome.exe".to_string()),
        };

        let json = serde_json::to_string(&conn).expect("Failed to serialize NetworkConnection");
        assert!(json.contains("localAddress"));
        assert!(json.contains("localPort"));
        assert!(json.contains("remoteAddress"));
        assert!(json.contains("remotePort"));
        assert!(json.contains("processName"));
        assert!(json.contains("processPath"));
    }

    #[test]
    fn test_firewall_rule_info_serialization() {
        let rule = FirewallRuleInfo {
            name: "WiScripts Block: Discord".to_string(),
            direction: "Outbound".to_string(),
            action: "Block".to_string(),
            program: "C:\\Discord\\discord.exe".to_string(),
            enabled: true,
            profile: "All".to_string(),
        };

        let json = serde_json::to_string(&rule).expect("Failed to serialize FirewallRuleInfo");
        assert!(json.contains("name"));
        assert!(json.contains("direction"));
        assert!(json.contains("action"));
        assert!(json.contains("program"));
        assert!(json.contains("enabled"));
    }

    #[test]
    fn test_firewall_action_result_serialization() {
        let action = FirewallActionResult {
            success: true,
            rule_name: "WiScripts Block: test.exe".to_string(),
            message: "Rule added".to_string(),
        };

        let json = serde_json::to_string(&action).expect("Failed to serialize");
        assert!(json.contains("ruleName"));
        assert!(json.contains("success"));
        assert!(json.contains("message"));
    }

    #[test]
    fn test_validate_firewall_rule_name_allowlist() {
        assert!(validate_firewall_rule_name("all").is_err());
        assert!(validate_firewall_rule_name("ALL").is_err());
        assert!(validate_firewall_rule_name("Core Networking").is_err());
        assert!(validate_firewall_rule_name("WiScripts Block: \"evil\"").is_err());
        assert!(validate_firewall_rule_name("WiScripts Block: a\nb").is_err());
        assert!(validate_firewall_rule_name("WiScripts Block: a=b").is_err());
        assert!(unblock_process_firewall("all".to_string()).is_err());
        assert!(unblock_process_firewall("OtherRule".to_string()).is_err());

        assert_eq!(
            validate_firewall_rule_name("WiScripts Block: app.exe").unwrap(),
            "WiScripts Block: app.exe"
        );
        assert_eq!(
            validate_firewall_rule_name("WiScripts_Block_app.exe").unwrap(),
            "WiScripts_Block_app.exe"
        );
    }

    #[cfg(windows)]
    #[test]
    fn test_parse_mib_table_rows_bounds_and_unaligned() {
        use windows::Win32::NetworkManagement::IpHelper::MIB_UDPROW_OWNER_PID;

        // Buffer claims 9999 entries but only has space for 1 row at offset 5 (unaligned)
        let row_size = std::mem::size_of::<MIB_UDPROW_OWNER_PID>();
        let mut buf = vec![0u8; 5 + row_size];
        buf[0..4].copy_from_slice(&9999u32.to_ne_bytes());
        let rows = parse_mib_table_rows::<MIB_UDPROW_OWNER_PID>(&buf, 5);
        assert_eq!(rows.len(), 1);

        // Buffer smaller than rows_offset returns empty safely
        let tiny = vec![10u8, 0, 0, 0];
        let rows_tiny = parse_mib_table_rows::<MIB_UDPROW_OWNER_PID>(&tiny, 8);
        assert!(rows_tiny.is_empty());
    }
}
