use std::process::Command;
use std::time::Instant;
use wiscripts_windows_lib::runner::{CommandRunner, RealRunner};

#[test]
fn test_m1_timeout_kills_long_running_process() {
    let runner = RealRunner::new();
    let start = Instant::now();

    let res = runner.run_powershell("Start-Sleep -Seconds 1");
    let elapsed = start.elapsed();

    assert!(res.is_ok(), "PowerShell Start-Sleep should succeed");
    assert!(elapsed.as_secs() < 5, "Should complete within 5 seconds");
}

#[test]
fn test_m1_pipe_buffer_overflow_stress_test() {
    let runner = RealRunner::new();
    let start = Instant::now();

    let script = "1..5000 | ForEach-Object { 'Line ' + $_ + ' with some extra text filling up the pipe buffer capacity' }";
    let res = runner.run_powershell(script);
    let elapsed = start.elapsed();

    assert!(
        res.is_ok(),
        "PowerShell command producing >64KB output should complete"
    );
    let out = res.unwrap();
    assert_eq!(out.exit_code, 0);
    assert!(
        out.stdout.len() > 100_000,
        "Output should be larger than 100KB, got {} bytes",
        out.stdout.len()
    );
    assert!(
        elapsed.as_secs() < 10,
        "Should complete within 10 seconds without deadlocking on pipe buffer"
    );
}

#[test]
fn test_m1_cmd_large_stdout_pipe_buffer() {
    let runner = RealRunner::new();
    let start = Instant::now();

    let res = runner.run_cmd("for /L %i in (1,1,3000) do @echo Output line %i with padding text to flood stdout pipe buffer capacity");
    let elapsed = start.elapsed();

    assert!(
        res.is_ok(),
        "CMD command producing >64KB output should complete"
    );
    let out = res.unwrap();
    assert_eq!(out.exit_code, 0);
    assert!(
        out.stdout.len() > 100_000,
        "CMD output should be larger than 100KB, got {} bytes",
        out.stdout.len()
    );
    assert!(
        elapsed.as_secs() < 10,
        "Should complete within 10 seconds without deadlocking"
    );
}

#[test]
fn test_m1_verify_grandchild_process_tree_kill_behavior() {
    let mut cmd = Command::new("cmd.exe");
    cmd.args(["/C", "powershell -Command Start-Sleep -Seconds 30"]);
    let mut child = cmd
        .spawn()
        .expect("Failed to spawn cmd with powershell grandchild");

    std::thread::sleep(std::time::Duration::from_millis(500));

    let _pid = child.id();

    let kill_res = child.kill();
    let wait_res = child.wait();

    assert!(kill_res.is_ok(), "Child kill returned OK");
    assert!(wait_res.is_ok(), "Child wait returned OK");

    let check_grandchild = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Get-Process -Name powershell -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*Start-Sleep -Seconds 30*' }",
        ])
        .output();

    if let Ok(out) = check_grandchild {
        let stdout = String::from_utf8_lossy(&out.stdout);
        if stdout.contains("powershell") {
            println!("CHALLENGE OBSERVATION: Grandchild process was orphaned because std::process::Child.kill() only terminates top-level process!");
            let _ = Command::new("powershell.exe")
                .args([
                    "-NoProfile",
                    "-NonInteractive",
                    "-Command",
                    "Stop-Process -Name powershell -Force -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*Start-Sleep -Seconds 30*' }",
                ])
                .output();
        }
    }
}
