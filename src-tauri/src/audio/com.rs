#![allow(non_snake_case)]

use windows::core::{interface, HRESULT, PCWSTR};
use windows::Win32::Media::Audio::{EDataFlow, ERole};
use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED};

#[interface("f8679f50-850a-41cf-9c72-430f73f2b07e")]
pub unsafe trait IPolicyConfig: windows::core::IUnknown {
    pub unsafe fn GetDeviceFormat(
        &self,
        wszDeviceId: PCWSTR,
        bDefault: i32,
        pWaveFormatEx: *mut std::ffi::c_void,
    ) -> HRESULT;
    pub unsafe fn ResetDeviceFormat(&self, wszDeviceId: PCWSTR) -> HRESULT;
    pub unsafe fn SetDeviceFormat(
        &self,
        wszDeviceId: PCWSTR,
        pEndpointFormat: *mut std::ffi::c_void,
        pMixFormat: *mut std::ffi::c_void,
    ) -> HRESULT;
    pub unsafe fn GetProcessingPeriod(
        &self,
        wszDeviceId: PCWSTR,
        bDefault: i32,
        pftDefaultPeriod: *mut i64,
        pftMinimumPeriod: *mut i64,
    ) -> HRESULT;
    pub unsafe fn SetProcessingPeriod(&self, wszDeviceId: PCWSTR, pftPeriod: *mut i64) -> HRESULT;
    pub unsafe fn GetShareMode(&self, wszDeviceId: PCWSTR, pMode: *mut i32) -> HRESULT;
    pub unsafe fn SetShareMode(&self, wszDeviceId: PCWSTR, pMode: *mut i32) -> HRESULT;
    pub unsafe fn GetPropertyValue(
        &self,
        wszDeviceId: PCWSTR,
        key: *const std::ffi::c_void,
        pv: *mut std::ffi::c_void,
    ) -> HRESULT;
    pub unsafe fn SetPropertyValue(
        &self,
        wszDeviceId: PCWSTR,
        key: *const std::ffi::c_void,
        pv: *const std::ffi::c_void,
    ) -> HRESULT;
    pub unsafe fn SetDefaultEndpoint(&self, wszDeviceId: PCWSTR, eRole: ERole) -> HRESULT;
    pub unsafe fn SetEndpointVisibility(&self, wszDeviceId: PCWSTR, bVisible: i32) -> HRESULT;
}

pub const CLSID_POLICY_CONFIG_CLIENT: windows::core::GUID =
    windows::core::GUID::from_u128(0x87029662_7369_4369_a5a7_0c016c050062);

#[interface("ab21756f-f78b-4bda-8a43-2251d7b61f17")]
pub unsafe trait IAudioPolicyConfig: windows::core::IUnknown {
    pub unsafe fn SetPersistedDefaultAudioEndpoint(
        &self,
        process_id: u32,
        flow: EDataFlow,
        role: ERole,
        device_id: PCWSTR,
    ) -> HRESULT;
    pub unsafe fn GetPersistedDefaultAudioEndpoint(
        &self,
        process_id: u32,
        flow: EDataFlow,
        role: ERole,
        device_id: *mut PCWSTR,
    ) -> HRESULT;
    pub unsafe fn ClearPersistedDefaultAudioEndpoints(&self, process_id: u32) -> HRESULT;
}

pub const CLSID_AUDIO_POLICY_CONFIG_FACTORY: windows::core::GUID =
    windows::core::GUID::from_u128(0x2a59116b_6c48_47e2_a30f_9d1bb5107558);

pub struct ComInitializer {
    need_uninit: bool,
}

impl ComInitializer {
    pub fn new() -> windows::core::Result<Self> {
        unsafe {
            let hr = CoInitializeEx(None, COINIT_MULTITHREADED);
            if hr.is_ok() {
                Ok(Self { need_uninit: true })
            } else if hr.0 == -2147417850 {
                // RPC_E_CHANGED_MODE (0x80010106): COM apartment already initialized in STA mode
                Ok(Self { need_uninit: false })
            } else {
                Err(windows::core::Error::from(hr))
            }
        }
    }
}

impl Drop for ComInitializer {
    fn drop(&mut self) {
        if self.need_uninit {
            unsafe {
                CoUninitialize();
            }
        }
    }
}
