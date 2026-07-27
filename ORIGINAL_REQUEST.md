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
