use serde::{Deserialize, Serialize};

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

/// Validates whether a temperature reading is within physical operating range.
/// Discards disconnected/frozen 0°C, extreme low <= 5°C, and saturation >= 118°C.
pub fn is_valid_temperature(temp: f32) -> bool {
    !temp.is_nan() && !temp.is_infinite() && temp > 5.0 && temp < 118.0
}

/// Identifies static BIOS ACPI stub zones (300.0 K = 26.85°C and 301.0 K = 27.85°C)
/// used by motherboard DSDT tables for unpopulated sensor slots.
pub fn is_dummy_acpi_reading(temp: f32) -> bool {
    (26.7..=27.05).contains(&temp) || (27.7..=28.05).contains(&temp)
}

/// Classifies a hardware sensor into "cpu", "gpu", or "other".
/// GPU patterns are evaluated first to prevent "GPU Core" from being classified as CPU.
pub fn classify_sensor(identifier: &str, name: &str, parent: &str) -> String {
    let combined = format!("{} {} {}", identifier, name, parent).to_lowercase();

    if combined.contains("gpu")
        || combined.contains("nvidia")
        || combined.contains("radeon")
        || combined.contains("geforce")
        || combined.contains("rtx")
        || combined.contains("gtx")
        || combined.contains("vram")
        || combined.contains("atigpu")
        || combined.contains("amdgpu")
        || combined.contains("amd radeon")
        || combined.contains("intel iris")
        || combined.contains("intel arc")
    {
        "gpu".to_string()
    } else if combined.contains("cpu")
        || combined.contains("core")
        || combined.contains("package")
        || combined.contains("pkg")
        || combined.contains("tdie")
        || combined.contains("tctl")
        || combined.contains("ccd")
        || combined.contains("ccx")
        || combined.contains("processor")
        || combined.contains("ia cores")
        || combined.contains("acpi_thermal_zone")
        || combined.contains("thermal zone")
        || combined.contains("thermalzone")
    {
        "cpu".to_string()
    } else {
        "other".to_string()
    }
}

/// Selects the most accurate primary CPU temperature and sensor ID.
/// Priority hierarchy:
/// 1. CPU Package / Tdie / Tctl / Core Max / CCD with active (non-dummy) reading.
/// 2. Any CPU Core / active ACPI thermal zone with non-dummy reading.
/// 3. Fallback to first available CPU sensor.
pub fn select_primary_cpu_sensor(sensors: &[TemperatureSensorInfo]) -> (Option<f32>, Option<String>) {
    let cpu_sensors: Vec<&TemperatureSensorInfo> = sensors
        .iter()
        .filter(|s| s.sensor_type == "cpu" && is_valid_temperature(s.temperature_celsius))
        .collect();

    if cpu_sensors.is_empty() {
        return (None, None);
    }

    // Tier 1: CPU Package / Tdie / Tctl / Core Max with non-dummy reading
    let tier1 = cpu_sensors.iter().find(|s| {
        let text = format!("{} {}", s.name, s.label).to_lowercase();
        (text.contains("package")
            || text.contains("tdie")
            || text.contains("tctl")
            || text.contains("core max")
            || text.contains("ccd")
            || text.contains("processor"))
            && !is_dummy_acpi_reading(s.temperature_celsius)
    });
    if let Some(s) = tier1 {
        return (Some(s.temperature_celsius), Some(s.id.clone()));
    }

    // Tier 2: Any CPU sensor with non-dummy reading
    let tier2 = cpu_sensors.iter().find(|s| !is_dummy_acpi_reading(s.temperature_celsius));
    if let Some(s) = tier2 {
        return (Some(s.temperature_celsius), Some(s.id.clone()));
    }

    // Tier 3: First available CPU sensor
    cpu_sensors
        .first()
        .map(|s| (Some(s.temperature_celsius), Some(s.id.clone())))
        .unwrap_or((None, None))
}

/// Selects the most representative primary GPU temperature and sensor ID.
/// Priority hierarchy:
/// 1. GPU Core / Edge / General GPU Temp (excluding hotspot/vram unless only option).
/// 2. Fallback to first available GPU sensor.
pub fn select_primary_gpu_sensor(sensors: &[TemperatureSensorInfo]) -> (Option<f32>, Option<String>) {
    let gpu_sensors: Vec<&TemperatureSensorInfo> = sensors
        .iter()
        .filter(|s| s.sensor_type == "gpu" && is_valid_temperature(s.temperature_celsius))
        .collect();

    if gpu_sensors.is_empty() {
        return (None, None);
    }

    // Tier 1: GPU Core / Edge / General temp
    let tier1 = gpu_sensors.iter().find(|s| {
        let text = format!("{} {}", s.name, s.label).to_lowercase();
        (text.contains("core")
            || text.contains("edge")
            || text.contains("temperature")
            || text.contains("gpu #")
            || text.contains("adl")
            || text.contains("nvml"))
            && !text.contains("hotspot")
            && !text.contains("junction")
            && !text.contains("vram")
            && !text.contains("memory")
    });
    if let Some(s) = tier1 {
        return (Some(s.temperature_celsius), Some(s.id.clone()));
    }

    // Tier 2: First available GPU sensor
    gpu_sensors
        .first()
        .map(|s| (Some(s.temperature_celsius), Some(s.id.clone())))
        .unwrap_or((None, None))
}

/// Appends valid sensors to the destination vector while deduplicating duplicate IDs.
pub fn push_sensors(
    dest: &mut Vec<TemperatureSensorInfo>,
    existing_ids: &mut std::collections::HashSet<String>,
    sensors: Vec<TemperatureSensorInfo>,
) {
    for mut sensor in sensors {
        if !is_valid_temperature(sensor.temperature_celsius) {
            continue;
        }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_valid_temperature_bounds() {
        assert!(!is_valid_temperature(0.0));
        assert!(!is_valid_temperature(5.0));
        assert!(!is_valid_temperature(-10.0));
        assert!(!is_valid_temperature(118.0));
        assert!(!is_valid_temperature(128.0));
        assert!(!is_valid_temperature(f32::NAN));
        assert!(!is_valid_temperature(f32::INFINITY));

        assert!(is_valid_temperature(5.1));
        assert!(is_valid_temperature(35.0));
        assert!(is_valid_temperature(65.4));
        assert!(is_valid_temperature(117.9));
    }

    #[test]
    fn test_is_dummy_acpi_reading() {
        assert!(is_dummy_acpi_reading(26.8));
        assert!(is_dummy_acpi_reading(26.85));
        assert!(is_dummy_acpi_reading(27.0));
        assert!(is_dummy_acpi_reading(27.8));
        assert!(is_dummy_acpi_reading(27.85));
        assert!(is_dummy_acpi_reading(28.0));

        assert!(!is_dummy_acpi_reading(25.0));
        assert!(!is_dummy_acpi_reading(26.5));
        assert!(!is_dummy_acpi_reading(27.3));
        assert!(!is_dummy_acpi_reading(35.0));
        assert!(!is_dummy_acpi_reading(60.0));
    }

    #[test]
    fn test_classify_sensor_patterns() {
        assert_eq!(classify_sensor("/amdcpu/0/temperature/0", "CPU Core #1", "/amdcpu/0"), "cpu");
        assert_eq!(classify_sensor("/intelcpu/0/temperature/pkg", "CPU Package", "/intelcpu/0"), "cpu");
        assert_eq!(classify_sensor("acpi_0", "ACPI Thermal Zone 0", ""), "cpu");

        assert_eq!(classify_sensor("/gpu-nvidia/0/temperature/0", "GPU Core", "/gpu-nvidia/0"), "gpu");
        assert_eq!(classify_sensor("/atigpu/0/temperature/0", "GPU Temperature", "/atigpu/0"), "gpu");
        assert_eq!(classify_sensor("adl_0", "AMD Radeon RX 7900 XTX", ""), "gpu");
        assert_eq!(classify_sensor("nvml_0", "NVIDIA GeForce RTX 4080", ""), "gpu");

        assert_eq!(classify_sensor("/lpc/nct6798d/temperature/1", "Motherboard", "/lpc/nct6798d"), "other");
        assert_eq!(classify_sensor("fan_0", "Chassis Fan 1", ""), "other");
    }

    #[test]
    fn test_select_primary_cpu_sensor_prefers_package_over_dummy_acpi() {
        let sensors = vec![
            TemperatureSensorInfo {
                id: "acpi_stub".to_string(),
                name: "ACPI Thermal Zone 0".to_string(),
                label: "ACPI Thermal Zone 0 (26.8°C)".to_string(),
                temperature_celsius: 26.8, // Dummy BIOS stub
                sensor_type: "cpu".to_string(),
                provider: "ACPI".to_string(),
            },
            TemperatureSensorInfo {
                id: "cpu_pkg".to_string(),
                name: "CPU Package".to_string(),
                label: "AMD Ryzen 7 7800X3D - CPU Package".to_string(),
                temperature_celsius: 54.2,
                sensor_type: "cpu".to_string(),
                provider: "LHM".to_string(),
            },
        ];

        let (temp, id) = select_primary_cpu_sensor(&sensors);
        assert_eq!(temp, Some(54.2));
        assert_eq!(id, Some("cpu_pkg".to_string()));
    }

    #[test]
    fn test_select_primary_cpu_sensor_fallback_when_only_dummy() {
        let sensors = vec![
            TemperatureSensorInfo {
                id: "acpi_stub".to_string(),
                name: "ACPI Thermal Zone 0".to_string(),
                label: "ACPI Thermal Zone 0".to_string(),
                temperature_celsius: 26.8,
                sensor_type: "cpu".to_string(),
                provider: "ACPI".to_string(),
            },
        ];

        let (temp, id) = select_primary_cpu_sensor(&sensors);
        assert_eq!(temp, Some(26.8));
        assert_eq!(id, Some("acpi_stub".to_string()));
    }

    #[test]
    fn test_select_primary_gpu_sensor_prefers_core_over_hotspot() {
        let sensors = vec![
            TemperatureSensorInfo {
                id: "gpu_hotspot".to_string(),
                name: "GPU Hotspot".to_string(),
                label: "NVIDIA RTX 4090 - GPU Hotspot".to_string(),
                temperature_celsius: 78.0,
                sensor_type: "gpu".to_string(),
                provider: "NVML".to_string(),
            },
            TemperatureSensorInfo {
                id: "gpu_core".to_string(),
                name: "GPU Core".to_string(),
                label: "NVIDIA RTX 4090 - GPU Core".to_string(),
                temperature_celsius: 62.0,
                sensor_type: "gpu".to_string(),
                provider: "NVML".to_string(),
            },
        ];

        let (temp, id) = select_primary_gpu_sensor(&sensors);
        assert_eq!(temp, Some(62.0));
        assert_eq!(id, Some("gpu_core".to_string()));
    }

    #[test]
    fn test_push_sensors_filters_invalid_and_deduplicates() {
        let mut dest = Vec::new();
        let mut ids = std::collections::HashSet::new();

        let s1 = TemperatureSensorInfo {
            id: "sensor_x".to_string(),
            name: "Sensor X".to_string(),
            label: "Sensor X".to_string(),
            temperature_celsius: 45.0,
            sensor_type: "cpu".to_string(),
            provider: "P1".to_string(),
        };
        let s1_dup = TemperatureSensorInfo {
            id: "sensor_x".to_string(),
            name: "Sensor X Dup".to_string(),
            label: "Sensor X Dup".to_string(),
            temperature_celsius: 46.0,
            sensor_type: "cpu".to_string(),
            provider: "P2".to_string(),
        };
        let s_invalid = TemperatureSensorInfo {
            id: "sensor_bad".to_string(),
            name: "Bad".to_string(),
            label: "Bad".to_string(),
            temperature_celsius: 0.0, // Invalid
            sensor_type: "cpu".to_string(),
            provider: "P3".to_string(),
        };

        push_sensors(&mut dest, &mut ids, vec![s1, s1_dup, s_invalid]);

        assert_eq!(dest.len(), 2);
        assert_eq!(dest[0].id, "sensor_x");
        assert_eq!(dest[1].id, "sensor_x_2");
    }
}
