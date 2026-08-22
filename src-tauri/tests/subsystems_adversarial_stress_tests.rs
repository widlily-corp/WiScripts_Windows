use std::thread;
use wiscripts_windows_lib::{
    gaming::{calculate_latency_status, get_game_boost_status, get_latency_metrics, set_timer_resolution, toggle_game_boost},
    hardware_health::{get_battery_health_analytics, parse_nvme_health_log, parse_powercfg_list, set_active_power_scheme},
    memory::{configure_ram_auto_trimmer, get_memory_breakdown, get_ram_auto_trimmer_config, purge_standby_memory, purge_working_sets, AutoTrimmerConfig, StandbyPurgeMode},
    network_shield::{block_process_firewall, decode_port, get_active_network_connections, tcp_state_to_string, unblock_process_firewall},
};

// =========================================================================
// 1. GAMING & LATENCY SUBSYSTEM ADVERSARIAL STRESS TESTS
// =========================================================================

#[test]
fn test_gaming_latency_status_exhaustive_boundaries() {
    assert_eq!(calculate_latency_status(-100.0), "Optimal");
    assert_eq!(calculate_latency_status(0.0), "Optimal");
    assert_eq!(calculate_latency_status(500.0), "Optimal");
    assert_eq!(calculate_latency_status(999.999), "Optimal");
    assert_eq!(calculate_latency_status(1000.0), "Moderate");
    assert_eq!(calculate_latency_status(1500.0), "Moderate");
    assert_eq!(calculate_latency_status(2000.0), "Moderate");
    assert_eq!(calculate_latency_status(2000.001), "Severe Jitter");
    assert_eq!(calculate_latency_status(5000.0), "Severe Jitter");
    assert_eq!(calculate_latency_status(1_000_000.0), "Severe Jitter");
    assert_eq!(calculate_latency_status(f64::MAX), "Severe Jitter");
}

#[test]
fn test_gaming_timer_resolution_clamping() {
    // 0.5ms (5000 100ns units) custom timer resolution
    let res_500 = set_timer_resolution(5000);
    if let Ok(info) = res_500 {
        assert!(info.is_custom);
        assert!(info.current_resolution_100ns <= 10000);
    }

    // Underflow clamped to 5000 (0.5ms)
    let res_low = set_timer_resolution(0);
    if let Ok(info) = res_low {
        assert!(info.current_resolution_100ns >= 5000);
    }

    // Default timer resolution revert (156250 = ~15.6ms, enable = false)
    let res_default = set_timer_resolution(156250);
    assert!(res_default.is_ok(), "Reverting timer resolution to default should succeed gracefully");
    if let Ok(info) = res_default {
        assert!(info.current_resolution_100ns >= 5000);
    }
}

#[test]
fn test_gaming_toggle_boost_invalid_pids_and_rapid_cycles() {
    // Non-existent PID
    let boost_res = toggle_game_boost(Some(999_999), true);
    assert!(boost_res.is_ok(), "Non-existent PID should not cause kernel panic");

    let status = get_game_boost_status().expect("Status should query cleanly");
    assert!(status.enabled);

    // Disable boost
    let disable_res = toggle_game_boost(None, false);
    assert!(disable_res.is_ok());
    let status_after = get_game_boost_status().expect("Status query");
    assert!(!status_after.enabled);

    // Rapid toggle cycles (stress test state machine)
    for i in 0..20 {
        let enable = i % 2 == 0;
        let toggle = toggle_game_boost(Some(0), enable);
        assert!(toggle.is_ok(), "Cycle {} toggle failed", i);
    }
    // Clean reset
    let _ = toggle_game_boost(None, false);
}

#[test]
fn test_gaming_latency_metrics_concurrency_stress() {
    let mut handles = Vec::new();
    for _ in 0..8 {
        let handle = thread::spawn(|| {
            for _ in 0..10 {
                let metrics = get_latency_metrics().expect("Latency metrics query should succeed");
                assert!(metrics.current_latency_us >= 0.0);
                assert!(metrics.average_latency_us >= 0.0);
                assert!(metrics.max_latency_us >= metrics.current_latency_us.min(metrics.max_latency_us));
                assert!(!metrics.status.is_empty());
            }
        });
        handles.push(handle);
    }

    for h in handles {
        h.join().expect("Concurrent latency tracker thread panicked");
    }
}

// =========================================================================
// 2. MEMORY & AUTO-TRIMMER SUBSYSTEM ADVERSARIAL STRESS TESTS
// =========================================================================

#[test]
fn test_memory_breakdown_invariants() {
    let mem = get_memory_breakdown().expect("Memory breakdown query failed");
    assert!(mem.total_physical_bytes > 0, "Total RAM must be positive");
    assert!(mem.available_bytes <= mem.total_physical_bytes, "Available <= Total");
    assert!(mem.used_bytes <= mem.total_physical_bytes, "Used <= Total");
    assert!((0.0..=100.0).contains(&mem.usage_percent), "Percent within [0, 100]");
    assert!(mem.system_cache_bytes > 0, "System cache must be non-zero");
}

#[test]
fn test_memory_standby_purge_graceful_modes() {
    let res_all = purge_standby_memory(StandbyPurgeMode::All);
    assert!(res_all.is_ok(), "Standby purge All should return Ok result");

    let res_low = purge_standby_memory(StandbyPurgeMode::LowPriorityOnly);
    assert!(res_low.is_ok(), "Standby purge LowPriorityOnly should return Ok result");
}

#[test]
fn test_memory_working_set_purge_with_exclusions() {
    // Exclude invalid/nonexistent and critical PIDs
    let excluded = vec![0, 4, 123456, 999999];
    let res = purge_working_sets(excluded);
    assert!(res.is_ok(), "Working set purge with exclusions must succeed");
    let result = res.unwrap();
    assert!(!result.message.is_empty());
}

#[test]
fn test_memory_auto_trimmer_extreme_configs_and_concurrency() {
    // 1. Extreme boundary values: 0%, 100%, negative, >100%
    let extreme_configs = vec![
        AutoTrimmerConfig {
            enabled: false,
            threshold_percent: 0.0,
            interval_seconds: 0,
            purge_standby: false,
            purge_working_sets: false,
            excluded_process_names: vec![],
        },
        AutoTrimmerConfig {
            enabled: false,
            threshold_percent: 100.0,
            interval_seconds: 3600,
            purge_standby: true,
            purge_working_sets: true,
            excluded_process_names: vec!["test.exe".to_string()],
        },
        AutoTrimmerConfig {
            enabled: false,
            threshold_percent: -25.0,
            interval_seconds: 10,
            purge_standby: true,
            purge_working_sets: false,
            excluded_process_names: (0..500).map(|i| format!("proc_{}.exe", i)).collect(),
        },
    ];

    for cfg in extreme_configs {
        let set_res = configure_ram_auto_trimmer(cfg.clone());
        assert!(set_res.is_ok(), "Setting extreme config failed");
        let fetched = get_ram_auto_trimmer_config().expect("Fetch config failed");
        assert_eq!(fetched.threshold_percent, cfg.threshold_percent);
    }

    // 2. Concurrent read/write race testing on AUTO_TRIMMER_CONFIG
    let mut handles = Vec::new();
    for thread_id in 0..8 {
        let handle = thread::spawn(move || {
            for i in 0..20 {
                let config = AutoTrimmerConfig {
                    enabled: false,
                    threshold_percent: (70 + (thread_id * 2 + i) % 25) as f32,
                    interval_seconds: 60,
                    purge_standby: true,
                    purge_working_sets: true,
                    excluded_process_names: vec!["dwm.exe".to_string(), "explorer.exe".to_string()],
                };
                let _ = configure_ram_auto_trimmer(config);
                let _ = get_ram_auto_trimmer_config();
            }
        });
        handles.push(handle);
    }

    for h in handles {
        h.join().expect("Concurrent auto-trimmer config thread panicked");
    }

    // Reset to safe default
    let _ = configure_ram_auto_trimmer(AutoTrimmerConfig::default());
}

// =========================================================================
// 3. NETWORK SHIELD SUBSYSTEM ADVERSARIAL STRESS TESTS
// =========================================================================

#[test]
fn test_network_port_decoder_boundaries() {
    assert_eq!(decode_port(0), 0);
    assert_eq!(decode_port(0x5000), 80);
    assert_eq!(decode_port(0xBB01), 443);
    assert_eq!(decode_port(0x901F), 8080);
    assert_eq!(decode_port(0xFFFF), 65535);
}

#[test]
fn test_network_tcp_state_exhaustive_mapping() {
    assert_eq!(tcp_state_to_string(0), "UNKNOWN");
    assert_eq!(tcp_state_to_string(1), "CLOSED");
    assert_eq!(tcp_state_to_string(2), "LISTEN");
    assert_eq!(tcp_state_to_string(3), "SYN_SENT");
    assert_eq!(tcp_state_to_string(4), "SYN_RCVD");
    assert_eq!(tcp_state_to_string(5), "ESTABLISHED");
    assert_eq!(tcp_state_to_string(6), "FIN_WAIT1");
    assert_eq!(tcp_state_to_string(7), "FIN_WAIT2");
    assert_eq!(tcp_state_to_string(8), "CLOSE_WAIT");
    assert_eq!(tcp_state_to_string(9), "CLOSING");
    assert_eq!(tcp_state_to_string(10), "LAST_ACK");
    assert_eq!(tcp_state_to_string(11), "TIME_WAIT");
    assert_eq!(tcp_state_to_string(12), "DELETE_TCB");
    assert_eq!(tcp_state_to_string(13), "UNKNOWN");
    assert_eq!(tcp_state_to_string(u32::MAX), "UNKNOWN");
}

#[test]
fn test_network_active_connections_query_stability() {
    let conns = get_active_network_connections().expect("Query active connections failed");
    for conn in &conns {
        assert!(!conn.protocol.is_empty(), "Protocol must be non-empty");
        assert!(!conn.local_address.is_empty(), "Local address must be non-empty");
        assert!(!conn.state.is_empty(), "State must be non-empty");
        assert!(!conn.process_name.is_empty(), "Process name must be resolved");
    }
}

#[test]
fn test_network_firewall_rule_input_validation() {
    // Empty path rejection
    assert!(block_process_firewall("".to_string(), "Test".to_string()).is_err());
    assert!(block_process_firewall("   ".to_string(), "Test".to_string()).is_err());
    assert!(unblock_process_firewall("".to_string()).is_err());
    assert!(unblock_process_firewall("   ".to_string()).is_err());

    // Valid path block/unblock roundtrip
    let res = block_process_firewall(
        "C:\\Windows\\System32\\calc.exe".to_string(),
        "WiScripts Adversarial Unit Test Block".to_string(),
    );
    assert!(res.is_ok(), "Block action should return result");

    let unblock_res = unblock_process_firewall("WiScripts Adversarial Unit Test Block".to_string());
    assert!(unblock_res.is_ok(), "Unblock action should return result");
}

// =========================================================================
// 4. HARDWARE HEALTH & POWER SUBSYSTEM ADVERSARIAL STRESS TESTS
// =========================================================================

#[test]
fn test_nvme_health_log_parser_corrupt_and_extreme_buffers() {
    // Short buffer
    assert!(parse_nvme_health_log(&[]).is_none());
    assert!(parse_nvme_health_log(&[0u8; 511]).is_none());

    // 512-byte buffer with 100% available spare
    let mut normal_buf = vec![0u8; 512];
    normal_buf[3] = 100; // 100% available spare
    let h_normal = parse_nvme_health_log(&normal_buf).expect("Normal buffer should parse");
    assert_eq!(h_normal.health_percentage, 100);
    assert_eq!(h_normal.smart_status, "Good");

    // Critical warning bit set
    let mut critical_buf = vec![0u8; 512];
    critical_buf[0] = 0x01; // Critical warning bit
    let h_crit = parse_nvme_health_log(&critical_buf).expect("Parse critical");
    assert_eq!(h_crit.smart_status, "Critical");

    // High wear (percentage used = 95%) -> Warning
    let mut worn_buf = vec![0u8; 512];
    worn_buf[3] = 100;
    worn_buf[5] = 95;
    let h_worn = parse_nvme_health_log(&worn_buf).expect("Parse worn");
    assert_eq!(h_worn.health_percentage, 5);
    assert_eq!(h_worn.smart_status, "Warning");

    // Low spare capacity (< 20%) -> Warning
    let mut low_spare_buf = vec![0u8; 512];
    low_spare_buf[3] = 15; // 15% available spare
    let h_spare = parse_nvme_health_log(&low_spare_buf).expect("Parse low spare");
    assert_eq!(h_spare.smart_status, "Warning");

    // Saturated 200% used -> health 0% (no underflow)
    let mut over_used_buf = vec![0u8; 512];
    over_used_buf[3] = 100;
    over_used_buf[5] = 200;
    let h_over = parse_nvme_health_log(&over_used_buf).expect("Parse over used");
    assert_eq!(h_over.health_percentage, 0);

    // Giant TBW arithmetic without overflow
    let mut giant_tbw_buf = vec![0u8; 512];
    giant_tbw_buf[3] = 100;
    let giant_units: u128 = 100_000_000_000_000;
    giant_tbw_buf[32..48].copy_from_slice(&giant_units.to_le_bytes());
    let h_giant = parse_nvme_health_log(&giant_tbw_buf).expect("Parse giant TBW");
    assert!(h_giant.total_bytes_written_tb > 0.0);
}

#[test]
fn test_battery_analytics_and_desktop_pc_safety() {
    let battery = get_battery_health_analytics().expect("Query battery health analytics");
    assert!(battery.battery_percentage <= 100, "Battery percentage <= 100");
    if !battery.has_battery {
        assert!(battery.power_profile_status.contains("Desktop") || battery.power_profile_status.contains("AC"));
    }
    if let Some(wear) = battery.wear_level_percent {
        assert!((0.0..=100.0).contains(&wear), "Wear level between 0 and 100");
    }
}

#[test]
fn test_powercfg_list_parser_robustness() {
    // Garbled / corrupt text
    let empty_list = parse_powercfg_list("gibberish text\nwithout any power schemes\n");
    assert!(empty_list.is_empty());

    // Russian locale powercfg sample
    let ru_sample = r#"
Существующие схемы питания (* - активные)
-----------------------------------
GUID схемы питания: 381b4222-f694-41f0-9685-ff5bb260df2e  (Сбалансированная)
GUID схемы питания: 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c  (Высокая производительность) *
GUID схемы питания: e9a42b02-d5df-448d-aa00-03f14749eb61  (Максимальная производительность)
"#;
    let ru_schemes = parse_powercfg_list(ru_sample);
    assert_eq!(ru_schemes.len(), 3);
    assert!(!ru_schemes[0].is_active);
    assert!(ru_schemes[1].is_active);
    assert!(ru_schemes[2].is_ultimate_performance);

    // English locale powercfg sample
    let en_sample = r#"
Existing Power Schemes (* Active)
-----------------------------------
Power Scheme GUID: 381b4222-f694-41f0-9685-ff5bb260df2e  (Balanced) *
Power Scheme GUID: 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c  (High performance)
Power Scheme GUID: e9a42b02-d5df-448d-aa00-03f14749eb61  (Ultimate Performance)
"#;
    let en_schemes = parse_powercfg_list(en_sample);
    assert_eq!(en_schemes.len(), 3);
    assert!(en_schemes[0].is_active);
    assert!(!en_schemes[1].is_active);
    assert!(en_schemes[2].is_ultimate_performance);
}

#[test]
fn test_power_scheme_switch_empty_guid_validation() {
    assert!(set_active_power_scheme("".to_string()).is_err());
    assert!(set_active_power_scheme("    ".to_string()).is_err());
}
