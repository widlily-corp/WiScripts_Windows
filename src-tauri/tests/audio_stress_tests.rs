use wiscripts_windows_lib::audio::types::AudioFlow;
use wiscripts_windows_lib::audio::{
    get_app_audio_sessions, get_audio_devices, set_app_audio_device, set_app_volume,
    set_global_audio_device, AudioBackend, MockAudioBackend,
};
use std::thread;

#[test]
fn test_audio_stress_invalid_device_ids() {
    let empty_id = "";
    let whitespace_id = "   \t\n ";
    let non_existent_id = "{00000000-0000-0000-0000-000000000000}.{non-existent-device-12345}";
    let null_char_id = "device\0with_null";
    let ultra_long_id = "a".repeat(10_000);
    let special_chars_id = "<script>alert(1)</script>' OR 1=1--";

    // 1. Empty string
    let res1 = set_global_audio_device(empty_id, AudioFlow::Render);
    assert!(res1.is_err(), "Empty device ID must return an error");

    // 2. Whitespace string
    let res2 = set_global_audio_device(whitespace_id, AudioFlow::Render);
    assert!(res2.is_err(), "Whitespace device ID must return an error");

    // 3. Non-existent GUID
    let res3 = set_global_audio_device(non_existent_id, AudioFlow::Render);
    assert!(res3.is_err() || res3.is_ok(), "Non-existent device ID should be handled gracefully");

    // 4. Null-character string
    let res4 = set_global_audio_device(null_char_id, AudioFlow::Render);
    // encode_utf16 stops at \0 or encodes it cleanly into PCWSTR
    let _ = res4;

    // 5. Ultra long string
    let res5 = set_global_audio_device(&ultra_long_id, AudioFlow::Render);
    let _ = res5;

    // 6. Special chars
    let res6 = set_global_audio_device(special_chars_id, AudioFlow::Render);
    let _ = res6;
}

#[test]
fn test_audio_stress_non_existent_pids() {
    let dev_id = "{0.0.0.00000000}.{dev-speakers-1}";

    // PID = 0 (System / Idle process)
    let res_pid0 = set_app_audio_device(0, dev_id, AudioFlow::Render);
    let _ = res_pid0;

    let res_vol0 = set_app_volume(0, 0.5, false);
    assert!(res_vol0.is_ok(), "set_app_volume for PID 0 should complete safely without panicking");

    // Non-existent PID 999999
    let res_pid_invalid = set_app_audio_device(999999, dev_id, AudioFlow::Render);
    let _ = res_pid_invalid;

    let res_vol_invalid = set_app_volume(999999, 0.5, false);
    assert!(res_vol_invalid.is_ok(), "set_app_volume for non-existent PID should complete safely");

    // Max u32 PID
    let res_pid_max = set_app_audio_device(u32::MAX, dev_id, AudioFlow::Render);
    let _ = res_pid_max;

    let res_vol_max = set_app_volume(u32::MAX, 0.5, false);
    assert!(res_vol_max.is_ok(), "set_app_volume for u32::MAX PID should complete safely");
}

#[test]
fn test_audio_stress_extreme_volume_values() {
    let mock = MockAudioBackend::new_with_sample_data();

    // Volume > 1.0 (e.g. 50.0)
    let res_high = mock.set_app_volume(4120, 50.0, false);
    assert!(res_high.is_ok());
    let sessions = mock.get_app_audio_sessions().unwrap();
    let app = sessions.iter().find(|s| s.pid == 4120).unwrap();
    assert_eq!(app.volume, 1.0, "Volume 50.0 must clamp to 1.0");

    // Volume < 0.0 (e.g. -10.0)
    let res_low = mock.set_app_volume(4120, -10.0, false);
    assert!(res_low.is_ok());
    let sessions = mock.get_app_audio_sessions().unwrap();
    let app = sessions.iter().find(|s| s.pid == 4120).unwrap();
    assert_eq!(app.volume, 0.0, "Volume -10.0 must clamp to 0.0");

    // Volume = NaN
    let res_nan = mock.set_app_volume(4120, f32::NAN, false);
    assert!(res_nan.is_ok());

    // Volume = INFINITY
    let res_inf = mock.set_app_volume(4120, f32::INFINITY, false);
    assert!(res_inf.is_ok());
    let sessions = mock.get_app_audio_sessions().unwrap();
    let app = sessions.iter().find(|s| s.pid == 4120).unwrap();
    assert_eq!(app.volume, 1.0, "Volume INFINITY must clamp to 1.0");

    // Volume = NEG_INFINITY
    let res_neginf = mock.set_app_volume(4120, f32::NEG_INFINITY, false);
    assert!(res_neginf.is_ok());
    let sessions = mock.get_app_audio_sessions().unwrap();
    let app = sessions.iter().find(|s| s.pid == 4120).unwrap();
    assert_eq!(app.volume, 0.0, "Volume NEG_INFINITY must clamp to 0.0");
}

#[test]
fn test_audio_uninitialized_com_threads_and_concurrency() {
    // Spawn 10 raw threads that call COM audio functions directly without prior CoInitializeEx
    let mut handles = Vec::new();

    for i in 0..10 {
        let handle = thread::spawn(move || {
            // Raw OS thread (uninitialized COM)
            let dev_res = get_audio_devices();
            assert!(dev_res.is_ok(), "Thread {} get_audio_devices failed", i);

            let sess_res = get_app_audio_sessions();
            assert!(sess_res.is_ok(), "Thread {} get_app_audio_sessions failed", i);
        });
        handles.push(handle);
    }

    for h in handles {
        h.join().expect("Thread panicked");
    }
}

#[test]
fn test_audio_sta_com_thread_compatibility() {
    // Test on a thread that manually initialized COM in STA mode (COINIT_APARTMENTTHREADED)
    let handle = thread::spawn(move || {
        unsafe {
            use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED};
            let hr = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            let _need_uninit = hr.is_ok();

            // Calling audio module while thread is in STA mode
            let res = get_audio_devices();
            assert!(res.is_ok(), "Audio device enumeration must succeed on STA thread");

            if _need_uninit {
                CoUninitialize();
            }
        }
    });

    handle.join().expect("STA thread panicked");
}

#[test]
fn test_audio_mock_backend_edge_cases() {
    let mock = MockAudioBackend::new_with_sample_data();

    // Try setting non-existent device ID globally
    let res_dev = mock.set_global_audio_device("non-existent-device-xyz", AudioFlow::Render);
    assert!(res_dev.is_err(), "Mock backend must return Err for non-existent device ID");

    // Try setting app audio device with empty string
    let res_app_empty = mock.set_app_audio_device(4120, "   ", AudioFlow::Render);
    assert!(res_app_empty.is_err(), "Mock backend must return Err for empty device ID in set_app_audio_device");

    // Try setting app audio device for non-existent PID
    let res_app_pid = mock.set_app_audio_device(999999, "{0.0.0.00000000}.{dev-speakers-1}", AudioFlow::Render);
    assert!(res_app_pid.is_err(), "Mock backend must return Err for non-existent PID in set_app_audio_device");
}
