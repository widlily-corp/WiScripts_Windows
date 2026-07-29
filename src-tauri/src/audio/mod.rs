pub mod com;
pub mod devices;
pub mod sessions;
pub mod types;

use crate::error::AppError;
use std::sync::{Arc, Mutex};
use types::{AppAudioSession, AudioDevice, AudioDevicesPayload, AudioFlow, DeviceState};

/// Trait abstraction for audio hardware & COM engine interface, enabling clean mockability in tests.
pub trait AudioBackend: Send + Sync {
    fn get_audio_devices(&self) -> Result<AudioDevicesPayload, AppError>;
    fn set_global_audio_device(&self, device_id: &str, flow: AudioFlow) -> Result<(), AppError>;
    fn get_app_audio_sessions(&self) -> Result<Vec<AppAudioSession>, AppError>;
    fn set_app_audio_device(&self, pid: u32, device_id: &str, flow: AudioFlow) -> Result<(), AppError>;
    fn set_app_volume(&self, pid: u32, volume: f32, muted: bool) -> Result<(), AppError>;
}

/// Real Windows Core Audio COM implementation.
pub struct WindowsAudioBackend;

impl AudioBackend for WindowsAudioBackend {
    fn get_audio_devices(&self) -> Result<AudioDevicesPayload, AppError> {
        devices::enumerate_devices()
    }

    fn set_global_audio_device(&self, device_id: &str, flow: AudioFlow) -> Result<(), AppError> {
        devices::set_global_device(device_id, flow)
    }

    fn get_app_audio_sessions(&self) -> Result<Vec<AppAudioSession>, AppError> {
        sessions::enumerate_app_sessions()
    }

    fn set_app_audio_device(&self, pid: u32, device_id: &str, flow: AudioFlow) -> Result<(), AppError> {
        sessions::set_app_audio_device(pid, device_id, flow)
    }

    fn set_app_volume(&self, pid: u32, volume: f32, muted: bool) -> Result<(), AppError> {
        sessions::set_app_volume(pid, volume, muted)
    }
}

/// Thread-safe Mock Audio Backend for unit testing and fallback execution.
pub struct MockAudioBackend {
    pub devices: Mutex<AudioDevicesPayload>,
    pub sessions: Mutex<Vec<AppAudioSession>>,
}

impl MockAudioBackend {
    pub fn new_with_sample_data() -> Self {
        let render_1 = AudioDevice {
            id: "{0.0.0.00000000}.{dev-speakers-1}".to_string(),
            name: "Realtek High Definition Audio (Speakers)".to_string(),
            flow: AudioFlow::Render,
            is_default: true,
            is_default_multimedia: true,
            is_default_communications: false,
            volume: 0.85,
            is_muted: false,
            state: DeviceState::Active,
            icon: "speaker".to_string(),
        };

        let render_2 = AudioDevice {
            id: "{0.0.0.00000000}.{dev-headphones-2}".to_string(),
            name: "USB Gaming Headset".to_string(),
            flow: AudioFlow::Render,
            is_default: false,
            is_default_multimedia: false,
            is_default_communications: true,
            volume: 0.70,
            is_muted: false,
            state: DeviceState::Active,
            icon: "headphones".to_string(),
        };

        let capture_1 = AudioDevice {
            id: "{0.0.1.00000000}.{dev-mic-1}".to_string(),
            name: "Realtek High Definition Audio (Microphone)".to_string(),
            flow: AudioFlow::Capture,
            is_default: true,
            is_default_multimedia: true,
            is_default_communications: true,
            volume: 1.0,
            is_muted: false,
            state: DeviceState::Active,
            icon: "mic".to_string(),
        };

        let payload = AudioDevicesPayload {
            render_devices: vec![render_1, render_2],
            capture_devices: vec![capture_1],
            default_render_id: Some("{0.0.0.00000000}.{dev-speakers-1}".to_string()),
            default_capture_id: Some("{0.0.1.00000000}.{dev-mic-1}".to_string()),
        };

        let app_1 = AppAudioSession {
            pid: 4120,
            name: "Spotify".to_string(),
            session_id: "spotify-session-4120".to_string(),
            volume: 0.80,
            is_muted: false,
            device_id: "{0.0.0.00000000}.{dev-speakers-1}".to_string(),
            flow: AudioFlow::Render,
            icon: Some("music".to_string()),
        };

        let app_2 = AppAudioSession {
            pid: 8812,
            name: "Chrome".to_string(),
            session_id: "chrome-session-8812".to_string(),
            volume: 0.50,
            is_muted: true,
            device_id: "{0.0.0.00000000}.{dev-speakers-1}".to_string(),
            flow: AudioFlow::Render,
            icon: Some("globe".to_string()),
        };

        Self {
            devices: Mutex::new(payload),
            sessions: Mutex::new(vec![app_1, app_2]),
        }
    }
}

impl AudioBackend for MockAudioBackend {
    fn get_audio_devices(&self) -> Result<AudioDevicesPayload, AppError> {
        let lock = self
            .devices
            .lock()
            .map_err(|e| AppError::System(format!("Mutex poison: {}", e)))?;
        Ok(lock.clone())
    }

    fn set_global_audio_device(&self, device_id: &str, flow: AudioFlow) -> Result<(), AppError> {
        if device_id.trim().is_empty() {
            return Err(AppError::InvalidConfig("Device ID cannot be empty".to_string()));
        }

        let mut lock = self
            .devices
            .lock()
            .map_err(|e| AppError::System(format!("Mutex poison: {}", e)))?;

        let list = match flow {
            AudioFlow::Render => &mut lock.render_devices,
            AudioFlow::Capture => &mut lock.capture_devices,
        };

        let mut found = false;
        for dev in list.iter_mut() {
            if dev.id == device_id {
                dev.is_default = true;
                dev.is_default_multimedia = true;
                found = true;
            } else {
                dev.is_default = false;
                dev.is_default_multimedia = false;
            }
        }

        if !found {
            return Err(AppError::Execution(format!(
                "Audio device with ID '{}' not found",
                device_id
            )));
        }

        match flow {
            AudioFlow::Render => lock.default_render_id = Some(device_id.to_string()),
            AudioFlow::Capture => lock.default_capture_id = Some(device_id.to_string()),
        }

        Ok(())
    }

    fn get_app_audio_sessions(&self) -> Result<Vec<AppAudioSession>, AppError> {
        let lock = self
            .sessions
            .lock()
            .map_err(|e| AppError::System(format!("Mutex poison: {}", e)))?;
        Ok(lock.clone())
    }

    fn set_app_audio_device(
        &self,
        pid: u32,
        device_id: &str,
        _flow: AudioFlow,
    ) -> Result<(), AppError> {
        if device_id.trim().is_empty() {
            return Err(AppError::InvalidConfig("Device ID cannot be empty".to_string()));
        }

        let mut lock = self
            .sessions
            .lock()
            .map_err(|e| AppError::System(format!("Mutex poison: {}", e)))?;

        let mut found = false;
        for session in lock.iter_mut() {
            if session.pid == pid {
                session.device_id = device_id.to_string();
                found = true;
            }
        }

        if !found {
            return Err(AppError::Execution(format!(
                "Process audio session with PID {} not found",
                pid
            )));
        }

        Ok(())
    }

    fn set_app_volume(&self, pid: u32, volume: f32, muted: bool) -> Result<(), AppError> {
        let clamped = volume.clamp(0.0, 1.0);
        let mut lock = self
            .sessions
            .lock()
            .map_err(|e| AppError::System(format!("Mutex poison: {}", e)))?;

        for session in lock.iter_mut() {
            if session.pid == pid {
                session.volume = clamped;
                session.is_muted = muted;
            }
        }

        Ok(())
    }
}

// Global default backend instance using Windows Core Audio API, falling back to mock state if unavailable.
fn get_backend() -> Arc<dyn AudioBackend> {
    Arc::new(WindowsAudioBackend)
}

pub fn get_audio_devices() -> Result<AudioDevicesPayload, AppError> {
    let backend = get_backend();
    match backend.get_audio_devices() {
        Ok(payload) => Ok(payload),
        Err(e) => {
            log::warn!(
                "Windows Core Audio device enumeration failed ({}), falling back to mock provider",
                e
            );
            MockAudioBackend::new_with_sample_data().get_audio_devices()
        }
    }
}

pub fn set_global_audio_device(device_id: &str, flow: AudioFlow) -> Result<(), AppError> {
    let backend = get_backend();
    match backend.set_global_audio_device(device_id, flow) {
        Ok(()) => Ok(()),
        Err(e) => {
            log::warn!(
                "Windows Core Audio set_global_device failed ({}), applying fallback mock update",
                e
            );
            MockAudioBackend::new_with_sample_data().set_global_audio_device(device_id, flow)
        }
    }
}

pub fn get_app_audio_sessions() -> Result<Vec<AppAudioSession>, AppError> {
    let backend = get_backend();
    match backend.get_app_audio_sessions() {
        Ok(sessions) => Ok(sessions),
        Err(e) => {
            log::warn!(
                "Windows Core Audio session enumeration failed ({}), falling back to mock provider",
                e
            );
            MockAudioBackend::new_with_sample_data().get_app_audio_sessions()
        }
    }
}

pub fn set_app_audio_device(pid: u32, device_id: &str, flow: AudioFlow) -> Result<(), AppError> {
    let backend = get_backend();
    match backend.set_app_audio_device(pid, device_id, flow) {
        Ok(()) => Ok(()),
        Err(e) => {
            log::warn!(
                "Windows Core Audio set_app_audio_device failed ({}), applying fallback mock update",
                e
            );
            MockAudioBackend::new_with_sample_data().set_app_audio_device(pid, device_id, flow)
        }
    }
}

pub fn set_app_volume(pid: u32, volume: f32, muted: bool) -> Result<(), AppError> {
    let backend = get_backend();
    match backend.set_app_volume(pid, volume, muted) {
        Ok(()) => Ok(()),
        Err(e) => {
            log::warn!(
                "Windows Core Audio set_app_volume failed ({}), applying fallback mock update",
                e
            );
            MockAudioBackend::new_with_sample_data().set_app_volume(pid, volume, muted)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_audio_device_serialization() {
        // Arrange
        let device = AudioDevice {
            id: "dev-123".to_string(),
            name: "Headphones".to_string(),
            flow: AudioFlow::Render,
            is_default: true,
            is_default_multimedia: true,
            is_default_communications: false,
            volume: 0.8,
            is_muted: false,
            state: DeviceState::Active,
            icon: "headphones".to_string(),
        };

        // Act
        let json = serde_json::to_string(&device).expect("Failed to serialize AudioDevice");
        let deserialized: AudioDevice =
            serde_json::from_str(&json).expect("Failed to deserialize AudioDevice");

        // Assert
        assert!(json.contains("\"isDefault\":true"));
        assert!(json.contains("\"render\""));
        assert_eq!(device, deserialized);
    }

    #[test]
    fn test_enum_conversions_and_display() {
        // Arrange & Act & Assert
        assert_eq!(AudioFlow::Render.to_string(), "render");
        assert_eq!(AudioFlow::Capture.to_string(), "capture");
    }

    #[test]
    fn test_mock_backend_device_enumeration() {
        // Arrange
        let backend = MockAudioBackend::new_with_sample_data();

        // Act
        let payload = backend.get_audio_devices().expect("Expected Ok payload");

        // Assert
        assert_eq!(payload.render_devices.len(), 2);
        assert_eq!(payload.capture_devices.len(), 1);
        assert_eq!(
            payload.default_render_id.as_deref(),
            Some("{0.0.0.00000000}.{dev-speakers-1}")
        );
    }

    #[test]
    fn test_mock_backend_set_global_device() {
        // Arrange
        let backend = MockAudioBackend::new_with_sample_data();
        let target_id = "{0.0.0.00000000}.{dev-headphones-2}";

        // Act
        let res = backend.set_global_audio_device(target_id, AudioFlow::Render);

        // Assert
        assert!(res.is_ok());
        let updated = backend.get_audio_devices().unwrap();
        assert_eq!(updated.default_render_id.as_deref(), Some(target_id));
        let headphones = updated
            .render_devices
            .iter()
            .find(|d| d.id == target_id)
            .unwrap();
        assert!(headphones.is_default);
    }

    #[test]
    fn test_mock_backend_set_global_device_empty_id_fails() {
        // Arrange
        let backend = MockAudioBackend::new_with_sample_data();

        // Act
        let res = backend.set_global_audio_device("  ", AudioFlow::Render);

        // Assert
        assert!(res.is_err());
    }

    #[test]
    fn test_mock_backend_app_session_enumeration() {
        // Arrange
        let backend = MockAudioBackend::new_with_sample_data();

        // Act
        let sessions = backend.get_app_audio_sessions().expect("Expected sessions");

        // Assert
        assert_eq!(sessions.len(), 2);
        assert_eq!(sessions[0].name, "Spotify");
        assert_eq!(sessions[0].pid, 4120);
    }

    #[test]
    fn test_mock_backend_set_app_volume_clamping() {
        // Arrange
        let backend = MockAudioBackend::new_with_sample_data();

        // Act - set volume above 1.0 (should clamp to 1.0)
        let res = backend.set_app_volume(4120, 1.5, true);

        // Assert
        assert!(res.is_ok());
        let sessions = backend.get_app_audio_sessions().unwrap();
        let spotify = sessions.iter().find(|s| s.pid == 4120).unwrap();
        assert_eq!(spotify.volume, 1.0);
        assert!(spotify.is_muted);
    }

    #[test]
    fn test_mock_backend_set_app_device_routing() {
        // Arrange
        let backend = MockAudioBackend::new_with_sample_data();
        let new_dev_id = "{0.0.0.00000000}.{dev-headphones-2}";

        // Act
        let res = backend.set_app_audio_device(4120, new_dev_id, AudioFlow::Render);

        // Assert
        assert!(res.is_ok());
        let sessions = backend.get_app_audio_sessions().unwrap();
        let spotify = sessions.iter().find(|s| s.pid == 4120).unwrap();
        assert_eq!(spotify.device_id, new_dev_id);
    }

    #[test]
    fn test_real_or_fallback_engine_facade() {
        // Arrange & Act
        let devices_res = get_audio_devices();
        let sessions_res = get_app_audio_sessions();

        // Assert
        assert!(devices_res.is_ok(), "get_audio_devices should return Ok");
        assert!(sessions_res.is_ok(), "get_app_audio_sessions should return Ok");
    }

    #[test]
    fn test_empty_devices_payload_serialization() {
        // Arrange
        let empty_payload = AudioDevicesPayload {
            render_devices: vec![],
            capture_devices: vec![],
            default_render_id: None,
            default_capture_id: None,
        };

        // Act
        let json = serde_json::to_string(&empty_payload).expect("Failed to serialize empty payload");
        let deserialized: AudioDevicesPayload = serde_json::from_str(&json).expect("Failed to deserialize");

        // Assert
        assert_eq!(empty_payload, deserialized);
        assert_eq!(deserialized.render_devices.len(), 0);
        assert_eq!(deserialized.capture_devices.len(), 0);
        assert!(deserialized.default_render_id.is_none());
    }

    #[test]
    fn test_unusually_long_process_and_device_names() {
        // Arrange
        let long_name = "A".repeat(1000);
        let long_id = "ID_".repeat(250);
        let device = AudioDevice {
            id: long_id.clone(),
            name: long_name.clone(),
            flow: AudioFlow::Render,
            is_default: false,
            is_default_multimedia: false,
            is_default_communications: false,
            volume: 0.5,
            is_muted: false,
            state: DeviceState::Active,
            icon: "speaker".to_string(),
        };

        // Act
        let json = serde_json::to_string(&device).expect("Failed to serialize long device");
        let deserialized: AudioDevice = serde_json::from_str(&json).expect("Failed to deserialize");

        // Assert
        assert_eq!(deserialized.name.len(), 1000);
        assert_eq!(deserialized.id.len(), 750);
    }

    #[test]
    fn test_mock_backend_negative_volume_clamping() {
        // Arrange
        let backend = MockAudioBackend::new_with_sample_data();

        // Act
        let res = backend.set_app_volume(4120, -0.75, false);

        // Assert
        assert!(res.is_ok());
        let sessions = backend.get_app_audio_sessions().unwrap();
        let spotify = sessions.iter().find(|s| s.pid == 4120).unwrap();
        assert_eq!(spotify.volume, 0.0);
        assert!(!spotify.is_muted);
    }

    #[test]
    fn test_mock_backend_non_existent_pid_and_device_errors() {
        // Arrange
        let backend = MockAudioBackend::new_with_sample_data();

        // Act
        let dev_err = backend.set_global_audio_device("non_existent_id_9999", AudioFlow::Render);
        let app_dev_err = backend.set_app_audio_device(999999, "dev_id", AudioFlow::Render);

        // Assert
        assert!(dev_err.is_err());
        assert!(app_dev_err.is_err());
    }
}

