use crate::audio::com::{ComInitializer, IAudioPolicyConfig, CLSID_AUDIO_POLICY_CONFIG_FACTORY};
use crate::audio::types::{AppAudioSession, AudioFlow};
use crate::error::AppError;
use std::collections::HashSet;
use windows::core::{Interface, PCWSTR};
use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::Media::Audio::{
    eCapture, eCommunications, eConsole, eMultimedia, eRender, IAudioSessionControl2,
    IAudioSessionEnumerator, IAudioSessionManager2, ISimpleAudioVolume, IMMDeviceEnumerator,
    MMDeviceEnumerator, DEVICE_STATE_ACTIVE,
};
use windows::Win32::System::Com::{CoCreateInstance, CoTaskMemFree, CLSCTX_ALL};
use windows::Win32::System::ProcessStatus::K32GetProcessImageFileNameW;
use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};

fn get_process_name_by_pid(pid: u32) -> String {
    unsafe {
        let handle: Result<HANDLE, _> = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
        if let Ok(h) = handle {
            let mut buf = [0u16; 1024];
            let len = K32GetProcessImageFileNameW(h, &mut buf);
            let _ = CloseHandle(h);
            if len > 0 {
                let full_path = String::from_utf16_lossy(&buf[..len as usize]);
                if let Some(filename) = full_path.split('\\').next_back() {
                    let clean = filename.trim_end_matches(".exe");
                    if !clean.is_empty() {
                        let mut chars = clean.chars();
                        if let Some(first) = chars.next() {
                            return format!("{}{}", first.to_uppercase(), chars.as_str());
                        }
                    }
                }
            }
        }
    }
    format!("Process {}", pid)
}

fn determine_app_icon(name: &str) -> Option<String> {
    let lower = name.to_lowercase();
    if lower.contains("chrome") {
        Some("chrome".to_string())
    } else if lower.contains("spotify") {
        Some("music".to_string())
    } else if lower.contains("discord") {
        Some("message-square".to_string())
    } else if lower.contains("firefox") || lower.contains("edge") || lower.contains("browser") {
        Some("globe".to_string())
    } else {
        Some("app".to_string())
    }
}

pub fn enumerate_app_sessions() -> Result<Vec<AppAudioSession>, AppError> {
    let _com = ComInitializer::new()
        .map_err(|e| AppError::System(format!("COM initialization failed: {}", e)))?;

    unsafe {
        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                .map_err(|e| AppError::System(format!("Failed to create MMDeviceEnumerator: {}", e)))?;

        let mut app_sessions = Vec::new();
        let mut seen_pids = HashSet::new();

        let flows = [(eRender, AudioFlow::Render), (eCapture, AudioFlow::Capture)];

        for (flow_win, flow_enum) in flows {
            let collection = match enumerator.EnumAudioEndpoints(flow_win, DEVICE_STATE_ACTIVE) {
                Ok(c) => c,
                Err(_) => continue,
            };

            let dev_count = match collection.GetCount() {
                Ok(c) => c,
                Err(_) => continue,
            };

            for i in 0..dev_count {
                let dev = match collection.Item(i) {
                    Ok(d) => d,
                    Err(_) => continue,
                };

                let dev_pwstr = match dev.GetId() {
                    Ok(p) => p,
                    Err(_) => continue,
                };
                let device_id = dev_pwstr.to_string().unwrap_or_default();
                CoTaskMemFree(Some(dev_pwstr.as_ptr() as _));

                let manager: IAudioSessionManager2 = match dev.Activate(CLSCTX_ALL, None) {
                    Ok(m) => m,
                    Err(_) => continue,
                };

                let session_enum: IAudioSessionEnumerator = match manager.GetSessionEnumerator() {
                    Ok(s) => s,
                    Err(_) => continue,
                };

                let session_count = match session_enum.GetCount() {
                    Ok(c) => c,
                    Err(_) => continue,
                };

                for s in 0..session_count {
                    let session_ctrl = match session_enum.GetSession(s) {
                        Ok(sc) => sc,
                        Err(_) => continue,
                    };

                    let session_ctrl2: IAudioSessionControl2 = match session_ctrl.cast() {
                        Ok(sc2) => sc2,
                        Err(_) => continue,
                    };

                    let pid = match session_ctrl2.GetProcessId() {
                        Ok(p) => p,
                        Err(_) => continue,
                    };

                    if pid == 0 {
                        continue;
                    }

                    if session_ctrl2.IsSystemSoundsSession().is_ok() {
                        continue;
                    }

                    if seen_pids.contains(&pid) {
                        continue;
                    }
                    seen_pids.insert(pid);

                    let session_id = match session_ctrl2.GetSessionIdentifier() {
                        Ok(pw) => {
                            let s = pw.to_string().unwrap_or_default();
                            CoTaskMemFree(Some(pw.as_ptr() as _));
                            s
                        }
                        Err(_) => format!("session-{}", pid),
                    };

                    let name = get_process_name_by_pid(pid);
                    let icon = determine_app_icon(&name);

                    let (volume, is_muted) = if let Ok(simple_vol) =
                        session_ctrl.cast::<ISimpleAudioVolume>()
                    {
                        let vol = simple_vol.GetMasterVolume().unwrap_or(1.0);
                        let muted = simple_vol.GetMute().map(|b| b.as_bool()).unwrap_or(false);
                        (vol, muted)
                    } else {
                        (1.0, false)
                    };

                    app_sessions.push(AppAudioSession {
                        pid,
                        name,
                        session_id,
                        volume,
                        is_muted,
                        device_id: device_id.clone(),
                        flow: flow_enum,
                        icon,
                    });
                }
            }
        }

        Ok(app_sessions)
    }
}

pub fn set_app_volume(pid: u32, volume: f32, muted: bool) -> Result<(), AppError> {
    let clamped_vol = volume.clamp(0.0, 1.0);
    let _com = ComInitializer::new()
        .map_err(|e| AppError::System(format!("COM initialization failed: {}", e)))?;

    unsafe {
        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                .map_err(|e| AppError::System(format!("Failed to create MMDeviceEnumerator: {}", e)))?;

        let flows = [eRender, eCapture];

        for flow in flows {
            let collection = match enumerator.EnumAudioEndpoints(flow, DEVICE_STATE_ACTIVE) {
                Ok(c) => c,
                Err(_) => continue,
            };

            let dev_count = match collection.GetCount() {
                Ok(c) => c,
                Err(_) => continue,
            };

            for i in 0..dev_count {
                let dev = match collection.Item(i) {
                    Ok(d) => d,
                    Err(_) => continue,
                };

                let manager: IAudioSessionManager2 = match dev.Activate(CLSCTX_ALL, None) {
                    Ok(m) => m,
                    Err(_) => continue,
                };

                let session_enum: IAudioSessionEnumerator = match manager.GetSessionEnumerator() {
                    Ok(s) => s,
                    Err(_) => continue,
                };

                let session_count = match session_enum.GetCount() {
                    Ok(c) => c,
                    Err(_) => continue,
                };

                for s in 0..session_count {
                    let session_ctrl = match session_enum.GetSession(s) {
                        Ok(sc) => sc,
                        Err(_) => continue,
                    };

                    let session_ctrl2: IAudioSessionControl2 = match session_ctrl.cast() {
                        Ok(sc2) => sc2,
                        Err(_) => continue,
                    };

                    if let Ok(session_pid) = session_ctrl2.GetProcessId() {
                        if session_pid == pid {
                            if let Ok(simple_vol) = session_ctrl.cast::<ISimpleAudioVolume>() {
                                let _ = simple_vol.SetMasterVolume(clamped_vol, std::ptr::null());
                                let _ = simple_vol.SetMute(
                                    windows::Win32::Foundation::BOOL::from(muted),
                                    std::ptr::null(),
                                );
                            }
                        }
                    }
                }
            }
        }

        Ok(())
    }
}

pub fn set_app_audio_device(pid: u32, device_id: &str, flow: AudioFlow) -> Result<(), AppError> {
    if device_id.trim().is_empty() {
        return Err(AppError::InvalidConfig("Device ID cannot be empty".to_string()));
    }

    let _com = ComInitializer::new()
        .map_err(|e| AppError::System(format!("COM initialization failed: {}", e)))?;

    unsafe {
        let policy: IAudioPolicyConfig =
            CoCreateInstance(&CLSID_AUDIO_POLICY_CONFIG_FACTORY, None, CLSCTX_ALL)
                .map_err(|e| AppError::System(format!("Failed to create IAudioPolicyConfig COM instance: {}", e)))?;

        let wide_id: Vec<u16> = device_id.encode_utf16().chain(std::iter::once(0)).collect();
        let pcwstr = PCWSTR(wide_id.as_ptr());

        let win_flow = match flow {
            AudioFlow::Render => eRender,
            AudioFlow::Capture => eCapture,
        };

        let hr_console = policy.SetPersistedDefaultAudioEndpoint(pid, win_flow, eConsole, pcwstr);
        let hr_multi = policy.SetPersistedDefaultAudioEndpoint(pid, win_flow, eMultimedia, pcwstr);
        let hr_comm = policy.SetPersistedDefaultAudioEndpoint(pid, win_flow, eCommunications, pcwstr);

        if hr_console.is_err() && hr_multi.is_err() && hr_comm.is_err() {
            return Err(AppError::Execution(format!(
                "Failed to set persisted default audio endpoint for process {} (HRESULT: 0x{:08X})",
                pid, hr_multi.0
            )));
        }

        Ok(())
    }
}
