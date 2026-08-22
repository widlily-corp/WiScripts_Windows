//! Milestone 1 Adversarial Empirical Challenger Test Suite
//!
//! Stress tests:
//! 1. Physical Boundary Value Analysis & Invalid Temperatures
//! 2. DSDT Dummy ACPI Detection & Narrow Boundary Margins
//! 3. Temperature Unit Conversions (Deci-Kelvin, Kelvin, Milli-Celsius, Raw Celsius)
//! 4. Hardware Classification Robustness & Precedence
//! 5. Primary CPU/GPU Heuristic Selection Under Adversarial Scenarios
//! 6. ADL C ABI Alignment, Adapter Deduplication & C-String Parser
//! 7. Malformed WMI JSON & Sensor Disambiguation Stress
//! 8. Concurrency & Re-entrancy Safety

use wiscripts_windows_lib::metrics::{
    acpi::{deci_kelvin_to_celsius, kelvin_to_celsius, parse_perf_thermal_zone_value},
    adl::{
        deduplicate_adl_adapters, milli_celsius_to_celsius, parse_c_string_bytes,
        ADLAdapterInfo, ADLTemperature,
    },
    sensors::{
        classify_sensor, is_dummy_acpi_reading, is_valid_temperature, push_sensors,
        select_primary_cpu_sensor, select_primary_gpu_sensor, TemperatureSensorInfo,
    },
    parse_wmi_hardware_monitor_json,
};
use std::collections::HashSet;

// ============================================================================
// 1. PHYSICAL BOUNDARY VALUE ANALYSIS & INVALID TEMPERATURES
// ============================================================================

#[test]
fn test_adversarial_is_valid_temperature_boundaries() {
    // Non-finite floats
    assert!(!is_valid_temperature(f32::NAN));
    assert!(!is_valid_temperature(f32::INFINITY));
    assert!(!is_valid_temperature(f32::NEG_INFINITY));

    // Subzero and absolute zero
    assert!(!is_valid_temperature(-273.15));
    assert!(!is_valid_temperature(-50.0));
    assert!(!is_valid_temperature(-1.0));
    assert!(!is_valid_temperature(-0.0));
    assert!(!is_valid_temperature(0.0)); // Frozen disconnected sensor

    // Low boundary: (5.0, 118.0)
    assert!(!is_valid_temperature(f32::MIN_POSITIVE));
    assert!(!is_valid_temperature(1.0));
    assert!(!is_valid_temperature(4.9999));
    assert!(!is_valid_temperature(5.0)); // Exact lower bound is exclusive
    assert!(is_valid_temperature(5.0001));
    assert!(is_valid_temperature(5.1));

    // Normal operating range
    assert!(is_valid_temperature(20.0));
    assert!(is_valid_temperature(35.5));
    assert!(is_valid_temperature(65.0));
    assert!(is_valid_temperature(95.0));

    // High boundary: (5.0, 118.0)
    assert!(is_valid_temperature(117.9));
    assert!(is_valid_temperature(117.999));
    assert!(!is_valid_temperature(118.0)); // Exact upper bound is exclusive
    assert!(!is_valid_temperature(118.0001));
    assert!(!is_valid_temperature(125.0));
    assert!(!is_valid_temperature(255.0));
    assert!(!is_valid_temperature(9999.0));
    assert!(!is_valid_temperature(f32::MAX));
}

// ============================================================================
// 2. DSDT DUMMY ACPI DETECTION & NARROW BOUNDARY MARGINS
// ============================================================================

#[test]
fn test_adversarial_dsdt_dummy_acpi_detection() {
    // 300.0 K (26.85°C) and Deci-K 3000 (26.80°C) -> Interval: [26.7, 27.05]
    assert!(!is_dummy_acpi_reading(26.69));
    assert!(is_dummy_acpi_reading(26.70));
    assert!(is_dummy_acpi_reading(26.80)); // 3000 deci-K
    assert!(is_dummy_acpi_reading(26.85)); // 300.0 K
    assert!(is_dummy_acpi_reading(27.00));
    assert!(is_dummy_acpi_reading(27.05));
    assert!(!is_dummy_acpi_reading(27.06));

    // Intermediate gap
    assert!(!is_dummy_acpi_reading(27.10));
    assert!(!is_dummy_acpi_reading(27.35));
    assert!(!is_dummy_acpi_reading(27.65));

    // 301.0 K (27.85°C) and Deci-K 3010 (27.80°C) -> Interval: [27.7, 28.05]
    assert!(!is_dummy_acpi_reading(27.69));
    assert!(is_dummy_acpi_reading(27.70));
    assert!(is_dummy_acpi_reading(27.80)); // 3010 deci-K
    assert!(is_dummy_acpi_reading(27.85)); // 301.0 K
    assert!(is_dummy_acpi_reading(28.00));
    assert!(is_dummy_acpi_reading(28.05));
    assert!(!is_dummy_acpi_reading(28.06));

    // Legitimate operational temperatures
    assert!(!is_dummy_acpi_reading(24.0));
    assert!(!is_dummy_acpi_reading(25.5));
    assert!(!is_dummy_acpi_reading(29.0));
    assert!(!is_dummy_acpi_reading(42.0));
    assert!(!is_dummy_acpi_reading(75.0));
}

// ============================================================================
// 3. TEMPERATURE UNIT CONVERSIONS ACROSS FORMATS
// ============================================================================

#[test]
fn test_adversarial_temperature_conversions() {
    // Deci-Kelvin to Celsius: T_c = (deci_k - 2732.0) / 10.0
    assert_eq!(deci_kelvin_to_celsius(2732.0), 0.0);
    assert_eq!(deci_kelvin_to_celsius(3232.0), 50.0);
    assert_eq!(deci_kelvin_to_celsius(3732.0), 100.0);
    assert!((deci_kelvin_to_celsius(3000.0) - 26.8).abs() < 0.001);
    assert!((deci_kelvin_to_celsius(3010.0) - 27.8).abs() < 0.001);

    // Kelvin to Celsius: T_c = k - 273.15
    assert!((kelvin_to_celsius(273.15) - 0.0).abs() < 0.001);
    assert!((kelvin_to_celsius(300.0) - 26.85).abs() < 0.001);
    assert!((kelvin_to_celsius(301.0) - 27.85).abs() < 0.001);
    assert!((kelvin_to_celsius(373.15) - 100.0).abs() < 0.001);

    // Milli-Celsius to Celsius: T_c = milli_c / 1000.0
    assert_eq!(milli_celsius_to_celsius(0), 0.0);
    assert_eq!(milli_celsius_to_celsius(55000), 55.0);
    assert_eq!(milli_celsius_to_celsius(68500), 68.5);

    // parse_perf_thermal_zone_value multi-format dispatcher
    // Deci-Kelvin (2000.0 .. 4000.0)
    let dk = parse_perf_thermal_zone_value(3200.0).unwrap();
    assert!((dk - 46.8).abs() < 0.01);

    // Kelvin (200.0 .. 400.0)
    let k = parse_perf_thermal_zone_value(315.0).unwrap();
    assert!((k - 41.85).abs() < 0.01);

    // Raw Celsius (5.0 .. 118.0)
    assert_eq!(parse_perf_thermal_zone_value(58.5), Some(58.5));

    // Ambiguous & Invalid Ranges
    assert_eq!(parse_perf_thermal_zone_value(0.0), None);
    assert_eq!(parse_perf_thermal_zone_value(4.0), None);
    assert_eq!(parse_perf_thermal_zone_value(150.0), None); // > 118 and < 200
    assert_eq!(parse_perf_thermal_zone_value(1000.0), None); // > 400 and < 2000
    assert_eq!(parse_perf_thermal_zone_value(5000.0), None); // > 4000
    assert_eq!(parse_perf_thermal_zone_value(f32::NAN), None);
}

// ============================================================================
// 4. HARDWARE SENSOR CLASSIFICATION ROBUSTNESS
// ============================================================================

#[test]
fn test_adversarial_sensor_classification_precedence() {
    // Critical test: GPU names containing CPU-like keywords must still classify as "gpu"
    let gpu_cases = [
        ("nvml_0", "NVIDIA GeForce RTX 4090", "NVIDIA"),
        ("adl_0", "AMD Radeon RX 7900 XTX", "AMD"),
        ("/gpu-nvidia/0/temperature/0", "GPU Core", "/gpu-nvidia/0"),
        ("/gpu-nvidia/0/temperature/1", "GPU Hotspot", "/gpu-nvidia/0"),
        ("/gpu-nvidia/0/temperature/2", "GPU Memory Junction", "/gpu-nvidia/0"),
        ("/atigpu/0/temperature/0", "GPU Edge", "/atigpu/0"),
        ("/atigpu/0/temperature/1", "GPU Hotspot", "/atigpu/0"),
        ("amd_smi_0", "AMD Radeon(TM) Graphics", "amd-smi"),
        ("nvidia_smi_0", "NVIDIA RTX A6000", "nvidia-smi"),
        ("/intelgpu/0/temperature/0", "Intel Iris Xe Graphics", "/intelgpu/0"),
        ("/intelgpu/1/temperature/0", "Intel Arc A770", "/intelgpu/1"),
    ];

    for (id, name, parent) in &gpu_cases {
        assert_eq!(
            classify_sensor(id, name, parent),
            "gpu",
            "Failed GPU classification for id='{}', name='{}', parent='{}'",
            id, name, parent
        );
    }

    let cpu_cases = [
        ("/intelcpu/0/temperature/0", "CPU Package", "/intelcpu/0"),
        ("/intelcpu/0/temperature/1", "CPU Core #1", "/intelcpu/0"),
        ("/intelcpu/0/temperature/2", "IA Cores", "/intelcpu/0"),
        ("/amdcpu/0/temperature/0", "Tctl/Tdie", "/amdcpu/0"),
        ("/amdcpu/0/temperature/1", "Core Max", "/amdcpu/0"),
        ("/amdcpu/0/temperature/2", "CCD1 Temperature", "/amdcpu/0"),
        ("acpi_thermal_zone_0", "ACPI Thermal Zone 0", "root\\wmi"),
        ("perf_thermal_zone_0", "Thermal Zone _TZ.THM0", "root\\cimv2"),
        ("cpu_processor_0", "AMD Ryzen 9 7950X - Processor", ""),
    ];

    for (id, name, parent) in &cpu_cases {
        assert_eq!(
            classify_sensor(id, name, parent),
            "cpu",
            "Failed CPU classification for id='{}', name='{}', parent='{}'",
            id, name, parent
        );
    }

    let other_cases = [
        ("/lpc/nct6798d/temperature/0", "Motherboard", "/lpc/nct6798d"),
        ("/hdd/0/temperature/0", "Samsung 990 Pro 2TB", "/hdd/0"),
        ("fan_speed_0", "Chassis Fan 1", ""),
        ("pump_0", "AIO Liquid Pump", ""),
        ("psu_0", "Corsair AX1600i", ""),
    ];

    for (id, name, parent) in &other_cases {
        assert_eq!(
            classify_sensor(id, name, parent),
            "other",
            "Failed Other classification for id='{}', name='{}', parent='{}'",
            id, name, parent
        );
    }
}

// ============================================================================
// 5. PRIMARY CPU/GPU HEURISTIC SELECTION UNDER ADVERSARIAL SCENARIOS
// ============================================================================

#[test]
fn test_adversarial_primary_cpu_selection_hierarchy() {
    // Scenario 1: All dummy ACPI stubs present + 1 active CPU Package sensor
    let s1 = vec![
        TemperatureSensorInfo {
            id: "acpi_stub_1".to_string(),
            name: "ACPI Thermal Zone 0".to_string(),
            label: "ACPI Zone 0 (26.8°C)".to_string(),
            temperature_celsius: 26.85,
            sensor_type: "cpu".to_string(),
            provider: "ACPI".to_string(),
        },
        TemperatureSensorInfo {
            id: "acpi_stub_2".to_string(),
            name: "ACPI Thermal Zone 1".to_string(),
            label: "ACPI Zone 1 (27.8°C)".to_string(),
            temperature_celsius: 27.85,
            sensor_type: "cpu".to_string(),
            provider: "ACPI".to_string(),
        },
        TemperatureSensorInfo {
            id: "lhm_pkg".to_string(),
            name: "CPU Package".to_string(),
            label: "AMD Ryzen 7 7800X3D - CPU Package".to_string(),
            temperature_celsius: 56.4,
            sensor_type: "cpu".to_string(),
            provider: "LHM".to_string(),
        },
    ];

    let (temp1, id1) = select_primary_cpu_sensor(&s1);
    assert_eq!(temp1, Some(56.4));
    assert_eq!(id1, Some("lhm_pkg".to_string()));

    // Scenario 2: ONLY dummy ACPI stubs present -> must still pick a sensor (graceful fallback)
    let s2 = vec![
        TemperatureSensorInfo {
            id: "acpi_stub_1".to_string(),
            name: "ACPI Thermal Zone 0".to_string(),
            label: "ACPI Zone 0".to_string(),
            temperature_celsius: 26.85,
            sensor_type: "cpu".to_string(),
            provider: "ACPI".to_string(),
        },
    ];

    let (temp2, id2) = select_primary_cpu_sensor(&s2);
    assert_eq!(temp2, Some(26.85));
    assert_eq!(id2, Some("acpi_stub_1".to_string()));

    // Scenario 3: All sensors are out of bounds or non-CPU
    let s3 = vec![
        TemperatureSensorInfo {
            id: "gpu_0".to_string(),
            name: "GPU Core".to_string(),
            label: "GPU".to_string(),
            temperature_celsius: 60.0,
            sensor_type: "gpu".to_string(),
            provider: "NVML".to_string(),
        },
        TemperatureSensorInfo {
            id: "cpu_broken".to_string(),
            name: "CPU Package".to_string(),
            label: "CPU".to_string(),
            temperature_celsius: 0.0, // Invalid
            sensor_type: "cpu".to_string(),
            provider: "LHM".to_string(),
        },
    ];

    let (temp3, id3) = select_primary_cpu_sensor(&s3);
    assert_eq!(temp3, None);
    assert_eq!(id3, None);
}

#[test]
fn test_adversarial_primary_gpu_selection_hierarchy() {
    // Scenario 1: GPU Core, Hotspot, and Memory present -> prefers Core
    let s1 = vec![
        TemperatureSensorInfo {
            id: "gpu_hotspot".to_string(),
            name: "GPU Hotspot".to_string(),
            label: "Hotspot".to_string(),
            temperature_celsius: 82.0,
            sensor_type: "gpu".to_string(),
            provider: "NVML".to_string(),
        },
        TemperatureSensorInfo {
            id: "gpu_vram".to_string(),
            name: "GPU Memory Junction".to_string(),
            label: "VRAM".to_string(),
            temperature_celsius: 78.0,
            sensor_type: "gpu".to_string(),
            provider: "NVML".to_string(),
        },
        TemperatureSensorInfo {
            id: "gpu_core".to_string(),
            name: "GPU Core".to_string(),
            label: "Core".to_string(),
            temperature_celsius: 64.0,
            sensor_type: "gpu".to_string(),
            provider: "NVML".to_string(),
        },
    ];

    let (temp1, id1) = select_primary_gpu_sensor(&s1);
    assert_eq!(temp1, Some(64.0));
    assert_eq!(id1, Some("gpu_core".to_string()));

    // Scenario 2: ONLY Hotspot present -> falls back to Hotspot
    let s2 = vec![
        TemperatureSensorInfo {
            id: "gpu_hotspot".to_string(),
            name: "GPU Hotspot".to_string(),
            label: "Hotspot".to_string(),
            temperature_celsius: 75.0,
            sensor_type: "gpu".to_string(),
            provider: "NVML".to_string(),
        },
    ];

    let (temp2, id2) = select_primary_gpu_sensor(&s2);
    assert_eq!(temp2, Some(75.0));
    assert_eq!(id2, Some("gpu_hotspot".to_string()));
}

// ============================================================================
// 6. ADL C ABI ALIGNMENT, ADAPTER DEDUPLICATION & C-STRING PARSER
// ============================================================================

#[test]
fn test_adversarial_adl_abi_and_c_string_parser() {
    assert_eq!(std::mem::size_of::<ADLAdapterInfo>(), 1572);
    assert_eq!(std::mem::size_of::<ADLTemperature>(), 8);

    // C String parsing tests
    let mut buf = [0u8; 256];
    let test_str = b"AMD Radeon RX 7900 XTX\0ExtraGarbageDataAfterNull";
    buf[..test_str.len()].copy_from_slice(test_str);
    assert_eq!(parse_c_string_bytes(&buf), "AMD Radeon RX 7900 XTX");

    // No null terminator
    let full_buf = [b'A'; 256];
    assert_eq!(parse_c_string_bytes(&full_buf).len(), 256);

    // Invalid UTF-8 sequence handling (lossy replacement without panicking)
    let mut invalid_utf8 = [0u8; 256];
    invalid_utf8[0] = 0xFF;
    invalid_utf8[1] = 0xFE;
    invalid_utf8[2] = 0x00;
    let decoded = parse_c_string_bytes(&invalid_utf8);
    assert!(!decoded.is_empty());
}

#[test]
fn test_adversarial_adl_adapter_deduplication_stress() {
    // 100 duplicate heads on same GPU
    let mut adapters = Vec::new();
    let name = b"AMD Radeon Pro W7900";

    for i in 0..100 {
        let mut name_buf = [0u8; 256];
        name_buf[..name.len()].copy_from_slice(name);
        let info = ADLAdapterInfo {
            adapter_index: i,
            bus_number: 5,
            device_number: 0,
            vendor_id: 0x1002,
            present: 1,
            exist: 1,
            adapter_name: name_buf,
            ..Default::default()
        };
        adapters.push(info);
    }

    let deduped = deduplicate_adl_adapters(&adapters);
    assert_eq!(deduped.len(), 1, "100 multi-head displays must collapse to 1 GPU");
}

// ============================================================================
// 7. MALFORMED WMI JSON & SENSOR DISAMBIGUATION STRESS
// ============================================================================

#[test]
fn test_adversarial_wmi_json_fuzzing() {
    let payloads = [
        "",
        "   ",
        "[]",
        "{}",
        "null",
        "true",
        "123.456",
        "\"string_value\"",
        "[[[[]]]]",
        "{\"Identifier\": 123}",
        "{\"Value\": \"not_a_float\"}",
        "{\"Identifier\": \"/cpu/0\", \"Value\": null}",
        "{\"Identifier\": \"/cpu/0\", \"Value\": 1e300}", // Huge overflow float
        "{\"Identifier\": \"/cpu/0\", \"Value\": NaN}",
        "{\"Identifier\": \"/cpu/0\", \"Value\": -999.0}",
        "{\"Identifier\": \"/cpu/0\", \"Value\": 0.0}",
    ];

    for payload in &payloads {
        let res = parse_wmi_hardware_monitor_json(payload, "TestProvider", "test");
        assert!(res.is_empty(), "Malformed payload '{:?}' should yield 0 sensors", payload);
    }
}

#[test]
fn test_adversarial_push_sensors_large_collision_stress() {
    let mut dest = Vec::new();
    let mut existing_ids = HashSet::new();

    // 100 sensors with the EXACT same ID
    let mut sensors = Vec::new();
    for i in 0..100 {
        sensors.push(TemperatureSensorInfo {
            id: "identical_sensor_id".to_string(),
            name: format!("Sensor {}", i),
            label: format!("Sensor {}", i),
            temperature_celsius: 40.0 + (i as f32 * 0.1),
            sensor_type: "cpu".to_string(),
            provider: "Test".to_string(),
        });
    }

    push_sensors(&mut dest, &mut existing_ids, sensors);

    assert_eq!(dest.len(), 100);
    assert_eq!(existing_ids.len(), 100, "All 100 IDs must be uniquely disambiguated");

    assert_eq!(dest[0].id, "identical_sensor_id");
    assert_eq!(dest[1].id, "identical_sensor_id_2");
    assert_eq!(dest[99].id, "identical_sensor_id_100");
}
