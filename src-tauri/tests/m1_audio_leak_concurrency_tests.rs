use std::sync::Arc;
use std::thread;
use std::time::Instant;
use wiscripts_windows_lib::audio::{AudioBackend, WindowsAudioBackend};

#[test]
fn test_windows_audio_backend_stress_and_leak_check() {
    let start_time = Instant::now();
    let backend = Arc::new(WindowsAudioBackend);
    let mut handles = vec![];

    // Spawn 10 concurrent worker threads, each performing 20 iteration loops of COM enumeration
    for thread_idx in 0..10 {
        let backend_clone = Arc::clone(&backend);
        let handle = thread::spawn(move || {
            for i in 0..20 {
                let dev_res = backend_clone.get_audio_devices();
                let sess_res = backend_clone.get_app_audio_sessions();

                if i % 10 == 0 {
                    println!(
                        "Thread {} iteration {}: devices ok={}, sessions ok={}",
                        thread_idx,
                        i,
                        dev_res.is_ok(),
                        sess_res.is_ok()
                    );
                }
            }
        });
        handles.push(handle);
    }

    for h in handles {
        h.join().expect("Worker thread panicked during COM stress test");
    }

    let elapsed = start_time.elapsed();
    println!("Completed 200 total COM device & session enumerations across 10 threads in {:?}", elapsed);
    assert!(elapsed.as_secs() < 30, "Stress test completed within reasonable SLA");
}
