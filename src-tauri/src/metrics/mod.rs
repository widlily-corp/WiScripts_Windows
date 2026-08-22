use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::time::Instant;
use sysinfo::{Components, Disks, Networks, System};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SystemMetricsPayload {
    pub cpu_usage_percent: f32,
    pub cpu_core_count: usize,
    pub per_core_cpu_usage: Vec<f32>,
    pub memory_used_mb: u64,
    pub memory_total_mb: u64,
    pub memory_free_mb: u64,
    pub memory_usage_percent: f32,
    pub disk_read_bytes_per_sec: f64,
    pub disk_write_bytes_per_sec: f64,
    pub disk_total_read_bytes: u64,
    pub disk_total_write_bytes: u64,
    pub network_rx_bytes_per_sec: f64,
    pub network_tx_bytes_per_sec: f64,
    pub network_total_rx_bytes: u64,
    pub network_total_tx_bytes: u64,
    pub timestamp_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TemperatureSensorInfo {
    pub id: String,
    pub name: String,
    pub label: String,
    pub temperature_celsius: f32,
    pub sensor_type: String, // "cpu", "gpu", or "other"
    pub provider: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SystemTemperaturesPayload {
    pub cpu_temp_celsius: Option<f32>,
    pub gpu_temp_celsius: Option<f32>,
    pub is_cpu_temp_available: bool,
    pub is_gpu_temp_available: bool,
    pub sensor_source: String,
    pub sensor_items: Vec<TemperatureSensorInfo>,
    pub selected_cpu_sensor_id: Option<String>,
    pub selected_gpu_sensor_id: Option<String>,
}

pub struct MetricsCollector {
    sys: System,
    disks: Disks,
    networks: Networks,
    last_refresh: Instant,
    last_net_rx: u64,
    last_net_tx: u64,
    last_disk_read: u64,
    last_disk_write: u64,
}

impl Default for MetricsCollector {
    fn default() -> Self {
        Self::new()
    }
}

impl MetricsCollector {
    pub fn new() -> Self {
        let mut sys = System::new_all();
        sys.refresh_all();
        let disks = Disks::new_with_refreshed_list();
        let networks = Networks::new_with_refreshed_list();

        let mut collector = Self {
            sys,
            disks,
            networks,
            last_refresh: Instant::now(),
            last_net_rx: 0,
            last_net_tx: 0,
            last_disk_read: 0,
            last_disk_write: 0,
        };

        collector.update_initial_totals();
        collector
    }

    fn update_initial_totals(&mut self) {
        let (net_rx, net_tx) = self.read_network_totals();
        let (disk_r, disk_w) = self.read_disk_totals();
        self.last_net_rx = net_rx;
        self.last_net_tx = net_tx;
        self.last_disk_read = disk_r;
        self.last_disk_write = disk_w;
    }

    fn read_network_totals(&self) -> (u64, u64) {
        let mut total_rx: u64 = 0;
        let mut total_tx: u64 = 0;
        for (_interface, data) in &self.networks {
            total_rx += data.total_received();
            total_tx += data.total_transmitted();
        }
        (total_rx, total_tx)
    }

    fn read_disk_totals(&self) -> (u64, u64) {
        let mut total_read: u64 = 0;
        let mut total_written: u64 = 0;
        for process in self.sys.processes().values() {
            let disk_usage = process.disk_usage();
            total_read += disk_usage.total_read_bytes;
            total_written += disk_usage.total_written_bytes;
        }
        (total_read, total_written)
    }

    pub fn collect(&mut self) -> Result<SystemMetricsPayload, AppError> {
        self.sys.refresh_all();
        self.disks.refresh();
        self.networks.refresh();

        let now = Instant::now();
        let elapsed_secs = now.duration_since(self.last_refresh).as_secs_f64();
        let dt = if elapsed_secs < 0.001 {
            1.0
        } else {
            elapsed_secs
        };
        self.last_refresh = now;

        // CPU Metrics
        let cpu_usage_percent = self.sys.global_cpu_info().cpu_usage();
        let per_core_cpu_usage: Vec<f32> = self.sys.cpus().iter().map(|c| c.cpu_usage()).collect();
        let cpu_core_count = per_core_cpu_usage.len();

        // Memory Metrics
        let memory_total_bytes = self.sys.total_memory();
        let memory_used_bytes = self.sys.used_memory();
        let memory_free_bytes = self.sys.free_memory();
        let memory_total_mb = memory_total_bytes / (1024 * 1024);
        let memory_used_mb = memory_used_bytes / (1024 * 1024);
        let memory_free_mb = memory_free_bytes / (1024 * 1024);
        let memory_usage_percent = if memory_total_bytes > 0 {
            (memory_used_bytes as f32 / memory_total_bytes as f32) * 100.0
        } else {
            0.0
        };

        // Network Metrics
        let (current_net_rx, current_net_tx) = self.read_network_totals();
        let rx_delta = current_net_rx.saturating_sub(self.last_net_rx);
        let tx_delta = current_net_tx.saturating_sub(self.last_net_tx);
        self.last_net_rx = current_net_rx;
        self.last_net_tx = current_net_tx;

        let network_rx_bytes_per_sec = rx_delta as f64 / dt;
        let network_tx_bytes_per_sec = tx_delta as f64 / dt;

        // Disk Metrics
        let (current_disk_r, current_disk_w) = self.read_disk_totals();
        let r_delta = current_disk_r.saturating_sub(self.last_disk_read);
        let w_delta = current_disk_w.saturating_sub(self.last_disk_write);
        self.last_disk_read = current_disk_r;
        self.last_disk_write = current_disk_w;

        let disk_read_bytes_per_sec = r_delta as f64 / dt;
        let disk_write_bytes_per_sec = w_delta as f64 / dt;

        let timestamp_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        Ok(SystemMetricsPayload {
            cpu_usage_percent,
            cpu_core_count,
            per_core_cpu_usage,
            memory_used_mb,
            memory_total_mb,
            memory_free_mb,
            memory_usage_percent,
            disk_read_bytes_per_sec,
            disk_write_bytes_per_sec,
            disk_total_read_bytes: current_disk_r,
            disk_total_write_bytes: current_disk_w,
            network_rx_bytes_per_sec,
            network_tx_bytes_per_sec,
            network_total_rx_bytes: current_net_rx,
            network_total_tx_bytes: current_net_tx,
            timestamp_ms,
        })
    }
}

pub fn deci_kelvin_to_celsius(deci_k: f32) -> f32 {
    (deci_k - 2732.0) / 10.0
}

pub fn run_command_with_timeout(mut cmd: std::process::Command, timeout: std::time::Duration) -> Option<String> {
    use std::io::Read;
    use std::process::Stdio;
    use std::time::Instant;

    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::null());
    cmd.stdin(Stdio::null());

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(_) => return None,
    };

    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                if status.success() {
                    let mut stdout_bytes = Vec::new();
                    if let Some(mut stream) = child.stdout.take() {
                        let _ = stream.read_to_end(&mut stdout_bytes);
                    }
                    return Some(crate::runner::decode_bytes(&stdout_bytes));
                }
                return None;
            }
            Ok(None) => {
                if start.elapsed() >= timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    return None;
                }
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    }
}

fn run_with_timeout<F, T>(timeout: std::time::Duration, f: F) -> Option<T>
where
    F: FnOnce() -> Option<T> + Send + 'static,
    T: Send + 'static,
{
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let res = f();
        let _ = tx.send(res);
    });

    rx.recv_timeout(timeout).ok().flatten()
}

fn parse_wmi_hardware_monitor_json(json_str: &str, provider: &str, prefix: &str) -> Vec<TemperatureSensorInfo> {
    let mut sensors = Vec::new();
    let trimmed = json_str.trim();
    if trimmed.is_empty() {
        return sensors;
    }

    let parsed: Result<serde_json::Value, _> = serde_json::from_str(trimmed);
    if let Ok(value) = parsed {
        let items = match value {
            serde_json::Value::Array(arr) => arr,
            serde_json::Value::Object(_) => vec![value],
            _ => vec![],
        };

        for (idx, item) in items.iter().enumerate() {
            let identifier = item.get("Identifier").and_then(|v| v.as_str()).unwrap_or("");
            let name = item.get("Name").and_then(|v| v.as_str()).unwrap_or("Temperature Sensor");
            let parent = item.get("Parent").and_then(|v| v.as_str()).unwrap_or("");
            let temp_val = item.get("Value").and_then(|v| v.as_f64()).map(|v| v as f32);

            if let Some(temp) = temp_val {
                if temp > 0.0 && temp < 130.0 {
                    let combined_lower = format!("{} {} {}", identifier, name, parent).to_lowercase();
                    let sensor_type = if combined_lower.contains("gpu")
                        || combined_lower.contains("nvidia")
                        || combined_lower.contains("radeon")
                        || combined_lower.contains("vram")
                    {
                        "gpu".to_string()
                    } else if combined_lower.contains("cpu")
                        || combined_lower.contains("core")
                        || combined_lower.contains("package")
                        || combined_lower.contains("tdie")
                        || combined_lower.contains("ccd")
                    {
                        "cpu".to_string()
                    } else {
                        "other".to_string()
                    };

                    let raw_id = if !identifier.is_empty() {
                        identifier.replace(['/', '\\'], "_")
                    } else {
                        format!("{}_{}", name.to_lowercase().replace(' ', "_"), idx)
                    };
                    let clean_id = format!("{}_{}", prefix, raw_id.trim_matches('_'));

                    let label = if !parent.is_empty() {
                        format!("{} - {}", parent.trim_matches('/'), name)
                    } else {
                        name.to_string()
                    };

                    sensors.push(TemperatureSensorInfo {
                        id: clean_id,
                        name: name.to_string(),
                        label,
                        temperature_celsius: temp,
                        sensor_type,
                        provider: provider.to_string(),
                    });
                }
            }
        }
    }
    sensors
}

fn query_lhm_wmi_sensors() -> Vec<TemperatureSensorInfo> {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = std::process::Command::new("powershell.exe");
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
        cmd.args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Get-CimInstance -Namespace root\\LibreHardwareMonitor -ClassName Sensor -Filter \"SensorType='Temperature'\" -ErrorAction SilentlyContinue | Select-Object Identifier, Name, Parent, Value | ConvertTo-Json -Compress",
        ]);
        let output = run_command_with_timeout(cmd, std::time::Duration::from_secs(3));

        if let Some(json_str) = output {
            return parse_wmi_hardware_monitor_json(&json_str, "LibreHardwareMonitor WMI", "lhm");
        }
    }
    Vec::new()
}

fn query_ohm_wmi_sensors() -> Vec<TemperatureSensorInfo> {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = std::process::Command::new("powershell.exe");
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
        cmd.args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Get-CimInstance -Namespace root\\OpenHardwareMonitor -ClassName Sensor -Filter \"SensorType='Temperature'\" -ErrorAction SilentlyContinue | Select-Object Identifier, Name, Parent, Value | ConvertTo-Json -Compress",
        ]);
        let output = run_command_with_timeout(cmd, std::time::Duration::from_secs(3));

        if let Some(json_str) = output {
            return parse_wmi_hardware_monitor_json(&json_str, "OpenHardwareMonitor WMI", "ohm");
        }
    }
    Vec::new()
}

fn query_nvml_sensors() -> Vec<TemperatureSensorInfo> {
    let output = run_with_timeout(std::time::Duration::from_secs(3), || {
        let mut sensors = Vec::new();
        #[cfg(target_os = "windows")]
        {
            use libloading::Library;
            use std::ffi::{c_char, c_void, CStr};

            let lib = unsafe {
                Library::new("nvml.dll")
                    .or_else(|_| Library::new("C:\\Windows\\System32\\nvml.dll"))
                    .or_else(|_| Library::new("C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvml.dll"))
            };

            if let Ok(lib) = lib {
                unsafe {
                    type NvmlInit = unsafe extern "C" fn() -> i32;
                    type NvmlShutdown = unsafe extern "C" fn() -> i32;
                    type NvmlDeviceGetCount = unsafe extern "C" fn(*mut u32) -> i32;
                    type NvmlDeviceGetHandleByIndex = unsafe extern "C" fn(u32, *mut *mut c_void) -> i32;
                    type NvmlDeviceGetName = unsafe extern "C" fn(*mut c_void, *mut c_char, u32) -> i32;
                    type NvmlDeviceGetTemperature = unsafe extern "C" fn(*mut c_void, u32, *mut u32) -> i32;

                    let nvml_init: Result<libloading::Symbol<NvmlInit>, _> = lib.get(b"nvmlInit_v2\0");
                    let nvml_shutdown: Result<libloading::Symbol<NvmlShutdown>, _> = lib.get(b"nvmlShutdown\0");
                    let nvml_get_count: Result<libloading::Symbol<NvmlDeviceGetCount>, _> = lib.get(b"nvmlDeviceGetCount_v2\0");
                    let nvml_get_handle: Result<libloading::Symbol<NvmlDeviceGetHandleByIndex>, _> = lib.get(b"nvmlDeviceGetHandleByIndex_v2\0");
                    let nvml_get_name: Result<libloading::Symbol<NvmlDeviceGetName>, _> = lib.get(b"nvmlDeviceGetName\0");
                    let nvml_get_temp: Result<libloading::Symbol<NvmlDeviceGetTemperature>, _> = lib.get(b"nvmlDeviceGetTemperature\0");

                    if let (Ok(init), Ok(shutdown), Ok(get_count), Ok(get_handle), Ok(get_name), Ok(get_temp)) =
                        (nvml_init, nvml_shutdown, nvml_get_count, nvml_get_handle, nvml_get_name, nvml_get_temp)
                    {
                        if init() == 0 {
                            let mut count: u32 = 0;
                            if get_count(&mut count) == 0 {
                                for i in 0..count {
                                    let mut handle: *mut c_void = std::ptr::null_mut();
                                    if get_handle(i, &mut handle) == 0 && !handle.is_null() {
                                        let mut name_buf = [0i8; 64];
                                        let name_res = get_name(handle, name_buf.as_mut_ptr(), 64);
                                        let gpu_name = if name_res == 0 {
                                            CStr::from_ptr(name_buf.as_ptr()).to_string_lossy().to_string()
                                        } else {
                                            format!("NVIDIA GPU #{}", i)
                                        };

                                        let mut temp_val: u32 = 0;
                                        if get_temp(handle, 0, &mut temp_val) == 0 {
                                            let temp_f = temp_val as f32;
                                            if temp_f > 0.0 && temp_f < 120.0 {
                                                sensors.push(TemperatureSensorInfo {
                                                    id: format!("nvml_gpu_{}", i),
                                                    name: gpu_name.clone(),
                                                    label: format!("{} (Core)", gpu_name),
                                                    temperature_celsius: temp_f,
                                                    sensor_type: "gpu".to_string(),
                                                    provider: "NVML DLL".to_string(),
                                                });
                                            }
                                        }
                                    }
                                }
                            }
                            let _ = shutdown();
                        }
                    }
                }
            }
        }
        Some(sensors)
    });

    output.unwrap_or_default()
}

fn query_acpi_wmi_sensors() -> Vec<TemperatureSensorInfo> {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = std::process::Command::new("powershell.exe");
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
        cmd.args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Get-CimInstance -Namespace root\\wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue | Select-Object InstanceName, CurrentTemperature | ConvertTo-Json -Compress",
        ]);
        let output = run_command_with_timeout(cmd, std::time::Duration::from_secs(3));

        if let Some(json_str) = output {
            let mut sensors = Vec::new();
            let trimmed = json_str.trim();
            if !trimmed.is_empty() {
                if let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) {
                    let items = match value {
                        serde_json::Value::Array(arr) => arr,
                        serde_json::Value::Object(_) => vec![value],
                        _ => vec![],
                    };

                    for (idx, item) in items.iter().enumerate() {
                        let instance_name = item.get("InstanceName").and_then(|v| v.as_str()).unwrap_or("ThermalZone");
                        if let Some(raw_deci_k) = item.get("CurrentTemperature").and_then(|v| v.as_f64()).map(|v| v as f32) {
                            if raw_deci_k > 2000.0 && raw_deci_k < 4000.0 {
                                let celsius = deci_kelvin_to_celsius(raw_deci_k);
                                if celsius > 0.0 && celsius < 110.0 {
                                    sensors.push(TemperatureSensorInfo {
                                        id: format!("acpi_thermal_zone_{}", idx),
                                        name: format!("ACPI Thermal Zone {}", idx),
                                        label: format!("{} ({:.1}°C)", instance_name, celsius),
                                        temperature_celsius: celsius,
                                        sensor_type: "cpu".to_string(),
                                        provider: "ACPI Thermal Zone".to_string(),
                                    });
                                }
                            }
                        }
                    }
                }
            }
            return sensors;
        }
    }
    Vec::new()
}

fn query_nvidia_smi_sensors() -> Vec<TemperatureSensorInfo> {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = std::process::Command::new("nvidia-smi");
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
        cmd.args([
            "--query-gpu=temperature.gpu,name",
            "--format=csv,noheader,nounits",
        ]);
        let output = run_command_with_timeout(cmd, std::time::Duration::from_secs(3));

        if let Some(stdout) = output {
            let mut sensors = Vec::new();
            for (idx, line) in stdout.lines().enumerate() {
                let parts: Vec<&str> = line.split(',').collect();
                if !parts.is_empty() {
                    if let Ok(temp) = parts[0].trim().parse::<f32>() {
                        if temp > 0.0 && temp < 120.0 {
                            let name = if parts.len() > 1 {
                                parts[1].trim().to_string()
                            } else {
                                format!("NVIDIA GPU #{}", idx)
                            };
                            sensors.push(TemperatureSensorInfo {
                                id: format!("nvidia_smi_gpu_{}", idx),
                                name: name.clone(),
                                label: format!("{} (nvidia-smi)", name),
                                temperature_celsius: temp,
                                sensor_type: "gpu".to_string(),
                                provider: "nvidia-smi CLI".to_string(),
                            });
                        }
                    }
                }
            }
            return sensors;
        }
    }
    Vec::new()
}

fn query_sysinfo_sensors() -> Vec<TemperatureSensorInfo> {
    let mut sensors = Vec::new();
    let components = Components::new_with_refreshed_list();
    for (idx, comp) in components.iter().enumerate() {
        let label_lower = comp.label().to_lowercase();
        let temp = comp.temperature();

        let sensor_type = if label_lower.contains("cpu")
            || label_lower.contains("core")
            || label_lower.contains("package")
            || label_lower.contains("tdie")
        {
            "cpu".to_string()
        } else if label_lower.contains("gpu")
            || label_lower.contains("nvidia")
            || label_lower.contains("vram")
        {
            "gpu".to_string()
        } else {
            "other".to_string()
        };

        if temp > 0.0 && temp < 130.0 {
            let clean_label = comp.label().to_string();
            let slug = clean_label.to_lowercase().replace([' ', '/'], "_");
            sensors.push(TemperatureSensorInfo {
                id: format!("sysinfo_{}_{}", slug, idx),
                name: clean_label.clone(),
                label: clean_label,
                temperature_celsius: temp,
                sensor_type,
                provider: "sysinfo Components".to_string(),
            });
        }
    }
    sensors
}

fn push_sensors(
    dest: &mut Vec<TemperatureSensorInfo>,
    existing_ids: &mut std::collections::HashSet<String>,
    sensors: Vec<TemperatureSensorInfo>,
) {
    for mut sensor in sensors {
        if existing_ids.contains(&sensor.id) {
            let mut suffix = 2;
            let base_id = sensor.id.clone();
            while existing_ids.contains(&format!("{}_{}", base_id, suffix)) {
                suffix += 1;
            }
            sensor.id = format!("{}_{}", base_id, suffix);
        }
        existing_ids.insert(sensor.id.clone());
        dest.push(sensor);
    }
}

pub fn collect_temperatures() -> Result<SystemTemperaturesPayload, AppError> {
    let mut sensor_items: Vec<TemperatureSensorInfo> = Vec::new();
    let mut existing_ids: std::collections::HashSet<String> = std::collections::HashSet::new();

    // Tier 1: LibreHardwareMonitor WMI
    push_sensors(&mut sensor_items, &mut existing_ids, query_lhm_wmi_sensors());

    // Tier 2: OpenHardwareMonitor WMI
    push_sensors(&mut sensor_items, &mut existing_ids, query_ohm_wmi_sensors());

    // Tier 3: Dynamic NVML DLL loading (NVIDIA GPUs)
    push_sensors(&mut sensor_items, &mut existing_ids, query_nvml_sensors());

    // Tier 4: ACPI Thermal Zone WMI
    push_sensors(&mut sensor_items, &mut existing_ids, query_acpi_wmi_sensors());

    // Tier 5: nvidia-smi CLI fallback (if no GPU sensor found yet)
    if !sensor_items.iter().any(|s| s.sensor_type == "gpu") {
        push_sensors(&mut sensor_items, &mut existing_ids, query_nvidia_smi_sensors());
    }

    // Tier 6: sysinfo fallback
    push_sensors(&mut sensor_items, &mut existing_ids, query_sysinfo_sensors());

    // Primary CPU & GPU temps:
    let cpu_temp = sensor_items
        .iter()
        .find(|s| s.sensor_type == "cpu")
        .map(|s| s.temperature_celsius);

    let gpu_temp = sensor_items
        .iter()
        .find(|s| s.sensor_type == "gpu")
        .map(|s| s.temperature_celsius);

    let is_cpu_temp_available = cpu_temp.is_some();
    let is_gpu_temp_available = gpu_temp.is_some();

    let mut providers: Vec<String> = sensor_items
        .iter()
        .map(|s| s.provider.clone())
        .collect::<std::collections::BTreeSet<_>>()
        .into_iter()
        .collect();
    providers.sort();

    let sensor_source = if providers.is_empty() {
        "Unavailable / Sensor access denied".to_string()
    } else {
        providers.join(" + ")
    };

    Ok(SystemTemperaturesPayload {
        cpu_temp_celsius: cpu_temp,
        gpu_temp_celsius: gpu_temp,
        is_cpu_temp_available,
        is_gpu_temp_available,
        sensor_source,
        sensor_items,
        selected_cpu_sensor_id: None,
        selected_gpu_sensor_id: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deci_kelvin_to_celsius() {
        assert_eq!(deci_kelvin_to_celsius(2732.0), 0.0);
        assert!((deci_kelvin_to_celsius(3000.0) - 26.8).abs() < 0.01);
        assert_eq!(deci_kelvin_to_celsius(3732.0), 100.0);
        assert_eq!(deci_kelvin_to_celsius(0.0), -273.2);
        assert_eq!(deci_kelvin_to_celsius(2000.0), -73.2);
        assert_eq!(deci_kelvin_to_celsius(4000.0), 126.8);
    }

    #[test]
    fn test_temperature_sensor_info_creation() {
        let sensor = TemperatureSensorInfo {
            id: "lhm_cpu_0".to_string(),
            name: "CPU Package".to_string(),
            label: "AMD Ryzen 7 7800X3D - CPU Package".to_string(),
            temperature_celsius: 48.5,
            sensor_type: "cpu".to_string(),
            provider: "LibreHardwareMonitor WMI".to_string(),
        };

        assert_eq!(sensor.id, "lhm_cpu_0");
        assert_eq!(sensor.temperature_celsius, 48.5);
        assert_eq!(sensor.sensor_type, "cpu");
    }

    #[test]
    fn test_system_temperatures_payload_construction() {
        let sensor = TemperatureSensorInfo {
            id: "acpi_0".to_string(),
            name: "Thermal Zone 0".to_string(),
            label: "ACPI Thermal Zone".to_string(),
            temperature_celsius: 35.0,
            sensor_type: "cpu".to_string(),
            provider: "ACPI Thermal Zone".to_string(),
        };

        let payload = SystemTemperaturesPayload {
            cpu_temp_celsius: Some(35.0),
            gpu_temp_celsius: None,
            is_cpu_temp_available: true,
            is_gpu_temp_available: false,
            sensor_source: "ACPI Thermal Zone".to_string(),
            sensor_items: vec![sensor],
            selected_cpu_sensor_id: Some("acpi_0".to_string()),
            selected_gpu_sensor_id: None,
        };

        let json = serde_json::to_string(&payload).expect("Serialization failed");
        assert!(json.contains("\"cpuTempCelsius\":35.0"));
        assert!(json.contains("\"selectedCpuSensorId\":\"acpi_0\""));
        assert!(json.contains("\"isCpuTempAvailable\":true"));
    }

    #[test]
    fn test_metrics_collector_creation_and_collect() {
        let mut collector = MetricsCollector::new();
        let payload = collector.collect().expect("Collection should succeed");
        assert!(payload.memory_total_mb > 0);
        assert!(payload.timestamp_ms > 0);
    }

    #[test]
    fn test_collect_temperatures_does_not_panic() {
        let payload = collect_temperatures().expect("Temperature collection should not fail");
        assert!(!payload.sensor_source.is_empty());
    }

    #[test]
    fn test_run_with_timeout_bounds() {
        // Fast execution should return Some value
        let fast_res = run_with_timeout(std::time::Duration::from_millis(500), || Some(42));
        assert_eq!(fast_res, Some(42));

        // Execution exceeding timeout should return None
        let slow_res = run_with_timeout(std::time::Duration::from_millis(50), || {
            std::thread::sleep(std::time::Duration::from_millis(300));
            Some(99)
        });
        assert_eq!(slow_res, None);
    }

    #[test]
    fn test_parse_wmi_hardware_monitor_json_edge_cases() {
        // 1. Empty string
        assert!(parse_wmi_hardware_monitor_json("", "TestProvider", "test").is_empty());
        assert!(parse_wmi_hardware_monitor_json("   ", "TestProvider", "test").is_empty());

        // 2. Malformed JSON
        assert!(parse_wmi_hardware_monitor_json("not a json", "TestProvider", "test").is_empty());

        // 3. Array of sensors with different types & temperature filtering
        let json_arr = r#"[
            {"Identifier": "/amdcpu/0/temperature/0", "Name": "CPU Core #1", "Parent": "/amdcpu/0", "Value": 45.5},
            {"Identifier": "/gpu-nvidia/0/temperature/1", "Name": "GPU Hotspot", "Parent": "/gpu-nvidia/0", "Value": 62.0},
            {"Identifier": "/other/sensor", "Name": "Fan Speed Sensor", "Parent": "", "Value": 35.0},
            {"Identifier": "/invalid/low", "Name": "Too Low", "Parent": "", "Value": -5.0},
            {"Identifier": "/invalid/high", "Name": "Too High", "Parent": "", "Value": 150.0}
        ]"#;

        let sensors = parse_wmi_hardware_monitor_json(json_arr, "Test LHM", "lhm");
        assert_eq!(sensors.len(), 3); // -5.0 and 150.0 filtered out
        assert_eq!(sensors[0].sensor_type, "cpu");
        assert_eq!(sensors[0].id, "lhm_amdcpu_0_temperature_0");
        assert_eq!(sensors[0].label, "amdcpu/0 - CPU Core #1");

        assert_eq!(sensors[1].sensor_type, "gpu");
        assert_eq!(sensors[1].id, "lhm_gpu-nvidia_0_temperature_1");

        assert_eq!(sensors[2].sensor_type, "other");

        // 4. Single object JSON
        let json_obj = r#"{"Identifier": "/intel/cpu/pkg", "Name": "CPU Package", "Parent": "", "Value": 55.0}"#;
        let single_sensor = parse_wmi_hardware_monitor_json(json_obj, "Test LHM", "lhm");
        assert_eq!(single_sensor.len(), 1);
        assert_eq!(single_sensor[0].id, "lhm_intel_cpu_pkg");
        assert_eq!(single_sensor[0].sensor_type, "cpu");
    }

    #[test]
    fn test_push_sensors_deduplication() {
        let mut dest = Vec::new();
        let mut existing_ids = std::collections::HashSet::new();

        let s1 = TemperatureSensorInfo {
            id: "sensor_a".to_string(),
            name: "Sensor A".to_string(),
            label: "Sensor A".to_string(),
            temperature_celsius: 40.0,
            sensor_type: "cpu".to_string(),
            provider: "P1".to_string(),
        };

        let s2 = TemperatureSensorInfo {
            id: "sensor_a".to_string(),
            name: "Sensor A Duplicate".to_string(),
            label: "Sensor A Dup".to_string(),
            temperature_celsius: 41.0,
            sensor_type: "cpu".to_string(),
            provider: "P2".to_string(),
        };

        push_sensors(&mut dest, &mut existing_ids, vec![s1, s2]);

        assert_eq!(dest.len(), 2);
        assert_eq!(dest[0].id, "sensor_a");
        assert_eq!(dest[1].id, "sensor_a_2");
    }

    #[test]
    fn test_gpu_core_sensor_misclassification_bug() {
        let json_arr = r#"[
            {"Identifier": "/gpu-nvidia/0/temperature/0", "Name": "GPU Core", "Parent": "/gpu-nvidia/0", "Value": 62.0}
        ]"#;
        let sensors = parse_wmi_hardware_monitor_json(json_arr, "LibreHardwareMonitor WMI", "lhm");
        assert_eq!(sensors.len(), 1);
        assert_eq!(
            sensors[0].sensor_type,
            "gpu",
            "GPU Core sensor should be classified as 'gpu', but was classified as '{}'",
            sensors[0].sensor_type
        );
    }

    #[test]
    fn test_run_command_with_timeout_terminates_hanging_process() {
        #[cfg(target_os = "windows")]
        {
            let mut cmd = std::process::Command::new("powershell.exe");
            cmd.args(["-NoProfile", "-Command", "Start-Sleep -Seconds 10"]);
            let start = std::time::Instant::now();
            let res = run_command_with_timeout(cmd, std::time::Duration::from_millis(200));
            let elapsed = start.elapsed();
            assert_eq!(res, None);
            assert!(elapsed < std::time::Duration::from_secs(2), "Command timeout should terminate within limit, elapsed: {:?}", elapsed);
        }
    }
}



