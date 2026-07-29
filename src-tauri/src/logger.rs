use simplelog::{ConfigBuilder, LevelFilter, WriteLogger};
use std::fs::OpenOptions;
use std::path::PathBuf;

/// Returns the absolute path to `debug.log` in the local application data directory.
pub fn get_log_path() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| std::env::temp_dir())
        .join("WiScripts")
        .join("logs")
        .join("debug.log")
}

/// Initializes the file-based persistent logger (`debug.log`) with RFC-3339 timestamps.
///
/// Handled gracefully: If `WriteLogger::init` fails because a logger was already registered
/// (for example, during parallel `cargo test` execution), `init_logger` returns `Ok(())`
/// instead of panicking.
pub fn init_logger() -> Result<(), String> {
    let log_path = get_log_path();

    if let Some(log_dir) = log_path.parent() {
        std::fs::create_dir_all(log_dir)
            .map_err(|e| format!("Failed to create log directory '{:?}': {}", log_dir, e))?;
    }

    let file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|e| format!("Failed to open log file '{:?}': {}", log_path, e))?;

    let config = ConfigBuilder::new()
        .set_time_format_rfc3339()
        .build();

    match WriteLogger::init(LevelFilter::Debug, config, file) {
        Ok(()) => {
            log::info!("[Logger] Persistent debug logger initialized at {:?}", log_path);
            Ok(())
        }
        Err(_set_logger_err) => {
            // Already initialized in process lifetime (common during cargo test execution)
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::Path;
    use crate::runner::{CommandRunner, DryRunRunner};

    #[test]
    fn test_get_log_path_returns_expected_structure() {
        // Arrange
        let expected_suffix = Path::new("WiScripts").join("logs").join("debug.log");

        // Act
        let path = get_log_path();

        // Assert
        assert!(
            path.ends_with(&expected_suffix),
            "Log path {:?} should end with {:?}",
            path,
            expected_suffix
        );
    }

    #[test]
    fn test_init_logger_creates_debug_log() {
        // Act
        let res = init_logger();

        // Assert
        assert!(res.is_ok(), "init_logger() should return Ok");
        let path = get_log_path();
        let log_dir = path.parent().expect("Log path must have parent directory");
        assert!(log_dir.exists(), "Log directory must exist");
        assert!(log_dir.is_dir(), "Log directory path must be a directory");
        assert!(path.exists(), "debug.log file must exist");
    }

    #[test]
    fn test_reinit_logger_handles_set_logger_error_gracefully() {
        // Act - Call twice to ensure second call doesn't panic or error
        let res1 = init_logger();
        let res2 = init_logger();

        // Assert
        assert!(res1.is_ok());
        assert!(res2.is_ok());
    }

    #[test]
    fn test_log_levels_timestamps_and_output_formatting() {
        // Arrange
        let _ = init_logger();

        // Act
        log::info!("[TEST_MARKER] Info log entry for unit test assertion");
        log::warn!("[TEST_MARKER] Warn log entry for unit test assertion");
        log::error!("[TEST_MARKER] Error log entry for unit test assertion");
        log::debug!("[TEST_MARKER] Debug log entry for unit test assertion");

        // Assert
        let log_path = get_log_path();
        let contents = fs::read_to_string(&log_path).expect("Failed to read debug.log");

        assert!(
            contents.contains("[TEST_MARKER] Info log entry for unit test assertion"),
            "Log should contain INFO marker"
        );
        assert!(
            contents.contains("[TEST_MARKER] Warn log entry for unit test assertion"),
            "Log should contain WARN marker"
        );
        assert!(
            contents.contains("[TEST_MARKER] Error log entry for unit test assertion"),
            "Log should contain ERROR marker"
        );
        assert!(
            contents.contains("[TEST_MARKER] Debug log entry for unit test assertion"),
            "Log should contain DEBUG marker"
        );

        // Verify RFC-3339 timestamp format presence in file lines (e.g. YYYY-MM-DDTHH:MM:SS)
        let rfc3339_regex = regex_check_rfc3339(&contents);
        assert!(
            rfc3339_regex,
            "Log content should include RFC-3339 formatted timestamps"
        );
    }

    #[test]
    fn test_command_runner_logging_stdout_stderr() {
        // Arrange
        let _ = init_logger();
        let runner = DryRunRunner::new();

        // Act
        let _ps_out = runner.run_powershell("Get-Process -Name explorer").unwrap();
        let _cmd_out = runner.run_cmd("echo HelloLogger").unwrap();

        // Assert
        let log_path = get_log_path();
        let contents = fs::read_to_string(&log_path).expect("Failed to read debug.log");

        assert!(
            contents.contains("Get-Process -Name explorer"),
            "Log should contain command execution string"
        );
        assert!(
            contents.contains("Simulated PowerShell execution"),
            "Log should contain stdout output string"
        );
        assert!(
            contents.contains("echo HelloLogger"),
            "Log should contain cmd command string"
        );
    }

    fn regex_check_rfc3339(content: &str) -> bool {
        // Check for pattern like "2026-" or ISO timestamp "T" delimiter e.g. "2026-07-22T"
        content.lines().any(|line| {
            line.len() > 10 && line.chars().nth(4) == Some('-') && line.chars().nth(7) == Some('-') && line.contains('T')
        })
    }
}
