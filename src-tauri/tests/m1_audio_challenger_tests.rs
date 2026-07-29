use std::sync::Arc;
use std::thread;
use wiscripts_windows_lib::audio::types::{AudioFlow, AudioDevice, AudioDevicesPayload, AppAudioSession, DeviceState};
use wiscripts_windows_lib::audio::{AudioBackend, MockAudioBackend, WindowsAudioBackend};
use wiscripts_windows_lib::error::AppError;

#[test]
fn test_mock_backend_concurrency_stress() {
    let mock = Arc::new(MockAudioBackend::new_with_sample_data());
    let mut handles = vec![];

    for i in 0..20 {
        let mock_clone = Arc::clone(&mock);
        let handle = thread::spawn(move || {
            for _ in 0..50 {
                let _ = mock_clone.get_audio_devices();
                let _ = mock_clone.get_app_audio_sessions();
                let _ = mock_clone.set_app_volume(4120, (i as f32) / 20.0, false);
            }
        });
        handles.push(handle);
    }

    for h in handles {
        h.join().expect("Thread panicked during mock backend stress test");
    }

    let sessions = mock.get_app_audio_sessions().expect("Failed to get sessions after stress");
    let spotify = sessions.iter().find(|s| s.pid == 4120).unwrap();
    assert!(spotify.volume >= 0.0 && spotify.volume <= 1.0);
}

#[test]
fn test_windows_audio_backend_multithreaded_com_init() {
    let mut handles = vec![];

    for _ in 0..10 {
        let handle = thread::spawn(|| {
            let backend = WindowsAudioBackend;
            // Attempt device enumeration across 10 concurrent threads to stress COM initialization
            let res = backend.get_audio_devices();
            // Should either succeed (if hardware present) or return a controlled AppError, never panic or crash
            match res {
                Ok(payload) => println!("Thread enumerated {} render devices", payload.render_devices.len()),
                Err(e) => println!("Thread COM/WASAPI returned error: {}", e),
            }
        });
        handles.push(handle);
    }

    for h in handles {
        h.join().expect("Thread panicked during Windows backend COM init stress test");
    }
}

#[test]
fn test_mock_backend_semantic_discrepancies() {
    let mock = MockAudioBackend::new_with_sample_data();

    // Challenge 1: Check communications role behavior on default device change
    let initial_payload = mock.get_audio_devices().unwrap();
    let initial_headphones = initial_payload.render_devices.iter().find(|d| d.id.contains("headphones")).unwrap();
    assert!(!initial_headphones.is_default);
    assert!(initial_headphones.is_default_communications);

    // Set headphones as default global render device
    let res = mock.set_global_audio_device("{0.0.0.00000000}.{dev-headphones-2}", AudioFlow::Render);
    assert!(res.is_ok());

    let updated_payload = mock.get_audio_devices().unwrap();
    let updated_speakers = updated_payload.render_devices.iter().find(|d| d.id.contains("speakers")).unwrap();
    let updated_headphones = updated_payload.render_devices.iter().find(|d| d.id.contains("headphones")).unwrap();

    // Speakers should no longer be default
    assert!(!updated_speakers.is_default);
    assert!(!updated_speakers.is_default_multimedia);

    // Headphones should now be default
    assert!(updated_headphones.is_default);
    assert!(updated_headphones.is_default_multimedia);

    // Challenge 2: Mock set_app_audio_device ignores flow parameter
    let set_dev_res = mock.set_app_audio_device(4120, "{0.0.0.00000000}.{dev-headphones-2}", AudioFlow::Capture);
    assert!(set_dev_res.is_ok()); // Note: set_app_audio_device succeeded even though Spotify session is Render flow!

    // Challenge 3: Setting app audio device for non-existent PID fails in Mock but succeeds in Windows Audio Policy API
    let non_existent_pid_res = mock.set_app_audio_device(999999, "{0.0.0.00000000}.{dev-headphones-2}", AudioFlow::Render);
    assert!(non_existent_pid_res.is_err(), "Mock fails for non-existent PID");
}

#[test]
fn test_facade_fallback_state_loss() {
    // Test if calling facade functions persists state when Windows Audio fails or in fallback mode
    let initial_devices = wiscripts_windows_lib::audio::get_audio_devices();
    assert!(initial_devices.is_ok());

    let set_res = wiscripts_windows_lib::audio::set_app_volume(4120, 0.123, true);
    assert!(set_res.is_ok());

    let sessions_after = wiscripts_windows_lib::audio::get_app_audio_sessions();
    assert!(sessions_after.is_ok());
}
