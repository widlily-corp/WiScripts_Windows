#![allow(non_snake_case)]

use windows::core::{interface, GUID, HRESULT, HSTRING, PCWSTR};
use windows::Win32::Foundation::E_NOINTERFACE;
use windows::Win32::Media::Audio::{EDataFlow, ERole};
use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED};
use windows::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};

#[interface("f8679f50-850a-41cf-9c72-430f73f2b07e")]
pub unsafe trait IPolicyConfig: windows::core::IUnknown {
    pub unsafe fn GetMixFormat(
        &self,
        wszDeviceId: PCWSTR,
        ppFormat: *mut std::ffi::c_void,
    ) -> HRESULT;
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
        bFxStore: i32,
        key: *const std::ffi::c_void,
        pv: *mut std::ffi::c_void,
    ) -> HRESULT;
    pub unsafe fn SetPropertyValue(
        &self,
        wszDeviceId: PCWSTR,
        bFxStore: i32,
        key: *const std::ffi::c_void,
        pv: *const std::ffi::c_void,
    ) -> HRESULT;
    pub unsafe fn SetDefaultEndpoint(&self, wszDeviceId: PCWSTR, eRole: ERole) -> HRESULT;
    pub unsafe fn SetEndpointVisibility(&self, wszDeviceId: PCWSTR, bVisible: i32) -> HRESULT;
}

/// Official Windows CPolicyConfigClient CLSID ({870af99c-171d-4f9e-af0d-e63df40c2bc9})
pub const CLSID_POLICY_CONFIG_CLIENT: GUID =
    GUID::from_u128(0x870af99c_171d_4f9e_af0d_e63df40c2bc9);

/// WinRT IAudioPolicyConfigFactory IID for Windows 10 1803..21H1 (slot 25 = SetPersistedDefaultAudioEndpoint)
pub const IID_IAUDIO_POLICY_CONFIG_DOWNLEVEL: GUID =
    GUID::from_u128(0x2a59116d_6c4f_45e0_a74f_707e3fef9258);

/// WinRT IAudioPolicyConfigFactory IID for Windows 10 21H2+ and Windows 11 (slot 26 = SetPersistedDefaultAudioEndpoint)
pub const IID_IAUDIO_POLICY_CONFIG_21H2: GUID =
    GUID::from_u128(0xab3d4648_e242_459f_b02f_541c70306324);

/// WinRT IAudioPolicyConfigFactory (Windows 10 RS4..21H1 layout).
/// Inherits IUnknown (0..2) + IInspectable (3..5) + 19 preceding internal methods (6..24) before slot 25.
#[interface("2a59116d-6c4f-45e0-a74f-707e3fef9258")]
pub unsafe trait IAudioPolicyConfigDownlevel: windows::core::IUnknown {
    pub unsafe fn GetIids(&self, iid_count: *mut u32, iids: *mut *mut GUID) -> HRESULT;
    pub unsafe fn GetRuntimeClassName(&self, class_name: *mut *mut std::ffi::c_void) -> HRESULT;
    pub unsafe fn GetTrustLevel(&self, trust_level: *mut i32) -> HRESULT;
    pub unsafe fn _reserved_06(&self) -> HRESULT;
    pub unsafe fn _reserved_07(&self) -> HRESULT;
    pub unsafe fn _reserved_08(&self) -> HRESULT;
    pub unsafe fn _reserved_09(&self) -> HRESULT;
    pub unsafe fn _reserved_10(&self) -> HRESULT;
    pub unsafe fn _reserved_11(&self) -> HRESULT;
    pub unsafe fn _reserved_12(&self) -> HRESULT;
    pub unsafe fn _reserved_13(&self) -> HRESULT;
    pub unsafe fn _reserved_14(&self) -> HRESULT;
    pub unsafe fn _reserved_15(&self) -> HRESULT;
    pub unsafe fn _reserved_16(&self) -> HRESULT;
    pub unsafe fn _reserved_17(&self) -> HRESULT;
    pub unsafe fn _reserved_18(&self) -> HRESULT;
    pub unsafe fn _reserved_19(&self) -> HRESULT;
    pub unsafe fn _reserved_20(&self) -> HRESULT;
    pub unsafe fn _reserved_21(&self) -> HRESULT;
    pub unsafe fn _reserved_22(&self) -> HRESULT;
    pub unsafe fn _reserved_23(&self) -> HRESULT;
    pub unsafe fn _reserved_24(&self) -> HRESULT;
    pub unsafe fn SetPersistedDefaultAudioEndpoint(
        &self,
        process_id: u32,
        flow: EDataFlow,
        role: ERole,
        device_id: *mut std::ffi::c_void,
    ) -> HRESULT;
    pub unsafe fn GetPersistedDefaultAudioEndpoint(
        &self,
        process_id: u32,
        flow: EDataFlow,
        role: ERole,
        device_id: *mut *mut std::ffi::c_void,
    ) -> HRESULT;
    pub unsafe fn ClearAllPersistedApplicationDefaultEndpoints(&self) -> HRESULT;
}

/// WinRT IAudioPolicyConfigFactory (Windows 10 21H2+ / Windows 11 layout).
/// Inherits IUnknown (0..2) + IInspectable (3..5) + 20 preceding internal methods (6..25) before slot 26.
#[interface("ab3d4648-e242-459f-b02f-541c70306324")]
pub unsafe trait IAudioPolicyConfig21H2: windows::core::IUnknown {
    pub unsafe fn GetIids(&self, iid_count: *mut u32, iids: *mut *mut GUID) -> HRESULT;
    pub unsafe fn GetRuntimeClassName(&self, class_name: *mut *mut std::ffi::c_void) -> HRESULT;
    pub unsafe fn GetTrustLevel(&self, trust_level: *mut i32) -> HRESULT;
    pub unsafe fn _reserved_06(&self) -> HRESULT;
    pub unsafe fn _reserved_07(&self) -> HRESULT;
    pub unsafe fn _reserved_08(&self) -> HRESULT;
    pub unsafe fn _reserved_09(&self) -> HRESULT;
    pub unsafe fn _reserved_10(&self) -> HRESULT;
    pub unsafe fn _reserved_11(&self) -> HRESULT;
    pub unsafe fn _reserved_12(&self) -> HRESULT;
    pub unsafe fn _reserved_13(&self) -> HRESULT;
    pub unsafe fn _reserved_14(&self) -> HRESULT;
    pub unsafe fn _reserved_15(&self) -> HRESULT;
    pub unsafe fn _reserved_16(&self) -> HRESULT;
    pub unsafe fn _reserved_17(&self) -> HRESULT;
    pub unsafe fn _reserved_18(&self) -> HRESULT;
    pub unsafe fn _reserved_19(&self) -> HRESULT;
    pub unsafe fn _reserved_20(&self) -> HRESULT;
    pub unsafe fn _reserved_21(&self) -> HRESULT;
    pub unsafe fn _reserved_22(&self) -> HRESULT;
    pub unsafe fn _reserved_23(&self) -> HRESULT;
    pub unsafe fn _reserved_24(&self) -> HRESULT;
    pub unsafe fn _reserved_25(&self) -> HRESULT;
    pub unsafe fn SetPersistedDefaultAudioEndpoint(
        &self,
        process_id: u32,
        flow: EDataFlow,
        role: ERole,
        device_id: *mut std::ffi::c_void,
    ) -> HRESULT;
    pub unsafe fn GetPersistedDefaultAudioEndpoint(
        &self,
        process_id: u32,
        flow: EDataFlow,
        role: ERole,
        device_id: *mut *mut std::ffi::c_void,
    ) -> HRESULT;
    pub unsafe fn ClearAllPersistedApplicationDefaultEndpoints(&self) -> HRESULT;
}

type RoGetActivationFactoryFn = unsafe extern "system" fn(
    activatable_class_id: *mut std::ffi::c_void,
    iid: *const GUID,
    factory: *mut *mut std::ffi::c_void,
) -> HRESULT;

/// Activates `Windows.Media.Internal.AudioPolicyConfig` via `RoGetActivationFactory`
/// and invokes `SetPersistedDefaultAudioEndpoint` using the OS-appropriate WinRT vtable.
pub unsafe fn set_persisted_default_audio_endpoint(
    process_id: u32,
    flow: EDataFlow,
    role: ERole,
    device_id: &str,
) -> HRESULT {
    let combase = match LoadLibraryW(windows::core::w!("combase.dll")) {
        Ok(h) => h,
        Err(e) => return e.code(),
    };

    let proc_addr = match GetProcAddress(combase, windows::core::s!("RoGetActivationFactory")) {
        Some(p) => p,
        None => return windows::Win32::Foundation::E_FAIL,
    };

    let ro_get_activation_factory: RoGetActivationFactoryFn = std::mem::transmute(proc_addr);
    let class_id = HSTRING::from("Windows.Media.Internal.AudioPolicyConfig");
    let class_id_abi: *mut std::ffi::c_void = std::mem::transmute_copy(&class_id);

    let dev_hstring = HSTRING::from(device_id);
    let dev_abi: *mut std::ffi::c_void = std::mem::transmute_copy(&dev_hstring);

    let mut raw_factory: *mut std::ffi::c_void = std::ptr::null_mut();
    let hr_21h2 = ro_get_activation_factory(
        class_id_abi,
        &IID_IAUDIO_POLICY_CONFIG_21H2,
        &mut raw_factory,
    );

    if hr_21h2.is_ok() && !raw_factory.is_null() {
        let factory: IAudioPolicyConfig21H2 = std::mem::transmute(raw_factory);
        return factory.SetPersistedDefaultAudioEndpoint(process_id, flow, role, dev_abi);
    }

    if hr_21h2 != E_NOINTERFACE {
        return hr_21h2;
    }

    let mut raw_downlevel: *mut std::ffi::c_void = std::ptr::null_mut();
    let hr_downlevel = ro_get_activation_factory(
        class_id_abi,
        &IID_IAUDIO_POLICY_CONFIG_DOWNLEVEL,
        &mut raw_downlevel,
    );

    if hr_downlevel.is_ok() && !raw_downlevel.is_null() {
        let factory: IAudioPolicyConfigDownlevel = std::mem::transmute(raw_downlevel);
        return factory.SetPersistedDefaultAudioEndpoint(process_id, flow, role, dev_abi);
    }

    hr_downlevel
}

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
