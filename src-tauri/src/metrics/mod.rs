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
    pub name: String,
    pub label: String,
    pub temperature_celsius: f32,
    pub sensor_type: String, // "cpu", "gpu", or "other"
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
        // Sum total read/written across process list or disk usage in sysinfo
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
        let dt = if elapsed_secs < 0.001 { 1.0 } else { elapsed_secs };
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

pub fn collect_temperatures() -> Result<SystemTemperaturesPayload, AppError> {
    let mut sensor_items: Vec<TemperatureSensorInfo> = Vec::new();
    let mut cpu_temp: Option<f32> = None;
    let mut gpu_temp: Option<f32> = None;
    let mut sources: Vec<String> = Vec::new();

    // Tier 1: sysinfo::Components
    let components = Components::new_with_refreshed_list();
    for comp in &components {
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
            sensor_items.push(TemperatureSensorInfo {
                name: comp.label().to_string(),
                label: comp.label().to_string(),
                temperature_celsius: temp,
                sensor_type: sensor_type.clone(),
            });

            if sensor_type == "cpu" && cpu_temp.is_none() {
                cpu_temp = Some(temp);
            }
            if sensor_type == "gpu" && gpu_temp.is_none() {
                gpu_temp = Some(temp);
            }
        }
    }

    if !sensor_items.is_empty() {
        sources.push("sysinfo Components".to_string());
    }

    // Tier 2: WMI ACPI Thermal Zone query if CPU temp still missing (Windows)
    if cpu_temp.is_none() {
        if let Some(wmi_temp) = query_wmi_acpi_temp() {
            cpu_temp = Some(wmi_temp);
            sensor_items.push(TemperatureSensorInfo {
                name: "ACPI Thermal Zone".to_string(),
                label: "WMI MSAcpi_ThermalZoneTemperature".to_string(),
                temperature_celsius: wmi_temp,
                sensor_type: "cpu".to_string(),
            });
            sources.push("WMI ACPI".to_string());
        }
    }

    // Tier 3: nvidia-smi if GPU temp still missing (Windows / NVIDIA)
    if gpu_temp.is_none() {
        if let Some(nv_temp) = query_nvidia_smi_temp() {
            gpu_temp = Some(nv_temp);
            sensor_items.push(TemperatureSensorInfo {
                name: "NVIDIA GPU".to_string(),
                label: "nvidia-smi".to_string(),
                temperature_celsius: nv_temp,
                sensor_type: "gpu".to_string(),
            });
            sources.push("NVIDIA SMI".to_string());
        }
    }

    let is_cpu_temp_available = cpu_temp.is_some();
    let is_gpu_temp_available = gpu_temp.is_some();
    let sensor_source = if sources.is_empty() {
        "Unavailable / Sensor access denied".to_string()
    } else {
        sources.join(" + ")
    };

    Ok(SystemTemperaturesPayload {
        cpu_temp_celsius: cpu_temp,
        gpu_temp_celsius: gpu_temp,
        is_cpu_temp_available,
        is_gpu_temp_available,
        sensor_source,
        sensor_items,
    })
}

fn query_wmi_acpi_temp() -> Option<f32> {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = std::process::Command::new("powershell.exe");
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
        let output = cmd
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue | Select-Object -ExpandProperty CurrentTemperature",
            ])
            .output()
            .ok()?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                let trimmed = line.trim();
                if let Ok(raw_deci_k) = trimmed.parse::<f32>() {
                    if raw_deci_k > 2000.0 && raw_deci_k < 4000.0 {
                        // Formula: (T_deciKelvin - 2732) / 10.0 = T_Celsius
                        let celsius = (raw_deci_k - 2732.0) / 10.0;
                        if celsius > 0.0 && celsius < 110.0 {
                            return Some(celsius);
                        }
                    }
                }
            }
        }
    }
    None
}

fn query_nvidia_smi_temp() -> Option<f32> {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = std::process::Command::new("nvidia-smi");
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
        let output = cmd
            .args(["--query-gpu=temperature.gpu", "--format=csv,noheader,nounits"])
            .output()
            .ok()?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                let trimmed = line.trim();
                if let Ok(val) = trimmed.parse::<f32>() {
                    if val > 0.0 && val < 120.0 {
                        return Some(val);
                    }
                }
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

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
        assert!(payload.sensor_source.len() > 0);
    }

    #[test]
    fn test_payload_serialization_camel_case() {
        let sample = SystemMetricsPayload {
            cpu_usage_percent: 15.5,
            cpu_core_count: 8,
            per_core_cpu_usage: vec![10.0, 20.0],
            memory_used_mb: 4096,
            memory_total_mb: 16384,
            memory_free_mb: 12288,
            memory_usage_percent: 25.0,
            disk_read_bytes_per_sec: 1024.0,
            disk_write_bytes_per_sec: 2048.0,
            disk_total_read_bytes: 50000,
            disk_total_write_bytes: 100000,
            network_rx_bytes_per_sec: 500.0,
            network_tx_bytes_per_sec: 1000.0,
            network_total_rx_bytes: 20000,
            network_total_tx_bytes: 40000,
            timestamp_ms: 1700000000000,
        };

        let json = serde_json::to_string(&sample).expect("Serialization failed");
        assert!(json.contains("\"cpuUsagePercent\":15.5"));
        assert!(json.contains("\"diskReadBytesPerSec\":1024.0"));
        assert!(json.contains("\"networkRxBytesPerSec\":500.0"));
    }
}
