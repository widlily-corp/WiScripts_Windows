# Original User Request

## Follow-up — 2026-07-23T13:54:43Z

# Teamwork Project Prompt — Draft

Extend the WiScripts Windows application with six premium features: Diagnostics, App Manager, Optimization Profiles, DNS/Network tweaks, Context Menu Manager, and Driver Backup.

Working directory: c:/Users/Widlily/Documents/projects/WiScripts_Windows
Integrity mode: demo

## Requirements

### R1. Advanced Diagnostics & Recovery
Implement a new UI section and backend commands to run `sfc /scannow`, `DISM /Online /Cleanup-Image /RestoreHealth`, and reset the TCP/IP network stack via PowerShell.

### R2. Package & Bloatware Manager
Implement a GUI wrapper for `winget` (search, install, update) and a debloat mechanism to remove pre-installed UWP apps.

### R3. Optimization Profiles (Presets)
Implement 1-click profiles ("Gaming", "Maximum Privacy", "Work") that automatically select and apply a curated list of existing optimization rules.

### R4. DNS & Context Menu Manager
Implement toggles to switch system DNS to AdGuard/Cloudflare/Google, and a toggle to restore the Windows 10 classic context menu.

### R5. Driver Backup
Implement a feature to export all 3rd-party drivers using `Export-WindowsDriver` to a specified folder.

## Acceptance Criteria

### Execution & Compilation
- [ ] Rust code successfully compiles (`cargo check`).
- [ ] Frontend successfully builds (`npm run build`).

### Feature Verification
- [ ] The React frontend contains new tabs/sections for the 5 modules.
- [ ] The Rust backend correctly implements IPC commands (`#[tauri::command]`) for all PowerShell integrations.
- [ ] The `Runner` implementation is correctly utilized for dry-runs and execution tracking.

## Follow-up — 2026-07-26T20:04:20Z

# Teamwork Project Prompt

Реализация полного плана развития (Roadmap) проекта WiScripts Windows: автообновления, управление восстановлением системы, мониторинг ресурсов, локализация, управление автозагрузкой и пользовательские профили. После завершения необходимо закоммитить изменения, отправить их в репозиторий и создать релизный тег.

Working directory: c:\Users\Widlily\Documents\projects\WiScripts_Windows
Integrity mode: development

## Requirements

### R1. Система автообновлений (Auto-Updater)
- Интегрировать `tauri-plugin-updater` для проверки новых релизов на GitHub.
- Настроить получение версии из `tauri.conf.json` через API Tauri для UI.
- Реализовать UI-уведомления (Toast/Banner) о новой версии и тихие обновления в фоне.

### R2. Инструменты, Безопасность и Исправления
- Проверить и исправить отображение иконки приложения (пользователь уже добавлял ее, она есть в корне проекта, но почему-то не отображается).
- Добавить обход региональных блокировок ODT (команда в реестр).
- Реализовать автоматическое создание точек восстановления Windows перед оптимизациями.
- Добавить вкладку для управления (просмотра и отката) точками восстановления.

### R3. Системный мониторинг и управление
- Добавить на Dashboard real-time графики нагрузки CPU, RAM, Disk, Network.
- Добавить датчики температуры процессора/видеокарты.
- Реализовать вкладки для управления автозагрузкой (Startup Apps) и фоновыми задачами (Task Scheduler).

### R4. Кастомизация и профили
- Интегрировать `i18next` (русский, английский).
- Создать вкладку настроек для сохранения тем и дефолтных параметров.
- Реализовать функционал импорта/экспорта пресетов оптимизаций в `.json`.

### R5. Финализация и релиз
- Закоммитить все изменения (с использованием Conventional Commits).
- Выполнить `git push`.
- Создать релизный тег (определить версию из `tauri.conf.json`).

## Acceptance Criteria

### Auto-Updater
- [ ] Приложение успешно компилируется с `tauri-plugin-updater`.
- [ ] Версия в UI совпадает с версией из `tauri.conf.json`.

### Safety & Tools
- [ ] Иконка приложения корректно отображается в системе (панель задач, окно приложения).
- [ ] Команда реестра для ODT присутствует в коде.
- [ ] Создание точки восстановления срабатывает через WMI/PowerShell (или заглушку для dev-окружения).

### Monitoring & Management
- [ ] Графики на Dashboard отображают изменяющиеся данные.
- [ ] Менеджеры автозагрузки и задач успешно получают списки элементов из Windows.

### Customization
- [ ] Смена языка интерфейса применяется без перезагрузки.
- [ ] Профили импортируются и экспортируются в валидный JSON.

### Release
- [ ] Git статус чист, коммиты созданы, тег добавлен и запушен.

## Follow-up — 2026-07-27T12:48:44Z

Реализация "Deep System Engine": Глубокая интеграция с Windows. Архитектурный переход от базовых скриптов PowerShell к прямым, низкоуровневым вызовам WinAPI через Rust для полного контроля над системой (глубокий деблоат, управление службами ядра, мгновенное применение твиков реестра).

Working directory: c:\Users\Widlily\Documents\projects\WiScripts_Windows
Integrity mode: development

## Requirements

### R1. Deep System Integration (Rust WinAPI)
Refactor the core optimization logic in the Rust backend to use direct Windows API calls (e.g., via the `windows` crate) for tasks like registry manipulation and service management. The goal is to bypass the overhead and limitations of PowerShell, achieving maximum execution speed and system access. 

### R2. Automatic Administrator Privileges
Configure the Tauri build process so that the generated Windows application automatically requests Administrator privileges upon launch. This involves creating an `app.manifest` with `requireAdministrator` and embedding it via `build.rs`.

### R3. Safe Execution (System Restore Point)
Implement an automatic System Restore Point creation routine in Rust (via WMI/WinAPI) that runs before any deep system tweaks are applied, ensuring the user can always revert changes safely.

### R4. Robust Verification & Error Handling
Every WinAPI call must include robust error handling. The application must not silently fail; it must programmatically verify that the action was successfully applied (e.g., reading back a registry key immediately after setting it) to guarantee the commands *actually work*.

## Acceptance Criteria

### Deep System Integration
- [ ] At least one core optimization feature is rewritten entirely in Rust using the `windows` crate.
- [ ] A unit test exists in `src-tauri` that verifies the successful execution of a native WinAPI tweak.
- [ ] The code includes a read-back verification step for every state-changing WinAPI call to confirm the change was physically applied to the OS.

### Automatic Administrator Privileges
- [ ] An `app.manifest` file exists in `src-tauri` containing `<requestedExecutionLevel level="requireAdministrator" uiAccess="false"/>`.
- [ ] `build.rs` is configured to embed the manifest into the final executable using `tauri-build`.
- [ ] The app compiles successfully via `cargo check` and `cargo build`.

### Safe Execution
- [ ] The system automatically triggers the creation of a Windows Restore Point before executing WinAPI tweaks, using native Rust calls.
- [ ] A test or function verification exists that validates the successful initiation of a restore point.

## Follow-up — 2026-07-27T07:58:31Z

Пожалуйста, обратите внимание: когда вы закончите реализацию всех требований (R1-R4), убедитесь, что вы закоммитили все изменения в рабочей директории (включая недавние исправления в UI и `tauri.conf.json`, сделанные основным агентом), запушили их в репозиторий и создали новый git tag для релиза, чтобы авто-апдейтер мог подхватить новую версию.


