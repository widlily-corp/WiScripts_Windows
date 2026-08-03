use crate::audio::com::{ComInitializer, IPolicyConfig, CLSID_POLICY_CONFIG_CLIENT};
use crate::audio::types::{AudioDevice, AudioDevicesPayload, AudioFlow, DeviceState};
use crate::error::AppError;
use windows::core::PCWSTR;
use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
use windows::Win32::Media::Audio::{
    eCapture, eCommunications, eConsole, eMultimedia, eRender, EDataFlow, ERole, IMMDevice,
    IMMDeviceEnumerator, MMDeviceEnumerator, DEVICE_STATE_ACTIVE,
};
use windows::Win32::System::Com::{CoCreateInstance, CoTaskMemFree, CLSCTX_ALL, STGM_READ};
use windows::Win32::UI::Shell::PropertiesSystem::PROPERTYKEY;

fn get_default_device_id(
    enumerator: &IMMDeviceEnumerator,
    flow: EDataFlow,
    role: ERole,
) -> Option<String> {
    unsafe {
        let dev = enumerator.GetDefaultAudioEndpoint(flow, role).ok()?;
        let pwstr = dev.GetId().ok()?;
        let id = pwstr.to_string().ok();
        CoTaskMemFree(Some(pwstr.as_ptr() as _));
        id
    }
}

fn get_device_friendly_name(dev: &IMMDevice) -> Option<String> {
    unsafe {
        let store = dev.OpenPropertyStore(STGM_READ).ok()?;
        let pkey = PROPERTYKEY {
            fmtid: windows::core::GUID::from_u128(0xa45c254e_df1c_4efd_8020_67d146a850e0),
            pid: 14,
        };
        let prop = store.GetValue(&pkey).ok()?;
        let name = prop.to_string();
        if name.is_empty() {
            None
        } else {
            Some(name)
        }
    }
}

fn get_device_volume_and_mute(dev: &IMMDevice) -> (f32, bool) {
    unsafe {
        if let Ok(vol_ctrl) = dev.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None) {
            let vol = vol_ctrl.GetMasterVolumeLevelScalar().unwrap_or(1.0);
            let muted = vol_ctrl.GetMute().map(|b| b.as_bool()).unwrap_or(false);
            (vol, muted)
        } else {
            (1.0, false)
        }
    }
}

fn determine_device_icon(name: &str, flow: AudioFlow) -> String {
    let lower = name.to_lowercase();
    if lower.contains("headphone") || lower.contains("headset") || lower.contains("earphone") {
        "headphones".to_string()
    } else if lower.contains("mic") || lower.contains("microphone") || flow == AudioFlow::Capture {
        "mic".to_string()
    } else if lower.contains("speaker") || lower.contains("realtek") {
        "speaker".to_string()
    } else {
        match flow {
            AudioFlow::Render => "speaker".to_string(),
            AudioFlow::Capture => "mic".to_string(),
        }
    }
}

fn enumerate_flow_devices(
    enumerator: &IMMDeviceEnumerator,
    flow: EDataFlow,
    flow_enum: AudioFlow,
    def_multi: &Option<String>,
    def_comm: &Option<String>,
) -> Result<Vec<AudioDevice>, AppError> {
    unsafe {
        let collection = enumerator
            .EnumAudioEndpoints(flow, DEVICE_STATE_ACTIVE)
            .map_err(|e| AppError::System(format!("Failed to enum audio endpoints: {}", e)))?;
        let count = collection
            .GetCount()
            .map_err(|e| AppError::System(format!("Failed to get device count: {}", e)))?;

        let mut devices = Vec::with_capacity(count as usize);

        for i in 0..count {
            let dev = match collection.Item(i) {
                Ok(d) => d,
                Err(_) => continue,
            };

            let pwstr = match dev.GetId() {
                Ok(p) => p,
                Err(_) => continue,
            };
            let id = pwstr.to_string().unwrap_or_default();
            CoTaskMemFree(Some(pwstr.as_ptr() as _));

            let state = match dev.GetState() {
                Ok(s) => match s.0 {
                    1 => DeviceState::Active,
                    2 => DeviceState::Disabled,
                    4 => DeviceState::NotPresent,
                    8 => DeviceState::Unplugged,
                    _ => DeviceState::Active,
                },
                Err(_) => DeviceState::Active,
            };

            let name = get_device_friendly_name(&dev)
                .unwrap_or_else(|| format!("Audio Device {}", i + 1));
            let (volume, is_muted) = get_device_volume_and_mute(&dev);

            let is_default_multi = def_multi.as_ref() == Some(&id);
            let is_default_comm = def_comm.as_ref() == Some(&id);
            let is_default = is_default_multi || is_default_comm;
            let icon = determine_device_icon(&name, flow_enum);

            devices.push(AudioDevice {
                id,
                name,
                flow: flow_enum,
                is_default,
                is_default_multimedia: is_default_multi,
                is_default_communications: is_default_comm,
                volume,
                is_muted,
                state,
                icon,
            });
        }

        Ok(devices)
    }
}

pub fn enumerate_devices() -> Result<AudioDevicesPayload, AppError> {
    let _com = ComInitializer::new()
        .map_err(|e| AppError::System(format!("COM initialization failed: {}", e)))?;

    unsafe {
        let enumerator: IMMDeviceEnumerator =
            CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                .map_err(|e| AppError::System(format!("Failed to create MMDeviceEnumerator: {}", e)))?;

        let def_render_multi = get_default_device_id(&enumerator, eRender, eMultimedia);
        let def_render_comm = get_default_device_id(&enumerator, eRender, eCommunications);
        let def_capture_multi = get_default_device_id(&enumerator, eCapture, eMultimedia);
        let def_capture_comm = get_default_device_id(&enumerator, eCapture, eCommunications);

        let render_devices = enumerate_flow_devices(
            &enumerator,
            eRender,
            AudioFlow::Render,
            &def_render_multi,
            &def_render_comm,
        )?;

        let capture_devices = enumerate_flow_devices(
            &enumerator,
            eCapture,
            AudioFlow::Capture,
            &def_capture_multi,
            &def_capture_comm,
        )?;

        let default_render_id = def_render_multi.or(def_render_comm);
        let default_capture_id = def_capture_multi.or(def_capture_comm);

        Ok(AudioDevicesPayload {
            render_devices,
            capture_devices,
            default_render_id,
            default_capture_id,
        })
    }
}

pub fn set_global_device(device_id: &str, _flow: AudioFlow) -> Result<(), AppError> {
    if device_id.trim().is_empty() {
        return Err(AppError::InvalidConfig("Device ID cannot be empty".to_string()));
    }

    let _com = ComInitializer::new()
        .map_err(|e| AppError::System(format!("COM initialization failed: {}", e)))?;

    unsafe {
        let policy: IPolicyConfig =
            CoCreateInstance(&CLSID_POLICY_CONFIG_CLIENT, None, CLSCTX_ALL)
                .map_err(|e| AppError::System(format!("Failed to create IPolicyConfig COM instance: {}", e)))?;

        let wide_id: Vec<u16> = device_id.encode_utf16().chain(std::iter::once(0)).collect();
        let pcwstr = PCWSTR(wide_id.as_ptr());

        let hr_console = policy.SetDefaultEndpoint(pcwstr, eConsole);
        let hr_multi = policy.SetDefaultEndpoint(pcwstr, eMultimedia);
        let hr_comm = policy.SetDefaultEndpoint(pcwstr, eCommunications);

        if hr_console.is_err() && hr_multi.is_err() && hr_comm.is_err() {
            return Err(AppError::Execution(format!(
                "Failed to set default audio device endpoint (HRESULT: 0x{:08X})",
                hr_multi.0
            )));
        }

        Ok(())
    }
}
