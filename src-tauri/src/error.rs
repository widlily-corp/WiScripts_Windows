use serde::ser::SerializeStruct;
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Execution failed: {0}")]
    Execution(String),
    #[error("Invalid configuration: {0}")]
    InvalidConfig(String),
    #[error("IO error: {0}")]
    Io(String),
    #[error("System error: {0}")]
    System(String),
}

impl AppError {
    pub fn code(&self) -> &'static str {
        match self {
            AppError::Execution(_) => "EXECUTION_ERROR",
            AppError::InvalidConfig(_) => "INVALID_CONFIG",
            AppError::Io(_) => "IO_ERROR",
            AppError::System(_) => "SYSTEM_ERROR",
        }
    }

    pub fn i18n_key(&self) -> &'static str {
        match self {
            AppError::Execution(_) => "errors.execution",
            AppError::InvalidConfig(_) => "errors.invalidConfig",
            AppError::Io(_) => "errors.io",
            AppError::System(_) => "errors.system",
        }
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let mut state = serializer.serialize_struct("AppError", 3)?;
        state.serialize_field("code", self.code())?;
        state.serialize_field("key", self.i18n_key())?;
        state.serialize_field("message", &self.to_string())?;
        state.end()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_app_error_structured_serialization() {
        let err = AppError::InvalidConfig("bad path".to_string());
        let val: serde_json::Value = serde_json::to_value(&err).unwrap();
        assert_eq!(val["code"], "INVALID_CONFIG");
        assert_eq!(val["key"], "errors.invalidConfig");
        assert_eq!(val["message"], "Invalid configuration: bad path");

        let exec_err = AppError::Execution("boom".to_string());
        let exec_val: serde_json::Value = serde_json::to_value(&exec_err).unwrap();
        assert_eq!(exec_val["code"], "EXECUTION_ERROR");
        assert_eq!(exec_val["key"], "errors.execution");
        assert_eq!(exec_val["message"], "Execution failed: boom");
    }
}
