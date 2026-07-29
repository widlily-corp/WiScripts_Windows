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
    fn test_winapi_registry_delete_key_and_readback() {
        // Arrange
        let subkey_path = format!("{}\\{}", TEST_KEY_PATH, "SubKeyToDelete");
        let set_res = set_dword(&subkey_path, "Dummy", 1);
        assert!(set_res.is_ok());

        // Act
        let del_res = delete_key(&subkey_path);

        // Assert
        assert!(
            del_res.is_ok(),
            "delete_key should succeed and verify key non-existence: {:?}",
            del_res
        );
    }
}
