use super::sensors::{classify_sensor, is_valid_temperature, TemperatureSensorInfo};

/// Converts temperature in tenths of a Kelvin (deci-Kelvin, 0.1 K) to Celsius.
/// Formula: T_celsius = (deci_k - 2732.0) / 10.0
pub fn deci_kelvin_to_celsius(deci_k: f32) -> f32 {
    (deci_k - 2732.0) / 10.0
}

/// Converts temperature in Kelvin to Celsius.
/// Formula: T_celsius = k - 273.15
pub fn kelvin_to_celsius(k: f32) -> f32 {
    k - 273.15
}

/// Parses temperature values from `root\cimv2` `Win32_PerfFormattedData_Counters_ThermalZoneInformation`
/// which may be presented in deci-Kelvin, Kelvin, or raw Celsius.
pub fn parse_perf_thermal_zone_value(val: f32) -> Option<f32> {
    if (2000.0..=4000.0).contains(&val) {
        let c = deci_kelvin_to_celsius(val);
        if is_valid_temperature(c) {
            return Some(c);
        }
    } else if (200.0..=400.0).contains(&val) {
        let c = kelvin_to_celsius(val);
        if is_valid_temperature(c) {
            return Some(c);
        }
    } else if is_valid_temperature(val) {
        return Some(val);
    }
    None
}

/// Queries `MSAcpi_ThermalZoneTemperature` from `root\wmi`.
pub fn query_acpi_wmi_sensors() -> Vec<TemperatureSensorInfo> {
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
        let output = super::run_command_with_timeout(cmd, std::time::Duration::from_secs(2));

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
                            if (2000.0..=4000.0).contains(&raw_deci_k) {
                                let celsius = deci_kelvin_to_celsius(raw_deci_k);
                                if is_valid_temperature(celsius) {
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

/// Queries `Win32_PerfFormattedData_Counters_ThermalZoneInformation` from `root\cimv2`.
/// This provides laptop thermal zone data on systems where `root\wmi` is restricted.
pub fn query_perf_thermal_zone_sensors() -> Vec<TemperatureSensorInfo> {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = std::process::Command::new("powershell.exe");
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
        cmd.args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Get-CimInstance -Namespace root\\cimv2 -ClassName Win32_PerfFormattedData_Counters_ThermalZoneInformation -ErrorAction SilentlyContinue | Select-Object Name, Temperature | ConvertTo-Json -Compress",
        ]);
        let output = super::run_command_with_timeout(cmd, std::time::Duration::from_secs(2));

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
                        let raw_name = item.get("Name").and_then(|v| v.as_str()).unwrap_or("ThermalZone");
                        let clean_name = raw_name
                            .trim_start_matches("\\Thermal Zone Information(")
                            .trim_end_matches(")\\Temperature")
                            .replace(['\\', '/', '(', ')', '"'], "");

                        if let Some(raw_temp) = item.get("Temperature").and_then(|v| v.as_f64()).map(|v| v as f32) {
                            if let Some(celsius) = parse_perf_thermal_zone_value(raw_temp) {
                                sensors.push(TemperatureSensorInfo {
                                    id: format!("perf_thermal_zone_{}", idx),
                                    name: format!("Thermal Zone {}", clean_name),
                                    label: format!("ACPI PerfZone - {} ({:.1}°C)", clean_name, celsius),
                                    temperature_celsius: celsius,
                                    sensor_type: "cpu".to_string(),
                                    provider: "Thermal Zone (root\\cimv2)".to_string(),
                                });
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

/// Queries `Win32_TemperatureProbe` from `root\cimv2` (supported on workstation & enterprise motherboards).
pub fn query_temperature_probe_sensors() -> Vec<TemperatureSensorInfo> {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = std::process::Command::new("powershell.exe");
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
        cmd.args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Get-CimInstance -Namespace root\\cimv2 -ClassName Win32_TemperatureProbe -ErrorAction SilentlyContinue | Select-Object DeviceID, Name, CurrentReading | ConvertTo-Json -Compress",
        ]);
        let output = super::run_command_with_timeout(cmd, std::time::Duration::from_secs(2));

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
                        let device_id = item.get("DeviceID").and_then(|v| v.as_str()).unwrap_or("");
                        let name = item.get("Name").and_then(|v| v.as_str()).unwrap_or("Temperature Probe");
                        if let Some(reading) = item.get("CurrentReading").and_then(|v| v.as_f64()).map(|v| v as f32) {
                            let temp_c = if (2000.0..=4000.0).contains(&reading) {
                                deci_kelvin_to_celsius(reading)
                            } else if (200.0..=400.0).contains(&reading) {
                                kelvin_to_celsius(reading)
                            } else if (100.0..=1200.0).contains(&reading) {
                                reading / 10.0
                            } else {
                                reading
                            };

                            if is_valid_temperature(temp_c) {
                                sensors.push(TemperatureSensorInfo {
                                    id: format!("wmi_probe_{}", idx),
                                    name: name.to_string(),
                                    label: format!("{} ({:.1}°C)", name, temp_c),
                                    temperature_celsius: temp_c,
                                    sensor_type: classify_sensor(device_id, name, ""),
                                    provider: "Win32_TemperatureProbe".to_string(),
                                });
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deci_kelvin_to_celsius_conversions() {
        assert_eq!(deci_kelvin_to_celsius(2732.0), 0.0);
        assert!((deci_kelvin_to_celsius(3000.0) - 26.8).abs() < 0.01);
        assert_eq!(deci_kelvin_to_celsius(3232.0), 50.0);
        assert_eq!(deci_kelvin_to_celsius(3432.0), 70.0);
        assert_eq!(deci_kelvin_to_celsius(3732.0), 100.0);
    }

    #[test]
    fn test_kelvin_to_celsius_conversions() {
        assert!((kelvin_to_celsius(273.15) - 0.0).abs() < 0.01);
        assert!((kelvin_to_celsius(300.0) - 26.85).abs() < 0.01);
        assert!((kelvin_to_celsius(323.15) - 50.0).abs() < 0.01);
        assert!((kelvin_to_celsius(343.15) - 70.0).abs() < 0.01);
    }

    #[test]
    fn test_parse_perf_thermal_zone_value() {
        // Deci-Kelvin format
        let val_dk = parse_perf_thermal_zone_value(3250.0);
        assert!(val_dk.is_some());
        assert!((val_dk.unwrap() - 51.8).abs() < 0.01);

        // Kelvin format
        let val_k = parse_perf_thermal_zone_value(320.0);
        assert!(val_k.is_some());
        assert!((val_k.unwrap() - 46.85).abs() < 0.01);

        // Direct Celsius format
        let val_c = parse_perf_thermal_zone_value(48.5);
        assert_eq!(val_c, Some(48.5));

        // Invalid bounds
        assert_eq!(parse_perf_thermal_zone_value(0.0), None);
        assert_eq!(parse_perf_thermal_zone_value(5000.0), None);
    }
}
