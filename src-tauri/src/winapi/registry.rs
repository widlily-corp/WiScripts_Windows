#[cfg(windows)]
use windows::{
    core::PCWSTR,
    Win32::System::Registry::{
        RegCloseKey, RegCreateKeyExW, RegDeleteKeyW, RegDeleteTreeW, RegDeleteValueW,
        RegOpenKeyExW, RegQueryValueExW, RegSetValueExW, HKEY, HKEY_CLASSES_ROOT,
        HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, HKEY_USERS, KEY_ALL_ACCESS, KEY_READ,
        REG_BINARY, REG_DWORD, REG_OPTION_NON_VOLATILE, REG_SZ, REG_VALUE_TYPE,
    },
};

#[cfg(windows)]
pub fn parse_hive_and_subpath(key_path: &str) -> Result<(HKEY, String), String> {
    let normalized = key_path.replace('/', "\\");
    let trimmed = normalized.trim_end_matches('\\');

    let (hive_str, subpath) = if let Some(pos) = trimmed.find('\\') {
        (&trimmed[..pos], &trimmed[pos + 1..])
    } else {
        (trimmed, "")
    };

    let hive_clean = hive_str.trim_end_matches(':').to_uppercase();

    let hkey = match hive_clean.as_str() {
        "HKLM" | "HKEY_LOCAL_MACHINE" => HKEY_LOCAL_MACHINE,
        "HKCU" | "HKEY_CURRENT_USER" => HKEY_CURRENT_USER,
        "HKCR" | "HKEY_CLASSES_ROOT" => HKEY_CLASSES_ROOT,
        "HKU" | "HKEY_USERS" => HKEY_USERS,
        _ => return Err(format!("Unsupported or invalid registry hive: {}", hive_str)),
    };

    Ok((hkey, subpath.to_string()))
}

fn to_u16_vec(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(windows)]
pub fn set_dword(key_path: &str, value_name: &str, data: u32) -> Result<(), String> {
    let (hkey, subpath) = parse_hive_and_subpath(key_path)?;
    let subpath_u16 = to_u16_vec(&subpath);
    let val_u16 = to_u16_vec(value_name);

    unsafe {
        let mut key_handle = HKEY::default();
        let status = RegCreateKeyExW(
            hkey,
            PCWSTR(subpath_u16.as_ptr()),
            0,
            PCWSTR::null(),
            REG_OPTION_NON_VOLATILE,
            KEY_ALL_ACCESS,
            None,
            &mut key_handle,
            None,
        );

        if status.is_err() {
            return Err(format!("RegCreateKeyExW failed for '{}': {:?}", key_path, status));
        }

        let bytes = data.to_ne_bytes();
        let set_res = RegSetValueExW(
            key_handle,
            PCWSTR(val_u16.as_ptr()),
            0,
            REG_DWORD,
            Some(&bytes),
        );

        if set_res.is_err() {
            let _ = RegCloseKey(key_handle);
            return Err(format!("RegSetValueExW failed for '{}'\\'{}' (DWORD): {:?}", key_path, value_name, set_res));
        }

        // Mandatory Read-Back Verification (R4)
        let mut read_type = REG_VALUE_TYPE::default();
        let mut read_buf = [0u8; 4];
        let mut buf_size = read_buf.len() as u32;

        let query_res = RegQueryValueExW(
            key_handle,
            PCWSTR(val_u16.as_ptr()),
            None,
            Some(&mut read_type),
            Some(read_buf.as_mut_ptr()),
            Some(&mut buf_size),
        );

        let _ = RegCloseKey(key_handle);

        if query_res.is_err() {
            return Err(format!("Read-back verification failed to query value for '{}'\\'{}'", key_path, value_name));
        }

        if read_type != REG_DWORD {
            return Err(format!("Read-back verification failed: type mismatch for '{}'\\'{}' (expected DWORD, got {:?})", key_path, value_name, read_type));
        }

        let read_val = u32::from_ne_bytes(read_buf);
        if read_val != data {
            return Err(format!("Read-back verification failed: value mismatch for '{}'\\'{}' (expected {}, got {})", key_path, value_name, data, read_val));
        }
    }

    Ok(())
}

#[cfg(windows)]
pub fn set_string(key_path: &str, value_name: &str, data: &str) -> Result<(), String> {
    let (hkey, subpath) = parse_hive_and_subpath(key_path)?;
    let subpath_u16 = to_u16_vec(&subpath);
    let val_u16 = to_u16_vec(value_name);
    let data_u16 = to_u16_vec(data);

    unsafe {
        let mut key_handle = HKEY::default();
        let status = RegCreateKeyExW(
            hkey,
            PCWSTR(subpath_u16.as_ptr()),
            0,
            PCWSTR::null(),
            REG_OPTION_NON_VOLATILE,
            KEY_ALL_ACCESS,
            None,
            &mut key_handle,
            None,
        );

        if status.is_err() {
            return Err(format!("RegCreateKeyExW failed for '{}': {:?}", key_path, status));
        }

        let bytes = std::slice::from_raw_parts(
            data_u16.as_ptr() as *const u8,
            data_u16.len() * std::mem::size_of::<u16>(),
        );

        let set_res = RegSetValueExW(
            key_handle,
            PCWSTR(val_u16.as_ptr()),
            0,
            REG_SZ,
            Some(bytes),
        );

        if set_res.is_err() {
            let _ = RegCloseKey(key_handle);
            return Err(format!("RegSetValueExW failed for '{}'\\'{}' (SZ): {:?}", key_path, value_name, set_res));
        }

        // Mandatory Read-Back Verification (R4)
        let mut read_type = REG_VALUE_TYPE::default();
        let mut buf_size = 0u32;

        let _ = RegQueryValueExW(
            key_handle,
            PCWSTR(val_u16.as_ptr()),
            None,
            Some(&mut read_type),
            None,
            Some(&mut buf_size),
        );

        let mut read_buf = vec![0u8; buf_size as usize];
        let query_res = RegQueryValueExW(
            key_handle,
            PCWSTR(val_u16.as_ptr()),
            None,
            Some(&mut read_type),
            Some(read_buf.as_mut_ptr()),
            Some(&mut buf_size),
        );

        let _ = RegCloseKey(key_handle);

        if query_res.is_err() {
            return Err(format!("Read-back verification failed to query string for '{}'\\'{}'", key_path, value_name));
        }

        if read_type != REG_SZ {
            return Err(format!("Read-back verification failed: type mismatch for '{}'\\'{}' (expected SZ, got {:?})", key_path, value_name, read_type));
        }

        let u16_slice = std::slice::from_raw_parts(
            read_buf.as_ptr() as *const u16,
            read_buf.len() / 2,
        );
        let read_str = String::from_utf16_lossy(u16_slice);
        let trimmed_read_str = read_str.trim_matches('\0');

        if trimmed_read_str != data {
            return Err(format!("Read-back verification failed: string mismatch for '{}'\\'{}' (expected '{}', got '{}')", key_path, value_name, data, trimmed_read_str));
        }
    }

    Ok(())
}

#[cfg(windows)]
pub fn set_binary(key_path: &str, value_name: &str, data: &[u8]) -> Result<(), String> {
    let (hkey, subpath) = parse_hive_and_subpath(key_path)?;
    let subpath_u16 = to_u16_vec(&subpath);
    let val_u16 = to_u16_vec(value_name);

    unsafe {
        let mut key_handle = HKEY::default();
        let status = RegCreateKeyExW(
            hkey,
            PCWSTR(subpath_u16.as_ptr()),
            0,
            PCWSTR::null(),
            REG_OPTION_NON_VOLATILE,
            KEY_ALL_ACCESS,
            None,
            &mut key_handle,
            None,
        );

        if status.is_err() {
            return Err(format!("RegCreateKeyExW failed for '{}': {:?}", key_path, status));
        }

        let set_res = RegSetValueExW(
            key_handle,
            PCWSTR(val_u16.as_ptr()),
            0,
            REG_BINARY,
            Some(data),
        );

        if set_res.is_err() {
            let _ = RegCloseKey(key_handle);
            return Err(format!("RegSetValueExW failed for '{}'\\'{}' (BINARY): {:?}", key_path, value_name, set_res));
        }

        // Mandatory Read-Back Verification (R4)
        let mut read_type = REG_VALUE_TYPE::default();
        let mut buf_size = 0u32;

        let _ = RegQueryValueExW(
            key_handle,
            PCWSTR(val_u16.as_ptr()),
            None,
            Some(&mut read_type),
            None,
            Some(&mut buf_size),
        );

        let mut read_buf = vec![0u8; buf_size as usize];
        let query_res = RegQueryValueExW(
            key_handle,
            PCWSTR(val_u16.as_ptr()),
            None,
            Some(&mut read_type),
            Some(read_buf.as_mut_ptr()),
            Some(&mut buf_size),
        );

        let _ = RegCloseKey(key_handle);

        if query_res.is_err() {
            return Err(format!("Read-back verification failed to query binary for '{}'\\'{}'", key_path, value_name));
        }

        if read_type != REG_BINARY {
            return Err(format!("Read-back verification failed: type mismatch for '{}'\\'{}' (expected BINARY, got {:?})", key_path, value_name, read_type));
        }

        if read_buf != data {
            return Err(format!("Read-back verification failed: binary mismatch for '{}'\\'{}'", key_path, value_name));
        }
    }

    Ok(())
}

#[cfg(windows)]
pub fn delete_key(key_path: &str) -> Result<(), String> {
    let (hkey, subpath) = parse_hive_and_subpath(key_path)?;
    let subpath_u16 = to_u16_vec(&subpath);

    unsafe {
        let status = RegDeleteTreeW(hkey, PCWSTR(subpath_u16.as_ptr()));
        if status.is_err() {
            // Try RegDeleteKeyW as fallback if RegDeleteTreeW failed
            let alt_status = RegDeleteKeyW(hkey, PCWSTR(subpath_u16.as_ptr()));
            if alt_status.is_err() {
                return Err(format!("RegDeleteTreeW/RegDeleteKeyW failed for '{}': {:?}", key_path, status));
            }
        }

        // Mandatory Read-Back Verification (R4): Verify key no longer exists
        let mut key_handle = HKEY::default();
        let check_res = RegOpenKeyExW(
            hkey,
            PCWSTR(subpath_u16.as_ptr()),
            0,
            KEY_READ,
            &mut key_handle,
        );

        if check_res.is_ok() {
            let _ = RegCloseKey(key_handle);
            return Err(format!("Read-back verification failed: key '{}' still exists after deletion", key_path));
        }
    }

    Ok(())
}

#[cfg(windows)]
pub fn delete_value(key_path: &str, value_name: &str) -> Result<(), String> {
    let (hkey, subpath) = parse_hive_and_subpath(key_path)?;
    let subpath_u16 = to_u16_vec(&subpath);
    let val_u16 = to_u16_vec(value_name);

    unsafe {
        let mut key_handle = HKEY::default();
        let status = RegOpenKeyExW(
            hkey,
            PCWSTR(subpath_u16.as_ptr()),
            0,
            KEY_ALL_ACCESS,
            &mut key_handle,
        );

        if status.is_err() {
            return Err(format!("RegOpenKeyExW failed for '{}': {:?}", key_path, status));
        }

        let del_res = RegDeleteValueW(key_handle, PCWSTR(val_u16.as_ptr()));
        if del_res.is_err() {
            let _ = RegCloseKey(key_handle);
            return Err(format!("RegDeleteValueW failed for '{}'\\'{}'", key_path, value_name));
        }

        // Mandatory Read-Back Verification (R4): Verify value no longer exists
        let mut read_type = REG_VALUE_TYPE::default();
        let query_res = RegQueryValueExW(
            key_handle,
            PCWSTR(val_u16.as_ptr()),
            None,
            Some(&mut read_type),
            None,
            None,
        );

        let _ = RegCloseKey(key_handle);

        if query_res.is_ok() {
            return Err(format!("Read-back verification failed: value '{}'\\'{}' still exists after deletion", key_path, value_name));
        }
    }

    Ok(())
}

#[cfg(not(windows))]
pub fn set_dword(_key_path: &str, _value_name: &str, _data: u32) -> Result<(), String> {
    Err("WinAPI Registry operations are only supported on Windows".to_string())
}

#[cfg(not(windows))]
pub fn set_string(_key_path: &str, _value_name: &str, _data: &str) -> Result<(), String> {
    Err("WinAPI Registry operations are only supported on Windows".to_string())
}

#[cfg(not(windows))]
pub fn set_binary(_key_path: &str, _value_name: &str, _data: &[u8]) -> Result<(), String> {
    Err("WinAPI Registry operations are only supported on Windows".to_string())
}

#[cfg(not(windows))]
pub fn delete_key(_key_path: &str) -> Result<(), String> {
    Err("WinAPI Registry operations are only supported on Windows".to_string())
}

#[cfg(not(windows))]
pub fn delete_value(_key_path: &str, _value_name: &str) -> Result<(), String> {
    Err("WinAPI Registry operations are only supported on Windows".to_string())
}
