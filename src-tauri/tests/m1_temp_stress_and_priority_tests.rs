use std::sync::{Arc, Barrier, Mutex};
use std::thread;
use std::time::Instant;
use wiscripts_windows_lib::metrics::{
    classify_sensor, collect_temperatures, deci_kelvin_to_celsius, deduplicate_adl_adapters,
    is_dummy_acpi_reading, is_valid_temperature, kelvin_to_celsius, milli_celsius_to_celsius,
    parse_c_string_bytes, parse_perf_thermal_zone_value, parse_wmi_hardware_monitor_json,
    push_sensors, query_adl_sensors, query_nvml_sensors, run_with_timeout,
    select_primary_cpu_sensor, select_primary_gpu_sensor, ADLAdapterInfo, MetricsCollector,
    TemperatureSensorInfo,
};

// Global test mutex simulating proper serialization guard
static SYNC_ADL_GUARD: Mutex<()> = Mutex::new(());

fn query_adl_sensors_synchronized() -> Vec<TemperatureSensorInfo> {
    let _lock = SYNC_ADL_GUARD.lock().unwrap();
    query_adl_sensors()
}

// ===========================================================================
// 1. Multi-GPU Adapter Deduplication & ADL Robustness Tests
// ===========================================================================

#[test]
fn test_multi_gpu_adapter_deduplication_quad_head() {
    let mut adapters = Vec::new();
    let gpu_name = b"AMD Radeon RX 7900 XTX";

    for i in 0..4 {
        let mut name_buf = [0u8; 256];
        name_buf[..gpu_name.len()].copy_from_slice(gpu_name);
        let info = ADLAdapterInfo {
            adapter_index: i,
            bus_number: 3,
            device_number: 0,
            function_number: i,
            vendor_id: 0x1002,
            present: 1,
            exist: 1,
            adapter_name: name_buf,
            ..Default::default()
        };
        adapters.push(info);
    }

    let deduped = deduplicate_adl_adapters(&adapters);
    assert_eq!(
        deduped.len(),
        1,
        "Quad-head single physical GPU must deduplicate to exactly 1 adapter"
    );
    assert_eq!(deduped[0].adapter_index, 0);
    assert_eq!(deduped[0].bus_number, 3);
    assert_eq!(deduped[0].device_number, 0);
}

#[test]
fn test_multi_gpu_adapter_deduplication_dual_discrete_and_integrated() {
    let mut adapters = Vec::new();

    // GPU 1: 3 outputs
    for i in 0..3 {
        let mut name_buf = [0u8; 256];
        let name = b"AMD Radeon RX 7900 XTX";
        name_buf[..name.len()].copy_from_slice(name);
        let info = ADLAdapterInfo {
            adapter_index: i,
            bus_number: 3,
            device_number: 0,
            vendor_id: 0x1002,
            present: 1,
            exist: 1,
            adapter_name: name_buf,
            ..Default::default()
        };
        adapters.push(info);
    }

    // GPU 2: 2 outputs
    for i in 3..5 {
        let mut name_buf = [0u8; 256];
        let name = b"AMD Radeon RX 6600";
        name_buf[..name.len()].copy_from_slice(name);
        let info = ADLAdapterInfo {
            adapter_index: i,
            bus_number: 7,
            device_number: 0,
            vendor_id: 0x1002,
            present: 1,
            exist: 1,
            adapter_name: name_buf,
            ..Default::default()
        };
        adapters.push(info);
    }

    // GPU 3: Integrated 780M
    {
        let mut name_buf = [0u8; 256];
        let name = b"AMD Radeon 780M Graphics";
        name_buf[..name.len()].copy_from_slice(name);
        let info = ADLAdapterInfo {
            adapter_index: 5,
            bus_number: 15,
            device_number: 0,
            vendor_id: 0x1002,
            present: 1,
            exist: 1,
            adapter_name: name_buf,
            ..Default::default()
        };
        adapters.push(info);
    }

    // Inactive ghost GPU
    {
        let info = ADLAdapterInfo {
            adapter_index: 6,
            bus_number: 9,
            device_number: 0,
            vendor_id: 0x1002,
            present: 0,
            exist: 0,
            ..Default::default()
        };
        adapters.push(info);
    }

    // Foreign vendor GPU
    {
        let mut name_buf = [0u8; 256];
        let name = b"NVIDIA GeForce RTX 4080";
        name_buf[..name.len()].copy_from_slice(name);
        let info = ADLAdapterInfo {
            adapter_index: 7,
            bus_number: 1,
            device_number: 0,
            vendor_id: 0x10DE, // NVIDIA
            present: 1,
            exist: 1,
            adapter_name: name_buf,
            ..Default::default()
        };
        adapters.push(info);
    }

    let deduped = deduplicate_adl_adapters(&adapters);
    assert_eq!(
        deduped.len(),
        3,
        "Must deduplicate to exactly 3 physical AMD GPUs (2 discrete + 1 iGPU)"
    );

    assert_eq!(deduped[0].bus_number, 3);
    assert_eq!(parse_c_string_bytes(&deduped[0].adapter_name), "AMD Radeon RX 7900 XTX");

    assert_eq!(deduped[1].bus_number, 7);
    assert_eq!(parse_c_string_bytes(&deduped[1].adapter_name), "AMD Radeon RX 6600");

    assert_eq!(deduped[2].bus_number, 15);
    assert_eq!(parse_c_string_bytes(&deduped[2].adapter_name), "AMD Radeon 780M Graphics");
}

#[test]
fn test_adl_adapter_fallback_on_unspecified_bus_number() {
    let mut a1_name = [0u8; 256];
    let name = b"AMD Virtual GPU 0";
    a1_name[..name.len()].copy_from_slice(name);
    let a1 = ADLAdapterInfo {
        adapter_index: 0,
        bus_number: -1,
        device_number: -1,
        vendor_id: 0x1002,
        present: 1,
        exist: 1,
        adapter_name: a1_name,
        ..Default::default()
    };

    let mut a2_name = [0u8; 256];
    let name2 = b"AMD Virtual GPU 1";
    a2_name[..name2.len()].copy_from_slice(name2);
    let a2 = ADLAdapterInfo {
        adapter_index: 1,
        bus_number: -1,
        device_number: -1,
        vendor_id: 0x1002,
        present: 1,
        exist: 1,
        adapter_name: a2_name,
        ..Default::default()
    };

    let deduped = deduplicate_adl_adapters(&[a1, a2]);
    assert_eq!(
        deduped.len(),
        2,
        "Unspecified bus numbers must fallback to distinct adapter_index keys"
    );
}

#[test]
fn test_adl_large_topology_stress_deduplication() {
    let mut adapters = Vec::new();
    for card_idx in 0..8 {
        for head_idx in 0..8 {
            let mut name_buf = [0u8; 256];
            let name = format!("AMD Radeon Pro W7900 #{}", card_idx);
            let bytes = name.as_bytes();
            name_buf[..bytes.len()].copy_from_slice(bytes);
            let info = ADLAdapterInfo {
                adapter_index: card_idx * 8 + head_idx,
                bus_number: card_idx + 1,
                device_number: 0,
                function_number: head_idx,
                vendor_id: 0x1002,
                present: 1,
                exist: 1,
                adapter_name: name_buf,
                ..Default::default()
            };
            adapters.push(info);
        }
    }

    assert_eq!(adapters.len(), 64);
    let deduped = deduplicate_adl_adapters(&adapters);
    assert_eq!(
        deduped.len(),
        8,
        "64 virtual heads across 8 physical cards must deduplicate to exactly 8 adapters"
    );
}

// ===========================================================================
// 2. Sensor Priority Ordering & ACPI Stub Filtering Tests
// ===========================================================================

#[test]
fn test_multi_tier_sensor_priority_ordering() {
    let sensors = vec![
        TemperatureSensorInfo {
            id: "acpi_thermal_zone_0".to_string(),
            name: "ACPI Thermal Zone 0".to_string(),
            label: "ACPI Thermal Zone 0 (26.8°C)".to_string(),
            temperature_celsius: 26.85,
            sensor_type: "cpu".to_string(),
            provider: "ACPI Thermal Zone".to_string(),
        },
        TemperatureSensorInfo {
            id: "perf_thermal_zone_0".to_string(),
            name: "Thermal Zone _TZ.THM0".to_string(),
            label: "ACPI PerfZone - _TZ.THM0 (52.0°C)".to_string(),
            temperature_celsius: 52.0,
            sensor_type: "cpu".to_string(),
            provider: "Thermal Zone (root\\cimv2)".to_string(),
        },
        TemperatureSensorInfo {
            id: "lhm_amdcpu_0_temperature_pkg".to_string(),
            name: "CPU Package".to_string(),
            label: "AMD Ryzen 7 7800X3D - CPU Package".to_string(),
            temperature_celsius: 58.4,
            sensor_type: "cpu".to_string(),
            provider: "LibreHardwareMonitor WMI".to_string(),
        },
        TemperatureSensorInfo {
            id: "nvml_gpu_0".to_string(),
            name: "NVIDIA GeForce RTX 4080".to_string(),
            label: "NVIDIA GeForce RTX 4080 (Core)".to_string(),
            temperature_celsius: 61.5,
            sensor_type: "gpu".to_string(),
            provider: "NVML DLL".to_string(),
        },
        TemperatureSensorInfo {
            id: "lhm_gpu-nvidia_0_temperature_1".to_string(),
            name: "GPU Hotspot".to_string(),
            label: "NVIDIA GeForce RTX 4080 - GPU Hotspot".to_string(),
            temperature_celsius: 74.2,
            sensor_type: "gpu".to_string(),
            provider: "LibreHardwareMonitor WMI".to_string(),
        },
    ];

    let (cpu_temp, cpu_id) = select_primary_cpu_sensor(&sensors);
    assert_eq!(cpu_temp, Some(58.4));
    assert_eq!(cpu_id, Some("lhm_amdcpu_0_temperature_pkg".to_string()));

    let (gpu_temp, gpu_id) = select_primary_gpu_sensor(&sensors);
    assert_eq!(gpu_temp, Some(61.5));
    assert_eq!(gpu_id, Some("nvml_gpu_0".to_string()));
}

#[test]
fn test_primary_cpu_sensor_prefers_active_acpi_over_dummy_stub() {
    let sensors = vec![
        TemperatureSensorInfo {
            id: "acpi_stub_1".to_string(),
            name: "ACPI Thermal Zone 0".to_string(),
            label: "ACPI Thermal Zone 0 (27.8°C)".to_string(),
            temperature_celsius: 27.85,
            sensor_type: "cpu".to_string(),
            provider: "ACPI Thermal Zone".to_string(),
        },
        TemperatureSensorInfo {
            id: "acpi_active_1".to_string(),
            name: "ACPI Thermal Zone 1".to_string(),
            label: "ACPI Thermal Zone 1 (49.5°C)".to_string(),
            temperature_celsius: 49.5,
            sensor_type: "cpu".to_string(),
            provider: "ACPI Thermal Zone".to_string(),
        },
    ];

    let (temp, id) = select_primary_cpu_sensor(&sensors);
    assert_eq!(temp, Some(49.5));
    assert_eq!(id, Some("acpi_active_1".to_string()));
}

#[test]
fn test_sensor_classification_comprehensive_matrix() {
    let test_cases = vec![
        ("/amdcpu/0/temperature/0", "CPU Core #1", "/amdcpu/0", "cpu"),
        ("/amdcpu/0/temperature/1", "CPU Package", "/amdcpu/0", "cpu"),
        ("/amdcpu/0/temperature/2", "Core Max", "/amdcpu/0", "cpu"),
        ("/amdcpu/0/temperature/3", "Tctl/Tdie", "/amdcpu/0", "cpu"),
        ("/amdcpu/0/temperature/4", "CCD1 Temperature", "/amdcpu/0", "cpu"),
        ("/intelcpu/0/temperature/0", "IA Cores", "/intelcpu/0", "cpu"),
        ("/intelcpu/0/temperature/pkg", "CPU Package", "/intelcpu/0", "cpu"),
        ("acpi_thermal_zone_0", "Thermal Zone 0", "", "cpu"),
        ("perf_thermal_zone_0", "Thermal Zone _TZ.CPU0", "", "cpu"),
        ("/gpu-nvidia/0/temperature/0", "GPU Core", "/gpu-nvidia/0", "gpu"),
        ("/gpu-nvidia/0/temperature/1", "GPU Hotspot", "/gpu-nvidia/0", "gpu"),
        ("/gpu-nvidia/0/temperature/2", "GPU Memory Junction", "/gpu-nvidia/0", "gpu"),
        ("/atigpu/0/temperature/0", "GPU Edge", "/atigpu/0", "gpu"),
        ("/atigpu/0/temperature/1", "GPU Hotspot", "/atigpu/0", "gpu"),
        ("adl_gpu_0", "AMD Radeon RX 7900 XTX", "", "gpu"),
        ("nvml_gpu_0", "NVIDIA GeForce RTX 4090", "", "gpu"),
        ("nvidia_smi_gpu_0", "NVIDIA RTX A6000", "", "gpu"),
        ("amd_smi_gpu_0", "AMD Radeon PRO W7800", "", "gpu"),
        ("/intelgpu/0/temperature/0", "Intel Iris Xe Graphics", "/intelgpu/0", "gpu"),
        ("/intelgpu/1/temperature/0", "Intel Arc A770", "/intelgpu/1", "gpu"),
        ("/lpc/nct6798d/temperature/0", "Motherboard", "/lpc/nct6798d", "other"),
        ("/hdd/0/temperature/0", "Samsung SSD 990 PRO 2TB", "/hdd/0", "other"),
        ("fan_0", "Chassis Fan Speed", "", "other"),
    ];

    for (id, name, parent, expected) in test_cases {
        let result = classify_sensor(id, name, parent);
        assert_eq!(
            result, expected,
            "Classification mismatch for id='{}', name='{}', parent='{}'. Expected '{}', got '{}'",
            id, name, parent, expected, result
        );
    }
}

// ===========================================================================
// 3. Conversions & Physical Boundary Value Analysis
// ===========================================================================

#[test]
fn test_conversion_and_bounds_matrix() {
    assert_eq!(deci_kelvin_to_celsius(2732.0), 0.0);
    assert!((deci_kelvin_to_celsius(2950.0) - 21.8).abs() < 0.01);
    assert!((deci_kelvin_to_celsius(3000.0) - 26.8).abs() < 0.01);
    assert!((deci_kelvin_to_celsius(3010.0) - 27.8).abs() < 0.01);
    assert_eq!(deci_kelvin_to_celsius(3432.0), 70.0);
    assert_eq!(deci_kelvin_to_celsius(3732.0), 100.0);

    assert!((kelvin_to_celsius(273.15) - 0.0).abs() < 0.01);
    assert!((kelvin_to_celsius(300.0) - 26.85).abs() < 0.01);
    assert!((kelvin_to_celsius(350.0) - 76.85).abs() < 0.01);

    assert_eq!(milli_celsius_to_celsius(0), 0.0);
    assert_eq!(milli_celsius_to_celsius(42500), 42.5);
    assert_eq!(milli_celsius_to_celsius(105000), 105.0);

    assert!((parse_perf_thermal_zone_value(3200.0).unwrap() - 46.8).abs() < 0.01);
    assert!((parse_perf_thermal_zone_value(315.0).unwrap() - 41.85).abs() < 0.01);
    assert_eq!(parse_perf_thermal_zone_value(55.5), Some(55.5));

    assert_eq!(parse_perf_thermal_zone_value(0.0), None);
    assert_eq!(parse_perf_thermal_zone_value(4.0), None);
    assert_eq!(parse_perf_thermal_zone_value(125.0), None);
    assert_eq!(parse_perf_thermal_zone_value(1500.0), None);
    assert_eq!(parse_perf_thermal_zone_value(5000.0), None);

    assert!(!is_valid_temperature(f32::NAN));
    assert!(!is_valid_temperature(f32::INFINITY));
    assert!(!is_valid_temperature(f32::NEG_INFINITY));
    assert!(!is_valid_temperature(-10.0));
    assert!(!is_valid_temperature(0.0));
    assert!(!is_valid_temperature(5.0));
    assert!(is_valid_temperature(5.1));
    assert!(is_valid_temperature(117.9));
    assert!(!is_valid_temperature(118.0));
    assert!(!is_valid_temperature(150.0));
}

#[test]
fn test_dummy_acpi_reading_narrow_margins() {
    assert!(is_dummy_acpi_reading(26.7));
    assert!(is_dummy_acpi_reading(26.85));
    assert!(is_dummy_acpi_reading(27.05));

    assert!(is_dummy_acpi_reading(27.7));
    assert!(is_dummy_acpi_reading(27.85));
    assert!(is_dummy_acpi_reading(28.05));

    assert!(!is_dummy_acpi_reading(25.0));
    assert!(!is_dummy_acpi_reading(26.5));
    assert!(!is_dummy_acpi_reading(27.3));
    assert!(!is_dummy_acpi_reading(28.2));
    assert!(!is_dummy_acpi_reading(35.0));
    assert!(!is_dummy_acpi_reading(55.0));
}

// ===========================================================================
// 4. JSON Parser Resilience & Adversarial Inputs
// ===========================================================================

#[test]
fn test_wmi_json_parser_adversarial_inputs() {
    assert!(parse_wmi_hardware_monitor_json("{", "test", "t").is_empty());
    assert!(parse_wmi_hardware_monitor_json("[{", "test", "t").is_empty());
    assert!(parse_wmi_hardware_monitor_json("{\"Identifier\":", "test", "t").is_empty());
    assert!(parse_wmi_hardware_monitor_json("null", "test", "t").is_empty());
    assert!(parse_wmi_hardware_monitor_json("12345", "test", "t").is_empty());
    assert!(parse_wmi_hardware_monitor_json("\"string\"", "test", "t").is_empty());

    let dirty_json = r#"[
        {"Identifier": null, "Name": null, "Parent": null, "Value": 45.0},
        {"Identifier": 123, "Name": true, "Parent": [], "Value": "invalid_number"},
        {"Identifier": "/valid/sensor/1", "Name": "CPU Die", "Parent": "/cpu/0", "Value": 65.5},
        {"Identifier": "/invalid/temp/1", "Name": "Broken Temp", "Parent": "", "Value": 0.0},
        {"Identifier": "/invalid/temp/2", "Name": "Overflow Temp", "Parent": "", "Value": 999.0}
    ]"#;

    let parsed = parse_wmi_hardware_monitor_json(dirty_json, "DirtyProvider", "dirty");
    assert_eq!(parsed.len(), 2);

    assert_eq!(parsed[0].temperature_celsius, 45.0);
    assert_eq!(parsed[0].name, "Temperature Sensor");
    assert_eq!(parsed[0].sensor_type, "other");

    assert_eq!(parsed[1].temperature_celsius, 65.5);
    assert_eq!(parsed[1].name, "CPU Die");
    assert_eq!(parsed[1].sensor_type, "cpu");
    assert_eq!(parsed[1].id, "dirty_valid_sensor_1");
}

#[test]
fn test_push_sensors_id_collision_resolution() {
    let mut dest = Vec::new();
    let mut ids = std::collections::HashSet::new();

    let sensors = vec![
        TemperatureSensorInfo {
            id: "sensor_same".to_string(),
            name: "Sensor 1".to_string(),
            label: "Label 1".to_string(),
            temperature_celsius: 40.0,
            sensor_type: "cpu".to_string(),
            provider: "P1".to_string(),
        },
        TemperatureSensorInfo {
            id: "sensor_same".to_string(),
            name: "Sensor 2".to_string(),
            label: "Label 2".to_string(),
            temperature_celsius: 41.0,
            sensor_type: "cpu".to_string(),
            provider: "P2".to_string(),
        },
        TemperatureSensorInfo {
            id: "sensor_same".to_string(),
            name: "Sensor 3".to_string(),
            label: "Label 3".to_string(),
            temperature_celsius: 42.0,
            sensor_type: "cpu".to_string(),
            provider: "P3".to_string(),
        },
    ];

    push_sensors(&mut dest, &mut ids, sensors);

    assert_eq!(dest.len(), 3);
    assert_eq!(dest[0].id, "sensor_same");
    assert_eq!(dest[1].id, "sensor_same_2");
    assert_eq!(dest[2].id, "sensor_same_3");
}

// ===========================================================================
// 5. Stress Testing: Rapid Polling, Concurrency & Latency
// ===========================================================================

#[test]
fn test_collect_temperatures_and_metrics_latency_benchmark() {
    let start = Instant::now();
    let temp_res = collect_temperatures();
    let elapsed_temp = start.elapsed();

    assert!(temp_res.is_ok(), "collect_temperatures must not fail");
    let payload = temp_res.unwrap();
    assert!(!payload.sensor_source.is_empty());

    assert!(
        elapsed_temp < std::time::Duration::from_secs(4),
        "Temperature collection took too long: {:?}",
        elapsed_temp
    );

    let mut collector = MetricsCollector::new();
    let start_metrics = Instant::now();
    let metrics_res = collector.collect();
    let elapsed_metrics = start_metrics.elapsed();

    assert!(metrics_res.is_ok(), "MetricsCollector::collect must succeed");
    let m = metrics_res.unwrap();
    assert!(m.memory_total_mb > 0);
    assert!(
        elapsed_metrics < std::time::Duration::from_millis(500),
        "Metrics collection took too long: {:?}",
        elapsed_metrics
    );
}

#[test]
fn test_rapid_fire_metrics_and_temperatures_stress_loop() {
    let mut collector = MetricsCollector::new();

    let mut prev_ts = 0;
    for i in 0..25 {
        let metrics = collector.collect().expect("Collection in loop failed");
        assert!(
            metrics.timestamp_ms >= prev_ts,
            "Timestamp must be monotonic (prev: {}, curr: {})",
            prev_ts,
            metrics.timestamp_ms
        );
        prev_ts = metrics.timestamp_ms;

        assert!(metrics.cpu_usage_percent >= 0.0 && metrics.cpu_usage_percent <= 100.0);
        assert!(metrics.memory_usage_percent >= 0.0 && metrics.memory_usage_percent <= 100.0);

        if i % 5 == 0 {
            let temps = collect_temperatures().expect("collect_temperatures in loop failed");
            if let Some(t) = temps.cpu_temp_celsius {
                assert!(is_valid_temperature(t));
            }
            if let Some(t) = temps.gpu_temp_celsius {
                assert!(is_valid_temperature(t));
            }
        }
    }
}

#[test]
fn test_concurrent_nvml_query() {
    let barrier = Arc::new(Barrier::new(4));
    let mut handles = Vec::new();
    for _ in 0..4 {
        let b = Arc::clone(&barrier);
        handles.push(thread::spawn(move || {
            b.wait();
            for _ in 0..5 {
                let _ = query_nvml_sensors();
            }
        }));
    }
    for h in handles {
        h.join().unwrap();
    }
}

#[test]
fn test_concurrent_adl_query_synchronized() {
    let barrier = Arc::new(Barrier::new(4));
    let mut handles = Vec::new();
    for _ in 0..4 {
        let b = Arc::clone(&barrier);
        handles.push(thread::spawn(move || {
            b.wait();
            for _ in 0..5 {
                let _ = query_adl_sensors_synchronized();
            }
        }));
    }
    for h in handles {
        h.join().unwrap();
    }
}

#[test]
fn test_concurrent_metrics_collector() {
    let barrier = Arc::new(Barrier::new(4));
    let mut handles = Vec::new();
    for _ in 0..4 {
        let b = Arc::clone(&barrier);
        handles.push(thread::spawn(move || {
            b.wait();
            let mut collector = MetricsCollector::new();
            for _ in 0..5 {
                let _ = collector.collect();
            }
        }));
    }
    for h in handles {
        h.join().unwrap();
    }
}

#[test]
fn test_run_with_timeout_cancellation_under_load() {
    let mut handles = Vec::new();
    for _ in 0..10 {
        let handle = thread::spawn(|| {
            let res = run_with_timeout(std::time::Duration::from_millis(50), || {
                std::thread::sleep(std::time::Duration::from_millis(200));
                Some(42)
            });
            assert_eq!(res, None);
        });
        handles.push(handle);
    }

    for handle in handles {
        handle.join().unwrap();
    }
}
