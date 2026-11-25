pub mod registry;
pub mod services;

#[cfg(test)]
mod tests;

/// Encodes a Rust `&str` as a null-terminated UTF-16 vector for Win32 wide APIs.
#[cfg(windows)]
pub(crate) fn to_u16_vec(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}
