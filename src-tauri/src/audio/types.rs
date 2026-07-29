use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AudioFlow {
    Render,
    Capture,
}

impl std::fmt::Display for AudioFlow {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AudioFlow::Render => write!(f, "render"),
            AudioFlow::Capture => write!(f, "capture"),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AudioRole {
    Console,
    Multimedia,
    Communications,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DeviceState {
    Active,
    Disabled,
    NotPresent,
    Unplugged,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AudioDevice {
    pub id: String,
    pub name: String,
    pub flow: AudioFlow,
    pub is_default: bool,
    pub is_default_multimedia: bool,
    pub is_default_communications: bool,
    pub volume: f32,
    pub is_muted: bool,
    pub state: DeviceState,
    pub icon: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AudioDevicesPayload {
    pub render_devices: Vec<AudioDevice>,
    pub capture_devices: Vec<AudioDevice>,
    pub default_render_id: Option<String>,
    pub default_capture_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AppAudioSession {
    pub pid: u32,
    pub name: String,
    pub session_id: String,
    pub volume: f32,
    pub is_muted: bool,
    pub device_id: String,
    pub flow: AudioFlow,
    pub icon: Option<String>,
}
