#[cfg(test)]
mod tests {
    use crate::winapi::registry::{delete_key, delete_value, set_binary, set_dword, set_string};

    const TEST_KEY_PATH: &str = "HKCU\\Software\\WiScriptsTest\\UnitTests";

    #[test]
    #[cfg(windows)]
    fn test_winapi_registry_set_dword_and_readback() {
        // Arrange
        let value_name = "TestDwordValue";
        let test_dword = 12345678u32;

        // Act
        let res = set_dword(TEST_KEY_PATH, value_name, test_dword);

        // Assert
        assert!(
            res.is_ok(),
            "set_dword should succeed with readback: {:?}",
            res
        );

        // Clean up
        let del_res = delete_value(TEST_KEY_PATH, value_name);
        assert!(del_res.is_ok(), "delete_value should succeed");
    }

    #[test]
    #[cfg(windows)]
    fn test_winapi_registry_set_string_and_readback() {
        // Arrange
        let value_name = "TestStringValue";
        let test_str = "WiScripts WinAPI String Verification";

        // Act
        let res = set_string(TEST_KEY_PATH, value_name, test_str);

        // Assert
        assert!(
            res.is_ok(),
            "set_string should succeed with readback: {:?}",
            res
        );

        // Clean up
        let del_res = delete_value(TEST_KEY_PATH, value_name);
        assert!(del_res.is_ok(), "delete_value should succeed");
    }

    #[test]
    #[cfg(windows)]
    fn test_winapi_registry_set_binary_and_readback() {
        // Arrange
        let value_name = "TestBinaryValue";
        let test_bytes = vec![0x01, 0x02, 0x03, 0x04, 0x05, 0xAA, 0xBB, 0xCC];

        // Act
        let res = set_binary(TEST_KEY_PATH, value_name, &test_bytes);

        // Assert
        assert!(
            res.is_ok(),
            "set_binary should succeed with readback: {:?}",
            res
        );

        // Clean up
        let del_res = delete_value(TEST_KEY_PATH, value_name);
        assert!(del_res.is_ok(), "delete_value should succeed");
    }

    #[test]
    #[cfg(windows)]
    fn test_winapi_registry_get_dword_and_string_and_key_exists() {
        use crate::winapi::registry::{get_dword, get_string, key_exists, value_exists};

        // Arrange
        let test_sub = format!("{}\\{}", TEST_KEY_PATH, "ReaderTestSub");
        let dword_val_name = "ReaderDword";
        let str_val_name = "ReaderString";
        let expected_dword = 987654u32;
        let expected_str = "TestReaderStringVal";

        let _ = set_dword(&test_sub, dword_val_name, expected_dword).unwrap();
        let _ = set_string(&test_sub, str_val_name, expected_str).unwrap();

        // Act & Assert key_exists
        let exists = key_exists(&test_sub).unwrap();
        assert!(exists, "Key must exist after creation");

        let exists_val = value_exists(&test_sub, dword_val_name).unwrap();
        assert!(exists_val, "Value must exist after creation");

        let not_exists_val = value_exists(&test_sub, "NonExistentValName").unwrap();
        assert!(!not_exists_val, "Non-existent value should return false");

        // Act & Assert get_dword
        let read_dword = get_dword(&test_sub, dword_val_name).unwrap();
        assert_eq!(read_dword, expected_dword);

        // Act & Assert get_string
        let read_str = get_string(&test_sub, str_val_name).unwrap();
        assert_eq!(read_str, expected_str);

        // Non-existent key check
        let missing_key = format!("{}\\{}", TEST_KEY_PATH, "DefinitelyMissingSubKey12345");
        let missing_exists = key_exists(&missing_key).unwrap();
        assert!(!missing_exists, "Missing key must return false");

        // Clean up
        let _ = delete_key(&test_sub);
    }

    #[test]
    #[cfg(windows)]
    fn test_winapi_services_query_functions() {
        use crate::winapi::services::{is_service_disabled, query_service_start_type, query_service_status};

        // Test querying standard Windows services that always exist (e.g. RpcSs, DcomLaunch, or Winmgmt)
        let rpc_start = query_service_start_type("RpcSs");
        assert!(rpc_start.is_ok(), "Querying RpcSs start type must succeed: {:?}", rpc_start);
        let start_type = rpc_start.unwrap();
        assert!(start_type == 2 || start_type == 3 || start_type == 4 || start_type == 0 || start_type == 1);

        let rpc_status = query_service_status("RpcSs");
        assert!(rpc_status.is_ok(), "Querying RpcSs service status must succeed: {:?}", rpc_status);

        let rpc_disabled = is_service_disabled("RpcSs");
        assert!(rpc_disabled.is_ok());

        // Test querying non-existent service
        let non_existent = query_service_start_type("NonExistentService_WiScriptsTest_9999");
        assert!(non_existent.is_err(), "Querying non-existent service start type must return error");

        let non_existent_disabled = is_service_disabled("NonExistentService_WiScriptsTest_9999");
        assert!(non_existent_disabled.is_ok(), "Non-existent service is gracefully treated as disabled");
        assert_eq!(non_existent_disabled.unwrap(), true);
    }
}

