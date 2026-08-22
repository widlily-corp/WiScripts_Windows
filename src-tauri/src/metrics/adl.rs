use super::sensors::{is_valid_temperature, TemperatureSensorInfo};
use std::ffi::c_void;

pub const ADL_OK: i32 = 0;

#[repr(C)]
#[derive(Copy, Clone)]
pub struct ADLAdapterInfo {
    pub size: i32,
    pub adapter_index: i32,
    pub udid: [u8; 256],
    pub bus_number: i32,
    pub device_number: i32,
    pub function_number: i32,
    pub vendor_id: i32,
    pub adapter_name: [u8; 256],
    pub display_name: [u8; 256],
    pub present: i32,
    pub exist: i32,
    pub driver_path: [u8; 256],
    pub driver_path_ext: [u8; 256],
    pub pnp_string: [u8; 256],
    pub os_display_index: i32,
}

impl Default for ADLAdapterInfo {
    fn default() -> Self {
        Self {
            size: std::mem::size_of::<ADLAdapterInfo>() as i32,
            adapter_index: 0,
            udid: [0; 256],
            bus_number: -1,
            device_number: -1,
            function_number: -1,
            vendor_id: 0,
            adapter_name: [0; 256],
            display_name: [0; 256],
            present: 0,
            exist: 0,
            driver_path: [0; 256],
            driver_path_ext: [0; 256],
            pnp_string: [0; 256],
            os_display_index: 0,
        }
    }
}

#[repr(C)]
#[derive(Copy, Clone, Default, Debug, PartialEq, Eq)]
pub struct ADLTemperature {
    pub size: i32,
    pub temperature: i32, // Millidegrees Celsius (e.g. 52000 = 52.0°C)
}

/// Memory allocation callback required by ADL.
/// Uses Win32 HeapAlloc on the process heap for thread-safe memory management.
///
/// # Safety
/// This function is an extern "C" callback invoked by the AMD Display Library DLL.
/// The caller must ensure the returned pointer is appropriately freed by the runtime or process heap.
#[cfg(target_os = "windows")]
pub unsafe extern "C" fn adl_malloc_callback(size: i32) -> *mut c_void {
    if size <= 0 {
        return std::ptr::null_mut();
    }
    use windows::Win32::System::Memory::{GetProcessHeap, HeapAlloc, HEAP_ZERO_MEMORY};
    let heap = match GetProcessHeap() {
        Ok(h) => h,
        Err(_) => return std::ptr::null_mut(),
    };
    if heap.0.is_null() {
        return std::ptr::null_mut();
    }
    HeapAlloc(heap, HEAP_ZERO_MEMORY, size as usize)
}

/// Memory allocation callback fallback for non-Windows platforms.
///
/// # Safety
/// This function allocates raw memory via `std::alloc::alloc_zeroed`.
#[cfg(not(target_os = "windows"))]
pub unsafe extern "C" fn adl_malloc_callback(size: i32) -> *mut c_void {
    if size <= 0 {
        return std::ptr::null_mut();
    }
    let layout = match std::alloc::Layout::from_size_align(size as usize, 8) {
        Ok(l) => l,
        Err(_) => return std::ptr::null_mut(),
    };
    std::alloc::alloc_zeroed(layout) as *mut c_void
}

pub fn parse_c_string_bytes(bytes: &[u8]) -> String {
    let nul_pos = bytes.iter().position(|&b| b == 0).unwrap_or(bytes.len());
    String::from_utf8_lossy(&bytes[..nul_pos]).trim().to_string()
}

pub fn milli_celsius_to_celsius(milli_c: i32) -> f32 {
    milli_c as f32 / 1000.0
}

/// Deduplicates ADL adapters so that multi-display setups on a single physical GPU
/// are collapsed into one unique physical adapter entry.
pub fn deduplicate_adl_adapters(adapters: &[ADLAdapterInfo]) -> Vec<ADLAdapterInfo> {
    let mut result = Vec::new();
    let mut seen_bus_dev = std::collections::HashSet::new();

    for adapter in adapters {
        if adapter.exist == 0 || adapter.present == 0 {
            continue;
        }

        let name = parse_c_string_bytes(&adapter.adapter_name);
        let is_amd = adapter.vendor_id == 0x1002
            || name.to_lowercase().contains("amd")
            || name.to_lowercase().contains("radeon")
            || name.to_lowercase().contains("ati");

        if !is_amd && adapter.vendor_id != 0 {
            continue;
        }

        let key = if adapter.bus_number >= 0 && adapter.device_number >= 0 {
            format!("{}:{}", adapter.bus_number, adapter.device_number)
        } else {
            format!("idx_{}", adapter.adapter_index)
        };

        if seen_bus_dev.insert(key) {
            result.push(*adapter);
        }
    }

    result
}

type AdlMainControlCreate = unsafe extern "C" fn(
    unsafe extern "C" fn(i32) -> *mut c_void,
    i32,
) -> i32;
type AdlMainControlDestroy = unsafe extern "C" fn() -> i32;
type AdlAdapterNumberOfAdaptersGet = unsafe extern "C" fn(*mut i32) -> i32;
type AdlAdapterAdapterInfoGet = unsafe extern "C" fn(*mut ADLAdapterInfo, i32) -> i32;
type AdlOverdrive5TemperatureGet = unsafe extern "C" fn(i32, i32, *mut ADLTemperature) -> i32;
type AdlOverdrive6TemperatureGet = unsafe extern "C" fn(i32, *mut i32) -> i32;

static ADL_MUTEX: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// Queries AMD GPU temperatures dynamically via AMD Display Library (ADL).
/// Supports both 64-bit (`atiadlxx.dll`) and 32-bit (`atiadlxy.dll`).
pub fn query_adl_sensors() -> Vec<TemperatureSensorInfo> {
    let _lock = match ADL_MUTEX.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };
    let mut sensors = Vec::new();

    #[cfg(target_os = "windows")]
    {
        use libloading::Library;

        let lib = unsafe {
            Library::new("atiadlxx.dll")
                .or_else(|_| Library::new("atiadlxy.dll"))
                .or_else(|_| Library::new("C:\\Windows\\System32\\atiadlxx.dll"))
                .or_else(|_| Library::new("C:\\Windows\\System32\\atiadlxy.dll"))
        };

        if let Ok(lib) = lib {
            unsafe {
                let adl_create: Result<libloading::Symbol<AdlMainControlCreate>, _> =
                    lib.get(b"ADL_Main_Control_Create\0");
                let adl_destroy: Result<libloading::Symbol<AdlMainControlDestroy>, _> =
                    lib.get(b"ADL_Main_Control_Destroy\0");
                let adl_num_adapters: Result<libloading::Symbol<AdlAdapterNumberOfAdaptersGet>, _> =
                    lib.get(b"ADL_Adapter_NumberOfAdapters_Get\0");
                let adl_adapter_info: Result<libloading::Symbol<AdlAdapterAdapterInfoGet>, _> =
                    lib.get(b"ADL_Adapter_AdapterInfo_Get\0");

                if let (Ok(create), Ok(destroy), Ok(num_get), Ok(info_get)) =
                    (adl_create, adl_destroy, adl_num_adapters, adl_adapter_info)
                {
                    if create(adl_malloc_callback, 1) == ADL_OK {
                        let mut num_adapters: i32 = 0;
                        if num_get(&mut num_adapters) == ADL_OK && num_adapters > 0 {
                            let total_size = (num_adapters as usize * std::mem::size_of::<ADLAdapterInfo>()) as i32;
                            let mut raw_adapters = vec![ADLAdapterInfo::default(); num_adapters as usize];

                            if info_get(raw_adapters.as_mut_ptr(), total_size) == ADL_OK {
                                let deduped = deduplicate_adl_adapters(&raw_adapters);

                                let adl_od5: Result<libloading::Symbol<AdlOverdrive5TemperatureGet>, _> =
                                    lib.get(b"ADL_Overdrive5_Temperature_Get\0");
                                let adl_od6: Result<libloading::Symbol<AdlOverdrive6TemperatureGet>, _> =
                                    lib.get(b"ADL_Overdrive6_Temperature_Get\0");

                                for (idx, adapter) in deduped.iter().enumerate() {
                                    let mut temp_val = None;

                                    // Try Overdrive 5 first
                                    if let Ok(ref od5) = adl_od5 {
                                        let mut adl_temp = ADLTemperature {
                                            size: std::mem::size_of::<ADLTemperature>() as i32,
                                            temperature: 0,
                                        };
                                        if od5(adapter.adapter_index, 0, &mut adl_temp) == ADL_OK && adl_temp.temperature > 0 {
                                            let temp_c = milli_celsius_to_celsius(adl_temp.temperature);
                                            if is_valid_temperature(temp_c) {
                                                temp_val = Some(temp_c);
                                            }
                                        }
                                    }

                                    // Fallback to Overdrive 6
                                    if temp_val.is_none() {
                                        if let Ok(ref od6) = adl_od6 {
                                            let mut raw_milli_c: i32 = 0;
                                            if od6(adapter.adapter_index, &mut raw_milli_c) == ADL_OK && raw_milli_c > 0 {
                                                let temp_c = milli_celsius_to_celsius(raw_milli_c);
                                                if is_valid_temperature(temp_c) {
                                                    temp_val = Some(temp_c);
                                                }
                                            }
                                        }
                                    }

                                    if let Some(celsius) = temp_val {
                                        let parsed_name = parse_c_string_bytes(&adapter.adapter_name);
                                        let gpu_name = if !parsed_name.is_empty() {
                                            parsed_name
                                        } else {
                                            format!("AMD Radeon GPU #{}", idx)
                                        };

                                        sensors.push(TemperatureSensorInfo {
                                            id: format!("adl_gpu_{}", idx),
                                            name: gpu_name.clone(),
                                            label: format!("{} (Core)", gpu_name),
                                            temperature_celsius: celsius,
                                            sensor_type: "gpu".to_string(),
                                            provider: "AMD ADL DLL".to_string(),
                                        });
                                    }
                                }
                            }
                        }
                        let _ = destroy();
                    }
                }
            }
        }
    }

    sensors
}

/// Fallback CLI query for AMD GPU temperatures via amd-smi.
pub fn query_amd_smi_sensors() -> Vec<TemperatureSensorInfo> {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = std::process::Command::new("amd-smi");
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
        cmd.args([
            "--query-gpu=temperature.gpu,name",
            "--format=csv,noheader,nounits",
        ]);
        let output = super::run_command_with_timeout(cmd, std::time::Duration::from_secs(2));

        if let Some(stdout) = output {
            let mut sensors = Vec::new();
            for (idx, line) in stdout.lines().enumerate() {
                let parts: Vec<&str> = line.split(',').collect();
                if !parts.is_empty() {
                    if let Ok(temp) = parts[0].trim().parse::<f32>() {
                        if is_valid_temperature(temp) {
                            let name = if parts.len() > 1 {
                                parts[1].trim().to_string()
                            } else {
                                format!("AMD Radeon GPU #{}", idx)
                            };
                            sensors.push(TemperatureSensorInfo {
                                id: format!("amd_smi_gpu_{}", idx),
                                name: name.clone(),
                                label: format!("{} (amd-smi)", name),
                                temperature_celsius: temp,
                                sensor_type: "gpu".to_string(),
                                provider: "amd-smi CLI".to_string(),
                            });
                        }
                    }
                }
            }
            return sensors;
        }
    }
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_adl_structures_size_and_alignment() {
        assert_eq!(
            std::mem::size_of::<ADLAdapterInfo>(),
            1572,
            "ADLAdapterInfo must be exactly 1572 bytes matching C ADL SDK"
        );
        assert_eq!(
            std::mem::size_of::<ADLTemperature>(),
            8,
            "ADLTemperature must be exactly 8 bytes matching C ADL SDK"
        );
    }

    #[test]
    fn test_milli_celsius_to_celsius() {
        assert_eq!(milli_celsius_to_celsius(55000), 55.0);
        assert_eq!(milli_celsius_to_celsius(0), 0.0);
        assert_eq!(milli_celsius_to_celsius(68500), 68.5);
    }

    #[test]
    fn test_parse_c_string_bytes() {
        let mut buf = [0u8; 256];
        let name = b"AMD Radeon RX 7900 XTX";
        buf[..name.len()].copy_from_slice(name);
        assert_eq!(parse_c_string_bytes(&buf), "AMD Radeon RX 7900 XTX");

        let empty_buf = [0u8; 256];
        assert_eq!(parse_c_string_bytes(&empty_buf), "");
    }

    #[test]
    fn test_deduplicate_adl_adapters_multi_head() {
        let mut a1_name = [0u8; 256];
        let name = b"AMD Radeon RX 7800 XT";
        a1_name[..name.len()].copy_from_slice(name);
        let a1 = ADLAdapterInfo {
            adapter_index: 0,
            bus_number: 3,
            device_number: 0,
            vendor_id: 0x1002,
            present: 1,
            exist: 1,
            adapter_name: a1_name,
            ..Default::default()
        };

        let mut a2_name = [0u8; 256];
        a2_name[..name.len()].copy_from_slice(name);
        let a2 = ADLAdapterInfo {
            adapter_index: 1,
            bus_number: 3,
            device_number: 0, // Same physical bus/device
            vendor_id: 0x1002,
            present: 1,
            exist: 1,
            adapter_name: a2_name,
            ..Default::default()
        };

        let mut a3_name = [0u8; 256];
        let name2 = b"AMD Radeon RX 6600";
        a3_name[..name2.len()].copy_from_slice(name2);
        let a3 = ADLAdapterInfo {
            adapter_index: 2,
            bus_number: 7,
            device_number: 0, // Different physical GPU
            vendor_id: 0x1002,
            present: 1,
            exist: 1,
            adapter_name: a3_name,
            ..Default::default()
        };

        let a4_inactive = ADLAdapterInfo {
            adapter_index: 3,
            bus_number: 9,
            device_number: 0,
            vendor_id: 0x1002,
            present: 0, // Not present
            exist: 0,
            ..Default::default()
        };

        let adapters = vec![a1, a2, a3, a4_inactive];
        let deduped = deduplicate_adl_adapters(&adapters);

        assert_eq!(deduped.len(), 2);
        assert_eq!(deduped[0].adapter_index, 0);
        assert_eq!(deduped[1].adapter_index, 2);
    }
}
