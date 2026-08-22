#[cfg(windows)]
use windows::{
    core::PCWSTR,
    Win32::System::Services::{
        ChangeServiceConfigW, CloseServiceHandle, ControlService, OpenSCManagerW, OpenServiceW,
        QueryServiceConfigW, QueryServiceStatusEx, SC_MANAGER_ALL_ACCESS, SC_STATUS_PROCESS_INFO,
        SERVICE_CHANGE_CONFIG, SERVICE_CONTROL_STOP, SERVICE_ERROR, SERVICE_NO_CHANGE,
        SERVICE_QUERY_CONFIG, SERVICE_QUERY_STATUS, SERVICE_START_TYPE, SERVICE_STATUS_PROCESS,
        SERVICE_STOP, SERVICE_STOPPED, SERVICE_STOP_PENDING,
    },
};

fn to_u16_vec(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(windows)]
pub fn configure_service(service_name: &str, start_type: u32) -> Result<(), String> {
    let name_u16 = to_u16_vec(service_name);

    unsafe {
        let scm_handle = OpenSCManagerW(PCWSTR::null(), PCWSTR::null(), SC_MANAGER_ALL_ACCESS)
            .map_err(|e| {
                format!(
                    "OpenSCManagerW failed for service '{}': {:?}",
                    service_name, e
                )
            })?;

        let svc_handle = match OpenServiceW(
            scm_handle,
            PCWSTR(name_u16.as_ptr()),
            SERVICE_CHANGE_CONFIG | SERVICE_QUERY_CONFIG,
        ) {
            Ok(h) => h,
            Err(e) => {
                let _ = CloseServiceHandle(scm_handle);
                let err_str = format!("{:?}", e);
                if err_str.contains("1060") || err_str.contains("0x80070424") {
                    return Ok(());
                }
                return Err(format!(
                    "OpenServiceW failed for service '{}': {}",
                    service_name, err_str
                ));
            }
        };

        let target_start = SERVICE_START_TYPE(start_type);

        let change_res = ChangeServiceConfigW(
            svc_handle,
            windows::Win32::System::Services::ENUM_SERVICE_TYPE(SERVICE_NO_CHANGE),
            target_start,
            SERVICE_ERROR(SERVICE_NO_CHANGE),
            PCWSTR::null(),
            PCWSTR::null(),
            None,
            PCWSTR::null(),
            PCWSTR::null(),
            PCWSTR::null(),
            PCWSTR::null(),
        );

        if let Err(e) = change_res {
            let _ = CloseServiceHandle(svc_handle);
            let _ = CloseServiceHandle(scm_handle);
            return Err(format!(
                "ChangeServiceConfigW failed for service '{}': {:?}",
                service_name, e
            ));
        }

        // Mandatory Read-Back Verification (R4)
        let mut bytes_needed = 0u32;
        let _ = QueryServiceConfigW(svc_handle, None, 0, &mut bytes_needed);

        let mut config_buf = vec![0u64; (bytes_needed as usize).div_ceil(8)];
        let config_ptr =
            config_buf.as_mut_ptr() as *mut windows::Win32::System::Services::QUERY_SERVICE_CONFIGW;

        let query_res = QueryServiceConfigW(
            svc_handle,
            Some(config_ptr),
            bytes_needed,
            &mut bytes_needed,
        );

        let _ = CloseServiceHandle(svc_handle);
        let _ = CloseServiceHandle(scm_handle);

        if let Err(e) = query_res {
            return Err(format!(
                "Read-back verification failed to query service config for '{}': {:?}",
                service_name, e
            ));
        }

        let current_start_type = (*config_ptr).dwStartType;
        if current_start_type != target_start {
            return Err(format!(
                "Read-back verification failed: start type mismatch for service '{}' (expected {}, got {})",
                service_name, start_type, current_start_type.0
            ));
        }
    }

    Ok(())
}

#[cfg(windows)]
pub fn stop_service(service_name: &str) -> Result<(), String> {
    let name_u16 = to_u16_vec(service_name);

    unsafe {
        let scm_handle = OpenSCManagerW(PCWSTR::null(), PCWSTR::null(), SC_MANAGER_ALL_ACCESS)
            .map_err(|e| {
                format!(
                    "OpenSCManagerW failed for service '{}': {:?}",
                    service_name, e
                )
            })?;

        let svc_handle = match OpenServiceW(
            scm_handle,
            PCWSTR(name_u16.as_ptr()),
            SERVICE_STOP | SERVICE_QUERY_STATUS,
        ) {
            Ok(h) => h,
            Err(e) => {
                let _ = CloseServiceHandle(scm_handle);
                let err_str = format!("{:?}", e);
                if err_str.contains("1060") || err_str.contains("0x80070424") {
                    return Ok(());
                }
                return Err(format!(
                    "OpenServiceW failed for service '{}': {}",
                    service_name, err_str
                ));
            }
        };

        let mut status_process = SERVICE_STATUS_PROCESS::default();
        let mut bytes_needed = 0u32;
        let status_slice = std::slice::from_raw_parts_mut(
            (&mut status_process as *mut SERVICE_STATUS_PROCESS) as *mut u8,
            std::mem::size_of::<SERVICE_STATUS_PROCESS>(),
        );

        let status_res = QueryServiceStatusEx(
            svc_handle,
            SC_STATUS_PROCESS_INFO,
            Some(status_slice),
            &mut bytes_needed,
        );

        if status_res.is_ok() && status_process.dwCurrentState == SERVICE_STOPPED {
            let _ = CloseServiceHandle(svc_handle);
            let _ = CloseServiceHandle(scm_handle);
            return Ok(());
        }

        let mut service_status = windows::Win32::System::Services::SERVICE_STATUS::default();
        let control_res = ControlService(svc_handle, SERVICE_CONTROL_STOP, &mut service_status);

        if let Err(e) = control_res {
            // Re-query status in case it was already stopped
            let _ = QueryServiceStatusEx(
                svc_handle,
                SC_STATUS_PROCESS_INFO,
                Some(status_slice),
                &mut bytes_needed,
            );

            if status_process.dwCurrentState != SERVICE_STOPPED {
                let _ = CloseServiceHandle(svc_handle);
                let _ = CloseServiceHandle(scm_handle);
                return Err(format!(
                    "ControlService STOP failed for service '{}': {:?}",
                    service_name, e
                ));
            }
        }

        // Mandatory Read-Back Verification (R4): Verify service enters STOPPED or STOP_PENDING state
        let mut final_status = SERVICE_STATUS_PROCESS::default();
        let final_slice = std::slice::from_raw_parts_mut(
            (&mut final_status as *mut SERVICE_STATUS_PROCESS) as *mut u8,
            std::mem::size_of::<SERVICE_STATUS_PROCESS>(),
        );

        let query_res = QueryServiceStatusEx(
            svc_handle,
            SC_STATUS_PROCESS_INFO,
            Some(final_slice),
            &mut bytes_needed,
        );

        let _ = CloseServiceHandle(svc_handle);
        let _ = CloseServiceHandle(scm_handle);

        if let Err(e) = query_res {
            return Err(format!(
                "Read-back verification failed to query status after stopping service '{}': {:?}",
                service_name, e
            ));
        }

        if final_status.dwCurrentState != SERVICE_STOPPED
            && final_status.dwCurrentState != SERVICE_STOP_PENDING
        {
            return Err(format!(
                "Read-back verification failed: service '{}' is in state {:?}, not STOPPED",
                service_name, final_status.dwCurrentState
            ));
        }
    }

    Ok(())
}

#[cfg(windows)]
pub fn start_service(service_name: &str) -> Result<(), String> {
    let name_u16 = to_u16_vec(service_name);

    unsafe {
        let scm_handle = OpenSCManagerW(PCWSTR::null(), PCWSTR::null(), SC_MANAGER_ALL_ACCESS)
            .map_err(|e| {
                format!(
                    "OpenSCManagerW failed for service '{}': {:?}",
                    service_name, e
                )
            })?;

        let svc_handle = match OpenServiceW(
            scm_handle,
            PCWSTR(name_u16.as_ptr()),
            windows::Win32::System::Services::SERVICE_START | SERVICE_QUERY_STATUS,
        ) {
            Ok(h) => h,
            Err(e) => {
                let _ = CloseServiceHandle(scm_handle);
                let err_str = format!("{:?}", e);
                if err_str.contains("1060") || err_str.contains("0x80070424") {
                    return Ok(());
                }
                return Err(format!(
                    "OpenServiceW failed for service '{}': {}",
                    service_name, err_str
                ));
            }
        };

        let start_res = windows::Win32::System::Services::StartServiceW(svc_handle, None);
        let _ = CloseServiceHandle(svc_handle);
        let _ = CloseServiceHandle(scm_handle);

        if let Err(e) = start_res {
            let err_str = format!("{:?}", e);
            // 1056 is ERROR_SERVICE_ALREADY_RUNNING
            if !err_str.contains("1056") {
                return Err(format!(
                    "StartServiceW failed for service '{}': {}",
                    service_name, err_str
                ));
            }
        }
    }

    Ok(())
}

#[cfg(windows)]
pub fn query_service_start_type(service_name: &str) -> Result<u32, String> {
    let name_u16 = to_u16_vec(service_name);

    unsafe {
        let scm_handle = OpenSCManagerW(
            PCWSTR::null(),
            PCWSTR::null(),
            windows::Win32::System::Services::SC_MANAGER_CONNECT,
        )
        .map_err(|e| {
            format!(
                "OpenSCManagerW failed for service '{}': {:?}",
                service_name, e
            )
        })?;

        let svc_handle = match OpenServiceW(
            scm_handle,
            PCWSTR(name_u16.as_ptr()),
            SERVICE_QUERY_CONFIG,
        ) {
            Ok(h) => h,
            Err(e) => {
                let _ = CloseServiceHandle(scm_handle);
                return Err(format!(
                    "OpenServiceW failed for service '{}': {:?}",
                    service_name, e
                ));
            }
        };

        let mut bytes_needed = 0u32;
        let _ = QueryServiceConfigW(svc_handle, None, 0, &mut bytes_needed);
        if bytes_needed == 0 {
            let _ = CloseServiceHandle(svc_handle);
            let _ = CloseServiceHandle(scm_handle);
            return Err(format!(
                "QueryServiceConfigW returned 0 bytes needed for '{}'",
                service_name
            ));
        }

        let mut config_buf = vec![0u64; (bytes_needed as usize).div_ceil(8)];
        let config_ptr =
            config_buf.as_mut_ptr() as *mut windows::Win32::System::Services::QUERY_SERVICE_CONFIGW;

        let query_res = QueryServiceConfigW(
            svc_handle,
            Some(config_ptr),
            bytes_needed,
            &mut bytes_needed,
        );

        let _ = CloseServiceHandle(svc_handle);
        let _ = CloseServiceHandle(scm_handle);

        if let Err(e) = query_res {
            return Err(format!(
                "QueryServiceConfigW failed for service '{}': {:?}",
                service_name, e
            ));
        }

        let start_type = (*config_ptr).dwStartType.0;
        Ok(start_type)
    }
}

#[cfg(windows)]
pub fn is_service_disabled(service_name: &str) -> Result<bool, String> {
    match query_service_start_type(service_name) {
        Ok(start_type) => Ok(start_type == 4),
        Err(e) => {
            if e.contains("1060") || e.contains("0x80070424") || e.to_lowercase().contains("does not exist") {
                Ok(true)
            } else {
                Err(e)
            }
        }
    }
}

#[cfg(windows)]
pub fn query_service_status(service_name: &str) -> Result<u32, String> {
    let name_u16 = to_u16_vec(service_name);

    unsafe {
        let scm_handle = OpenSCManagerW(
            PCWSTR::null(),
            PCWSTR::null(),
            windows::Win32::System::Services::SC_MANAGER_CONNECT,
        )
        .map_err(|e| {
            format!(
                "OpenSCManagerW failed for service '{}': {:?}",
                service_name, e
            )
        })?;

        let svc_handle = match OpenServiceW(
            scm_handle,
            PCWSTR(name_u16.as_ptr()),
            SERVICE_QUERY_STATUS,
        ) {
            Ok(h) => h,
            Err(e) => {
                let _ = CloseServiceHandle(scm_handle);
                return Err(format!(
                    "OpenServiceW failed for service '{}': {:?}",
                    service_name, e
                ));
            }
        };

        let mut status_process = SERVICE_STATUS_PROCESS::default();
        let mut bytes_needed = 0u32;
        let status_slice = std::slice::from_raw_parts_mut(
            (&mut status_process as *mut SERVICE_STATUS_PROCESS) as *mut u8,
            std::mem::size_of::<SERVICE_STATUS_PROCESS>(),
        );

        let status_res = QueryServiceStatusEx(
            svc_handle,
            SC_STATUS_PROCESS_INFO,
            Some(status_slice),
            &mut bytes_needed,
        );

        let _ = CloseServiceHandle(svc_handle);
        let _ = CloseServiceHandle(scm_handle);

        if let Err(e) = status_res {
            return Err(format!(
                "QueryServiceStatusEx failed for service '{}': {:?}",
                service_name, e
            ));
        }

        Ok(status_process.dwCurrentState.0)
    }
}

#[cfg(not(windows))]
pub fn configure_service(_service_name: &str, _start_type: u32) -> Result<(), String> {
    Err("WinAPI Service operations are only supported on Windows".to_string())
}

#[cfg(not(windows))]
pub fn stop_service(_service_name: &str) -> Result<(), String> {
    Err("WinAPI Service operations are only supported on Windows".to_string())
}

#[cfg(not(windows))]
pub fn query_service_start_type(_service_name: &str) -> Result<u32, String> {
    Err("WinAPI Service operations are only supported on Windows".to_string())
}

#[cfg(not(windows))]
pub fn is_service_disabled(_service_name: &str) -> Result<bool, String> {
    Err("WinAPI Service operations are only supported on Windows".to_string())
}

#[cfg(not(windows))]
pub fn query_service_status(_service_name: &str) -> Result<u32, String> {
    Err("WinAPI Service operations are only supported on Windows".to_string())
}

#[cfg(not(windows))]
pub fn start_service(_service_name: &str) -> Result<(), String> {
    Err("WinAPI Service operations are only supported on Windows".to_string())
}

