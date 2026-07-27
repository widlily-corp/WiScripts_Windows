// Integration & Unit Test Suite Design for System Restore Point Native WinAPI Routine
// Path target: src-tauri/tests/system_restore_native_tests.rs

#[cfg(test)]
mod system_restore_native_tests {
    use wiscripts_windows_lib::optimization;
    use wiscripts_windows_lib::runner::{CommandRunner, DryRunRunner};
    use wiscripts_windows_lib::system_restore::{self, parse_restore_points_json};

    #[test]
    fn test_native_winapi_struct_memory_layout() {
        #[cfg(target_os = "windows")]
        {
            use std::mem::{align_of, size_of};
            use wiscripts_windows_lib::system_restore::native_winapi::{
                RESTOREPOINTINFOW, STATEMGRSTATUS,
            };

            // Assert C-compatible struct size & alignment matching Win32 SDK srrestoreptapi.h
            // dwEventType (4) + dwRestorePointType (4) + llSequenceNumber (8) + szDescription (256 * 2 = 512) = 528 bytes
            assert_eq!(size_of::<RESTOREPOINTINFOW>(), 528);
            // nStatus (4) + llSequenceNumber (8) + alignment padding = 16 bytes
            assert_eq!(size_of::<STATEMGRSTATUS>(), 16);
        }
    }

    #[test]
    fn test_create_restore_point_dry_run_isolation() {
        // Arrange
        let runner = DryRunRunner::new();
        let description = "Pre-Optimization Deep System Snapshot";

        // Act
        let action = system_restore::create_restore_point(&runner, description)
            .expect("Dry-run restore point creation should always succeed");

        // Assert
        assert_eq!(action.id, "create_restore_point");
        assert!(action.name.contains(description));
        assert!(action.command.contains("WinAPI::SRSetRestorePointW") || action.command.contains("Checkpoint-Computer"));
        assert_eq!(action.output.exit_code, 0);

        let history = runner.get_history();
        assert_eq!(history.len(), 1);
        assert!(history[0].command.contains("Checkpoint-Computer"));
    }

    #[test]
    fn test_optimization_batch_executes_restore_point_before_tweaks() {
        // Arrange
        let runner = DryRunRunner::new();
        let selected_keys = vec![
            "telemetry_diagtrack".to_string(),
            "ui_classic_context_menu".to_string(),
        ];

        // Act: Request optimization batch with create_restore_point = true
        let summary = optimization::execute(None, &runner, &selected_keys, true)
            .expect("Optimization batch execution should succeed");

        // Assert: First action MUST be restore point creation before any tweak action
        assert!(summary.success);
        assert_eq!(summary.executed_actions.len(), 3);
        assert_eq!(summary.executed_actions[0].id, "create_restore_point");
        assert_eq!(summary.executed_actions[1].id, "telemetry_diagtrack");
        assert_eq!(summary.executed_actions[2].id, "ui_classic_context_menu");

        // Verify command history sequence: Checkpoint-Computer must precede tweak commands
        let history = runner.get_history();
        assert_eq!(history.len(), 3);
        assert!(history[0].command.contains("Checkpoint-Computer"));
        assert!(history[1].command.contains("DiagTrack"));
        assert!(history[2].command.contains("CLSID"));
    }

    #[test]
    fn test_parse_restore_point_json_payloads() {
        let json_payload = r#"[
            {"SequenceNumber":201,"Description":"System Optimization Pre-Check","RestorePointType":"MODIFY_SETTINGS","CreationTime":"2026-07-27T12:00:00Z"}
        ]"#;

        let points = parse_restore_points_json(json_payload).expect("Valid JSON should parse successfully");
        assert_eq!(points.len(), 1);
        assert_eq!(points[0].sequence_number, 201);
        assert_eq!(points[0].description, "System Optimization Pre-Check");
        assert_eq!(points[0].restore_point_type, "MODIFY_SETTINGS");
    }
}
