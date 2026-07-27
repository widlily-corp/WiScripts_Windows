# Original User Request

## 2026-07-26T19:31:18Z

Fix all bugs in WiScripts Windows, ensure all backend optimization and tweaking functions execute for real (not just dry-run), and implement UI warnings for functions that require Administrator privileges.

Working directory: c:\Users\Widlily\Documents\projects\WiScripts_Windows
Integrity mode: development

## Requirements

### R1. Real Execution
Ensure the frontend React application correctly triggers real execution of commands (e.g., passing `dry_run: false` where appropriate or fixing any bugs in `RealRunner`/IPC handlers). All features (diagnostics, package manager, profiles, DNS, driver backup) must work properly.

### R2. Administrator Warnings
Implement clear and informative UI warnings (using existing Tailwind/Lucide design system) for features that require the app to be launched as Administrator. If `is_elevated` is false, warn the user and optionally disable execution buttons for actions that will fail without elevation.

## Acceptance Criteria

### Execution & Build Verification
- [ ] Execution buttons trigger real PowerShell/CMD commands.
- [ ] `cargo check` and `cargo test` pass without errors.
- [ ] `npm run build` succeeds (no TypeScript errors).

### UI / Admin Checks
- [ ] Visual indicators clearly communicate when Admin privileges are missing for system-level operations.
- [ ] No `any` types or "AI-slop" in the new code; strict adherence to the project's coding standards.

## 2026-07-26T20:04:20Z

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
