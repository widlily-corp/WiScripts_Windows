# WiScripts Windows 🚀

An ultimate, open-source Windows Optimization and Tweaking utility. Built with Rust, Tauri, and React for maximum performance, security, and a beautiful user interface.

## 🌟 Features

WiScripts Windows empowers you to take full control of your operating system with a suite of powerful tools:

*   **🛡️ Advanced Diagnostics & Recovery:** Instantly run `sfc /scannow`, `DISM /RestoreHealth`, and reset your TCP/IP network stack via a visual interface.
*   **📦 Package & Bloatware Manager:** Integrated `winget` GUI to search, install, and update your favorite software in bulk. Deeply debloat your system by removing pre-installed UWP telemetry apps.
*   **🗑️ Application Uninstaller:** Discover and remove installed programs (Win32 & 64-bit) reading directly from the Windows Registry with native GUI and silent launch support.
*   **🧹 System Cleaner:** Safely clear temporary files, Windows update cache, and browser data to free up space.
*   **🗄️ Storage Utilities:** Free up disk space with a blazing-fast multi-threaded duplicate file finder (SHA-256) and a large file identifier.
*   **🎮 One-Click Optimization Profiles:** Apply curated presets for specific use cases (Gaming Mode, Maximum Privacy, Office Worker) with a single click.
*   **🌐 DNS & Context Menu Manager:** Switch your system DNS to AdGuard (ad-blocking) or Cloudflare instantly. Restore the classic Windows 10 right-click context menu.
*   **💾 Driver Backup:** Safely backup all your 3rd-party installed drivers before reinstalling Windows.
*   **🌍 Localization:** Full English and Russian interface support (i18n).
*   **🔑 Microsoft Activation:** Seamless integration with MAS for Windows/Office activation.

## 🛠️ Technology Stack

*   **Frontend:** React, TypeScript, Vite. Beautifully designed with custom CSS and modern typography.
*   **Backend:** Rust + Tauri. Ensures blazing fast execution, small binary sizes, and secure memory-safe operations.
*   **System Integration:** Direct PowerShell IPC execution with real-time UI logging and progress tracking.

## 🚀 Installation & Usage

1. Go to the [Releases](https://github.com/widlily-corp/WiScripts_Windows/releases) page.
2. Download the latest `wiscripts_windows.exe`.
3. Run as Administrator (required for system-level tweaks and PowerShell execution).

> **Note on Windows SmartScreen:**
> Because this is a free, open-source tool, it does not currently have a paid code-signing certificate. Windows Defender SmartScreen may show a "Windows protected your PC" warning when you first launch it.
> To proceed, click **"More info"** and then **"Run anyway"**.

## 👨‍💻 Development

Prerequisites:
- [Node.js](https://nodejs.org/)
- [Rust](https://rustup.rs/)

```bash
# Install frontend dependencies
npm install

# Run the app in development mode
npm run tauri dev

# Build the final executable
npm run tauri build
```

## 📝 License

This project is licensed under the MIT License.
