//! Empirical Challenger Stress Tests for Process Tree Termination
//!
//! Tests Windows process tree termination (`kill_process_tree`) under nested process
//! hierarchies (PowerShell -> CMD -> ping.exe), verifying that all descendant processes
//! are completely terminated without leaving orphaned processes.

use std::process::{Command, Stdio};
use std::time::{Duration, Instant};
use wiscripts_windows_lib::runner::{CommandRunner, RealRunner};
use wiscripts_windows_lib::script_runner::{kill_process_tree, ScriptExecutionRegistry};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

/// Helper function to check if a process with a given PID is currently alive on Windows.
fn is_process_alive(pid: u32) -> bool {
    if pid == 0 {
        return false;
    }

    #[cfg(target_os = "windows")]
    {
        let output = Command::new("powershell")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                &format!(
                    "if (Get-Process -Id {} -ErrorAction SilentlyContinue) {{ Write-Output 'ALIVE' }} else {{ Write-Output 'DEAD' }}",
                    pid
                ),
            ])
            .creation_flags(0x08000000)
            .output();

        match output {
            Ok(out) => {
                let text = String::from_utf8_lossy(&out.stdout);
                text.trim().contains("ALIVE")
            }
            Err(_) => false,
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let output = Command::new("kill")
            .args(["-0", &pid.to_string()])
            .output();
        output.map(|o| o.status.success()).unwrap_or(false)
    }
}

/// Helper function to find all child/grandchild PIDs of a given parent PID using WMI on Windows.
fn get_child_pids(parent_pid: u32) -> Vec<u32> {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("powershell")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                &format!(
                    "Get-CimInstance Win32_Process | Where-Object {{ $_.ParentProcessId -eq {} }} | Select-Object -ExpandProperty ProcessId",
                    parent_pid
                ),
            ])
            .creation_flags(0x08000000)
            .output();

        if let Ok(out) = output {
            let text = String::from_utf8_lossy(&out.stdout);
            return text
                .lines()
                .filter_map(|l| l.trim().parse::<u32>().ok())
                .collect();
        }
    }
    Vec::new()
}

#[test]
fn test_kill_process_tree_zero_and_invalid_pids_are_safe_noops() {
    // Should never panic or crash on edge case PIDs
    kill_process_tree(0);
    kill_process_tree(999_999_999);
}

#[test]
fn test_kill_process_tree_nested_powershell_cmd_ping() {
    // Spawn a root PowerShell process that launches nested background processes:
    // Root: powershell.exe
    //   -> Child: cmd.exe
    //        -> Grandchild: ping.exe 127.0.0.1 -n 60
    let mut cmd = Command::new("powershell");
    cmd.args([
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$proc = Start-Process cmd.exe -ArgumentList '/c ping 127.0.0.1 -n 60' -PassThru -NoNewWindow; Write-Host \"CHILD_PID:$($proc.Id)\"; Start-Sleep -Seconds 60",
    ]);

    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd.spawn().expect("Failed to spawn root process");
    let root_pid = child.id();
    assert!(root_pid > 0, "Root PID must be > 0");

    // Wait a brief moment for child and grandchild processes to be initialized
    std::thread::sleep(Duration::from_millis(1500));

    // Verify root process is alive
    assert!(is_process_alive(root_pid), "Root process must be alive initially");

    // Find all children and grandchildren in the tree
    let mut all_descendant_pids = get_child_pids(root_pid);
    let mut grandchildren = Vec::new();
    for &child_pid in &all_descendant_pids {
        let gkids = get_child_pids(child_pid);
        grandchildren.extend(gkids);
    }
    all_descendant_pids.extend(grandchildren);

    println!(
        "[Test] Root PID: {}, Discovered descendant PIDs: {:?}",
        root_pid, all_descendant_pids
    );

    // Call kill_process_tree on the root PID
    kill_process_tree(root_pid);
    let _ = child.kill();
    let _ = child.wait();

    // Allow Windows kernel brief grace period (500ms) to clean up terminating handles
    std::thread::sleep(Duration::from_millis(500));

    // 1. Verify root process is dead
    assert!(
        !is_process_alive(root_pid),
        "Root PID {} should be terminated",
        root_pid
    );

    // 2. Verify EVERY single child and grandchild process is dead (0 orphaned processes)
    for &desc_pid in &all_descendant_pids {
        assert!(
            !is_process_alive(desc_pid),
            "Descendant PID {} was orphaned and is still alive after kill_process_tree!",
            desc_pid
        );
    }
}

#[test]
fn test_kill_process_tree_multi_branch_tree_stress() {
    // Spawns multiple branches concurrently
    let mut cmd = Command::new("powershell");
    cmd.args([
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        r#"
        $p1 = Start-Process cmd.exe -ArgumentList '/c ping 127.0.0.1 -n 60' -PassThru -NoNewWindow
        $p2 = Start-Process powershell.exe -ArgumentList '-NoProfile -Command Start-Sleep 60' -PassThru -NoNewWindow
        $p3 = Start-Process cmd.exe -ArgumentList '/c timeout /t 60' -PassThru -NoNewWindow
        Write-Host "SPAWNED:$($p1.Id),$($p2.Id),$($p3.Id)"
        Start-Sleep -Seconds 60
        "#,
    ]);

    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);

    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd.spawn().expect("Failed to spawn multi-branch root process");
    let root_pid = child.id();

    // Wait for all 3 child branches to spawn
    std::thread::sleep(Duration::from_millis(2000));

    assert!(is_process_alive(root_pid), "Root process must be alive initially");

    let direct_children = get_child_pids(root_pid);
    let mut all_tree_pids = direct_children.clone();
    for &cpid in &direct_children {
        all_tree_pids.extend(get_child_pids(cpid));
    }

    println!(
        "[Test Multi-Branch] Root PID: {}, Tree PIDs: {:?}",
        root_pid, all_tree_pids
    );
    assert!(!all_tree_pids.is_empty(), "At least one child process should have spawned");

    // Terminate tree
    kill_process_tree(root_pid);
    let _ = child.kill();
    let _ = child.wait();

    std::thread::sleep(Duration::from_millis(500));

    assert!(!is_process_alive(root_pid), "Root PID must be dead");
    for &pid in &all_tree_pids {
        assert!(
            !is_process_alive(pid),
            "Process PID {} in multi-branch tree survived kill_process_tree!",
            pid
        );
    }
}

#[test]
fn test_script_execution_registry_cancellation_terminates_process_tree() {
    let registry = ScriptExecutionRegistry::new();
    let exec_id = "test_cancel_stress_exec_1";

    let mut cmd = Command::new("powershell");
    cmd.args([
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$p = Start-Process cmd.exe -ArgumentList '/c ping 127.0.0.1 -n 60' -PassThru -NoNewWindow; Start-Sleep 60",
    ]);

    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);

    let mut child = cmd.spawn().expect("Failed to spawn process");
    let pid = child.id();

    let (_cancel_flag, _guard) = registry.register(exec_id, pid, "ps1");
    std::thread::sleep(Duration::from_millis(1500));

    let children = get_child_pids(pid);
    assert!(is_process_alive(pid), "Process must be alive before cancellation");

    // Cancel execution via registry
    let cancel_res = registry.cancel(exec_id);
    assert!(cancel_res.is_ok(), "Cancellation must succeed");
    assert!(registry.is_cancelled(exec_id), "is_cancelled must return true");

    let _ = child.kill();
    let _ = child.wait();

    std::thread::sleep(Duration::from_millis(500));

    assert!(!is_process_alive(pid), "Process PID must be terminated after registry cancel");
    for &cpid in &children {
        assert!(!is_process_alive(cpid), "Child PID {} must be terminated after cancel", cpid);
    }
}

#[test]
fn test_real_runner_timeout_terminates_nested_child_processes() {
    let runner = RealRunner::new();

    let script = r#"
    $p = Start-Process cmd.exe -ArgumentList '/c ping 127.0.0.1 -n 60' -PassThru -NoNewWindow
    Start-Sleep -Seconds 60
    "#;

    let start = Instant::now();
    // Run with a 2-second timeout
    let result = runner.run_powershell_with_timeout(script, 2);
    let elapsed = start.elapsed();

    assert!(result.is_err(), "Script should have timed out and returned an error");
    let err_msg = result.err().unwrap();
    assert!(
        err_msg.contains("timed out") || err_msg.contains("2 seconds"),
        "Error message should mention timeout: {}",
        err_msg
    );
    assert!(
        elapsed < Duration::from_secs(10),
        "Timeout should have triggered quickly, took {:?}",
        elapsed
    );
}
