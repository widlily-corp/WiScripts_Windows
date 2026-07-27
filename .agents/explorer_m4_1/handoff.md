# Milestone 4 Handoff Report: i18next Localization Integration (RU/EN)

**Explorer**: Explorer M4-1 (i18next Localization Explorer)  
**Target Report File**: `c:\Users\Widlily\Documents\projects\WiScripts_Windows\.agents\explorer_m4_1\handoff.md`  
**Date**: 2026-07-27  
**Status**: Completed  

---

## 1. Observation

Direct observations from examining the codebase:

1. **Current Package Dependencies (`package.json`)**:
   - Lines 12–21: Dependencies currently consist of `@tauri-apps/api`, `@tauri-apps/plugin-opener`, `@tauri-apps/plugin-process`, `@tauri-apps/plugin-updater`, `lucide-react`, `react`, `react-dom`, and `zustand`.
   - `i18next`, `react-i18next`, and `i18next-browser-languagedetector` are currently missing.

2. **Zustand Application Store (`src/store/useAppStore.ts`)**:
   - Lines 41–184: `AppState` interface manages tab routing, update status, system info, optimization catalog, metrics polling, startup items, scheduled tasks, restore points, ODT/MAS states, and toast notifications.
   - Lines 1266–1278: `partialize` persists `dryRunMode`, `autoCheckUpdates`, `odtConfig`, `selectedMasMethod`, `driverBackupPath`, `selectedDnsProvider` under key `'wiscripts-app-store'`.
   - No `language` property or `setLanguage` action exists in `AppState` currently.

3. **Existing UI Components & Hardcoded Text**:
   - `src/components/Navigation.tsx` (Lines 29–43): Hardcoded navigation labels (`Dashboard`, `Optimizations`, `Package Manager`, `Optimization Presets`, `Startup Apps`, `Task Scheduler`, `DNS & Context Menu`, `Driver Backup`, `Diagnostics & Health`, `Office ODT`, `Activation MAS`, `Restore Points`, `Settings`).
   - `src/components/Header.tsx` (Lines 7–18): `TAB_TITLES` dictionary with hardcoded English titles.
   - `src/components/Dashboard.tsx` (Lines 64–71, 91–93, 101, 152–225): Hardcoded texts like `"System Optimization Readiness"`, `"Real-Time System Telemetry & Hardware Probe"`, `"CPU Usage"`, `"RAM Usage"`, `"Disk Read Rate"`, `"Network RX"`, sensor titles, etc.
   - `src/components/OptimizationView.tsx` (Lines 25–33, 158, 206–222): Category tab labels, preset buttons (`Recommended`, `Telemetry-Only`, `Full Debloat`), risk badges (`High Risk`, `Medium Risk`, `Low Risk`), and execution buttons.
   - `src/components/StartupView.tsx` (Lines 72 font, 100–117 metrics, 157–164 headers): Labels like `"Startup Apps Manager"`, `"Total Startup Apps"`, `"Enabled"`, `"Disabled"`, location filters, and action titles.
   - `src/components/SchedulerView.tsx` (Lines 98, 126 font, 178 font, 207 font): Labels like `"Task Scheduler Manager"`, `"Telemetry Only"`, status badges (`Ready`, `Disabled`, `Running`).
   - `src/components/RestorePointsView.tsx` (Lines 85, 108, 147, 205): `"System Restore Manager"`, `"Create New Restore Point"`, `"Available System Checkpoints"`, table headers, and confirmation modal texts.
   - `src/components/SettingsView.tsx` (Lines 36, 51, 85, 154, 181, 211): Section cards for `"Execution Safety Mode"`, `"Software Auto-Updater"`, `"Runtime Environment"`, `"Design System"`, `"Repository Credits"`.
   - `src/components/ToastContainer.tsx` (Lines 57): Close button labels and dynamic toast notification titles (`"Update Available"`, `"Up to Date"`, `"Task Execution Triggered"` in `useAppStore.ts`).

---

## 2. Logic Chain

### 2.1 Package Dependencies Recommendation
To support seamless internationalization with React 18 and Vite:
- **`i18next`** (`^23.12.0` or latest v23/v24): Core i18n framework providing key translation lookup, pluralization, and namespace handling.
- **`react-i18next`** (`^14.1.0` or latest v14): React integration providing `useTranslation()` hook, `<Trans />` component, and standard context provider.
- **`i18next-browser-languagedetector`** (`^8.0.0` or latest v8): Browser language detection plugin that automatically checks localStorage key (`wiscripts-language`) and fallback navigator language.

**Installation Command**:
```bash
npm install i18next react-i18next i18next-browser-languagedetector
```

### 2.2 Locale JSON File Structure & Organization
Locales should be organized under `src/i18n/locales/`:
- `src/i18n/locales/ru.json` (Russian - Primary / Default target)
- `src/i18n/locales/en.json` (English - Secondary / Fallback target)

Each locale file follows a structured nested namespace hierarchy matching application feature boundaries.

### 2.3 `src/i18n/index.ts` Setup & Initializer Plan
The setup module `src/i18n/index.ts` will:
1. Import `i18n` from `'i18next'`.
2. Import `initReactI18next` from `'react-i18next'`.
3. Import `LanguageDetector` from `'i18next-browser-languagedetector'`.
4. Import `en` from `'./locales/en.json'` and `ru` from `'./locales/ru.json'`.
5. Configure `i18n` with:
   - `resources`: `{ en: { translation: en }, ru: { translation: ru } }`
   - `fallbackLng`: `'ru'` (or `'en'`)
   - `detection`: `{ order: ['localStorage', 'navigator'], lookupLocalStorage: 'wiscripts-language', caches: ['localStorage'] }`
   - `interpolation`: `{ escapeValue: false }` (React already sanitizes XSS)
6. Export `i18n` default instance.
7. Be imported at the top of `src/main.tsx` before rendering `<App />`.

### 2.4 Translation Key Hierarchy Specification
The key hierarchy is categorized by UI scope:

```json
{
  "common": { ... },
  "header": { ... },
  "nav": { ... },
  "dashboard": { ... },
  "optimizations": { ... },
  "startup": { ... },
  "scheduler": { ... },
  "restore": { ... },
  "settings": { ... },
  "toasts": { ... }
}
```

#### Detailed Key Blueprint (`en.json` / `ru.json` design):

```json
// src/i18n/locales/en.json
{
  "common": {
    "appName": "WiScripts",
    "windowsUtility": "Windows Utility",
    "version": "Version",
    "dryRunMode": "Safety Dry-Run Mode",
    "dryRunBadge": "Dry-Run Preview",
    "elevatedPrivileges": "Elevated Privileges",
    "standardUser": "Standard User",
    "fullControl": "Full Registry & Service Control",
    "limitedControl": "Limited System Modifications",
    "searchPlaceholder": "Search...",
    "refresh": "Refresh",
    "apply": "Apply",
    "execute": "Execute",
    "cancel": "Cancel",
    "confirm": "Confirm",
    "enabled": "Enabled",
    "disabled": "Disabled",
    "actions": "Actions",
    "status": "Status",
    "highRisk": "High Risk",
    "mediumRisk": "Medium Risk",
    "lowRisk": "Low Risk",
    "reversible": "Reversible",
    "nonReversible": "Non-Reversible"
  },
  "nav": {
    "dashboard": "Dashboard",
    "optimization": "Optimizations",
    "package_manager": "Package Manager",
    "presets": "Optimization Presets",
    "startup": "Startup Apps",
    "scheduler": "Task Scheduler",
    "dns_context": "DNS & Context Menu",
    "driver_backup": "Driver Backup",
    "diagnostics": "Diagnostics & Health",
    "odt": "Office ODT",
    "activation": "Activation MAS",
    "restore_points": "Restore Points",
    "settings": "Settings"
  },
  "header": {
    "dashboard": "System Overview Dashboard",
    "optimization": "Windows Optimizations & Debloat",
    "package_manager": "Package & Bloatware Manager (Winget / UWP)",
    "presets": "Curated Optimization Profiles & Presets",
    "dns_context": "DNS Server & Win11 Context Menu Manager",
    "driver_backup": "Windows Device Driver Export & Backup",
    "diagnostics": "Advanced Diagnostics & System Health Stream",
    "odt": "Office Deployment Tool (ODT) Configurator",
    "activation": "Microsoft Activation Scripts (MAS)",
    "settings": "Global Configuration & Preferences"
  },
  "dashboard": {
    "readinessTitle": "System Optimization Readiness",
    "readinessDesc": "Windows build {{build}} detected. {{count}} optimizations currently queued.",
    "applyRecommended": "Apply Recommended Presets",
    "telemetryTitle": "Real-Time System Telemetry & Hardware Probe",
    "livePolling": "Live Polling",
    "paused": "Paused",
    "interval": "Interval:",
    "pause": "Pause",
    "resume": "Resume",
    "pollNow": "Poll Now",
    "cpuUsage": "CPU Usage",
    "ramUsage": "RAM Usage",
    "diskReadRate": "Disk Read Rate",
    "networkRx": "Network RX",
    "cpuCoreSensor": "CPU Core Package Sensor",
    "gpuThermalSensor": "GPU Hardware Thermal Sensor",
    "operatingSystem": "Operating System",
    "telemetryService": "Telemetry Service",
    "telemetryActive": "DiagTrack service active",
    "catalogPreview": "Core Optimization Catalog Preview",
    "catalogDesc": "Telemetry removal, bloatware cleanup, privacy hardening, and service optimization",
    "viewAllRules": "View All Rules ({{count}}) →",
    "active": "active"
  },
  "optimizations": {
    "engineTitle": "System Optimization & Debloat Engine",
    "engineDesc": "Sophia-Script inspired rule catalog. Granular telemetry removal, bloatware cleanup, and system service hardening.",
    "totalCatalog": "Total Catalog",
    "selected": "Selected",
    "executeSelected": "Execute Selected ({{count}})",
    "executing": "Executing Optimizations...",
    "presets": "Presets:",
    "recommended": "Recommended ({{count}})",
    "telemetryOnly": "Telemetry-Only ({{count}})",
    "fullDebloat": "Full Debloat ({{count}})",
    "clearSelection": "Clear Selection",
    "allCategories": "All Categories",
    "telemetry": "Telemetry",
    "bloatware": "Bloatware",
    "privacy": "Privacy",
    "services": "Services",
    "ui_tweaks": "UI Tweaks",
    "disk_cleanup": "Disk Cleanup",
    "noRulesMatch": "No optimization rules match your filter",
    "noRulesDesc": "Try adjusting your search keyword or selected category tab.",
    "hideUndo": "Hide Undo",
    "inspectUndo": "Inspect Undo",
    "undoScript": "Undo PowerShell Script:"
  },
  "startup": {
    "title": "Startup Apps Manager",
    "desc": "Manage applications scheduled to run automatically at system boot and user logon.",
    "totalApps": "Total Startup Apps",
    "enabledApps": "Enabled",
    "disabledApps": "Disabled",
    "searchPlaceholder": "Search startup apps by name, command, or publisher...",
    "allLocations": "All Locations",
    "hkcuRegistry": "HKCU Registry",
    "hklmRegistry": "HKLM Registry",
    "startupFolders": "Startup Folders",
    "noMatch": "No startup apps match your search filter.",
    "appPublisher": "Application & Publisher",
    "location": "Location",
    "commandTarget": "Command Target",
    "removeTitle": "Remove Startup Entry: {{name}}",
    "removeDesc": "Are you sure you want to permanently delete this startup entry? This will prevent '{{name}}' from automatically starting with Windows."
  },
  "scheduler": {
    "title": "Task Scheduler Manager",
    "desc": "Inspect, toggle, and trigger Windows Task Scheduler background services and automated jobs.",
    "totalTasks": "Total Tasks",
    "ready": "Ready",
    "disabled": "Disabled",
    "running": "Running",
    "searchPlaceholder": "Search scheduled tasks by name, path, author, or command...",
    "telemetryOnly": "Telemetry Only",
    "allStates": "All States",
    "noMatch": "No scheduled tasks match your search query.",
    "taskNamePath": "Task Name & Path",
    "author": "Author",
    "actionCommand": "Action Command",
    "runNow": "Run"
  },
  "restore": {
    "title": "System Restore Manager",
    "desc": "Create Windows restore points and manage system rollback checkpoints.",
    "protectionStatus": "System Restore Protection Status",
    "activePoints": "Active Restore Points:",
    "elevationStatus": "Elevation Status:",
    "executionMode": "Execution Mode:",
    "createNewPoint": "Create New Restore Point",
    "descriptionLabel": "Restore Point Description",
    "descriptionPlaceholder": "e.g. WiScripts Manual Checkpoint Before Driver Updates",
    "createBtn": "Create Restore Point",
    "availableCheckpoints": "Available System Checkpoints",
    "seqNo": "Seq #",
    "description": "Description",
    "type": "Type",
    "createdTime": "Created Time",
    "rollback": "Rollback",
    "noPoints": "No restore points found or System Restore disabled on host.",
    "confirmRollbackTitle": "Confirm System Rollback",
    "confirmRollbackDesc": "You are about to restore Windows system files and settings to Checkpoint #{{seq}}:",
    "liveWarning": "LIVE MODE: System restore will undo system changes and require a system restart.",
    "dryRunWarning": "Dry-Run Mode: Command execution will be simulated without altering host state.",
    "proceedRollback": "Proceed Rollback"
  },
  "settings": {
    "title": "Application Settings & Configuration",
    "desc": "Manage execution safety defaults, inspect design system theme specifications, and view open-source credits.",
    "safetyModeTitle": "Execution Safety Mode",
    "globalDryRunLabel": "Global Dry-Run Default",
    "globalDryRunDesc": "When enabled, all optimization commands, ODT setups, and MAS activation routines run in simulation mode without writing changes to host registry or services.",
    "safetyStatusActive": "Status: Safety Mode is currently ACTIVE (Simulate Only)",
    "safetyStatusDisabled": "Status: Safety Mode is currently DISABLED (Live Modifications)",
    "languageTitle": "Language & Localization",
    "languageLabel": "Application Interface Language",
    "languageDesc": "Select target display language for navigation tabs, headers, rule descriptions, and system notifications.",
    "autoUpdaterTitle": "Software Auto-Updater",
    "autoCheckLabel": "Automatic Background Checks",
    "autoCheckDesc": "Periodically check GitHub Releases endpoint for signed binary updates.",
    "lastChecked": "Last Checked:",
    "checkUpdatesBtn": "Check for Updates",
    "checkingBtn": "Checking...",
    "updateAvailable": "Update v{{ver}} is available!",
    "downloadInstallBtn": "Download & Install",
    "updateReady": "Update ready! Restart to finish.",
    "restartNowBtn": "Restart Now",
    "runtimeEnvTitle": "Runtime Environment",
    "appVersion": "Application Version",
    "tauriFramework": "Tauri Framework",
    "uiArch": "UI Architecture",
    "targetPlatform": "Target Platform",
    "designSystemTitle": "Design System: Refined Minimal",
    "designSystemDesc": "Designed following strict Refined Minimal principles (Linear/Stripe style) with muted contrast, 1px hairlines, and Geist Mono typography.",
    "creditsTitle": "Repository & Open Source Credits"
  },
  "toasts": {
    "updateAvailableTitle": "Update Available",
    "updateAvailableMsg": "WiScripts v{{version}} is ready for download.",
    "updateNow": "Update Now",
    "upToDateTitle": "Up to Date",
    "upToDateMsg": "WiScripts v{{version}} is currently the latest version.",
    "updateFailedTitle": "Update Check Failed",
    "taskTriggeredTitle": "Task Execution Triggered",
    "taskTriggeredMsg": "Triggered '{{taskName}}' successfully.",
    "toggleStartupFailed": "Toggle Startup App Failed",
    "removeStartupFailed": "Remove Startup App Failed",
    "toggleTaskFailed": "Toggle Task Failed",
    "runTaskFailed": "Run Task Failed"
  }
}
```

```json
// src/i18n/locales/ru.json
{
  "common": {
    "appName": "WiScripts",
    "windowsUtility": "Утилита Windows",
    "version": "Версия",
    "dryRunMode": "Режим безопасности (Dry-Run)",
    "dryRunBadge": "Симуляция (Dry-Run)",
    "elevatedPrivileges": "Права Администратора",
    "standardUser": "Обычный пользователь",
    "fullControl": "Полный доступ к реестру и службам",
    "limitedControl": "Ограниченные изменения системы",
    "searchPlaceholder": "Поиск...",
    "refresh": "Обновить",
    "apply": "Применить",
    "execute": "Выполнить",
    "cancel": "Отмена",
    "confirm": "Подтвердить",
    "enabled": "Включено",
    "disabled": "Отключено",
    "actions": "Действия",
    "status": "Статус",
    "highRisk": "Высокий риск",
    "mediumRisk": "Средний риск",
    "lowRisk": "Низкий риск",
    "reversible": "Обратимо",
    "nonReversible": "Необратимо"
  },
  "nav": {
    "dashboard": "Дашборд",
    "optimization": "Оптимизация",
    "package_manager": "Менеджер пакетов",
    "presets": "Пресеты оптимизации",
    "startup": "Автозагрузка",
    "scheduler": "Планировщик задач",
    "dns_context": "DNS и Контекстное меню",
    "driver_backup": "Бэкап драйверов",
    "diagnostics": "Диагностика",
    "odt": "Office ODT",
    "activation": "Активация MAS",
    "restore_points": "Точки восстановления",
    "settings": "Настройки"
  },
  "header": {
    "dashboard": "Панель мониторинга и состояния системы",
    "optimization": "Оптимизация и очистка Windows",
    "package_manager": "Менеджер пакетов и приложений (Winget / UWP)",
    "presets": "Готовые профили и пресеты оптимизации",
    "dns_context": "Настройка DNS-серверов и контекстного меню Win11",
    "driver_backup": "Экспорт и резервное копирование драйверов",
    "diagnostics": "Расширенная диагностика и мониторинг системы",
    "odt": "Конфигуратор Office Deployment Tool (ODT)",
    "activation": "Скрипты активации Microsoft (MAS)",
    "settings": "Глобальные настройки и параметры приложения"
  },
  "dashboard": {
    "readinessTitle": "Готовность к оптимизации системы",
    "readinessDesc": "Обнаружена сборка Windows {{build}}. В очереди оптимизаций: {{count}}.",
    "applyRecommended": "Применить рекомендуемые пресеты",
    "telemetryTitle": "Телеметрия системы и аппаратные датчики",
    "livePolling": "Мониторинг активен",
    "paused": "Пауза",
    "interval": "Интервал:",
    "pause": "Пауза",
    "resume": "Запуск",
    "pollNow": "Опросить сейчас",
    "cpuUsage": "Загрузка ЦП",
    "ramUsage": "Использование ОЗУ",
    "diskReadRate": "Чтение с диска",
    "networkRx": "Сеть (Прием)",
    "cpuCoreSensor": "Датчик температуры ЦП",
    "gpuThermalSensor": "Датчик температуры ГПУ",
    "operatingSystem": "Операционная система",
    "telemetryService": "Служба телеметрии",
    "telemetryActive": "Служба DiagTrack активна",
    "catalogPreview": "Каталог правил оптимизации",
    "catalogDesc": "Удаление телеметрии, очистка от мусора, приватность и настройка служб",
    "viewAllRules": "Все правила ({{count}}) →",
    "active": "активно"
  },
  "optimizations": {
    "engineTitle": "Движок оптимизации и очистки Windows",
    "engineDesc": "Каталог правил на базе Sophia-Script. Удаление телеметрии, мусорных программ и оптимизация служб.",
    "totalCatalog": "Всего правил",
    "selected": "Выбрано",
    "executeSelected": "Применить выбранные ({{count}})",
    "executing": "Выполнение оптимизаций...",
    "presets": "Пресеты:",
    "recommended": "Рекомендуемые ({{count}})",
    "telemetryOnly": "Только телеметрия ({{count}})",
    "fullDebloat": "Полная очистка ({{count}})",
    "clearSelection": "Сбросить выбор",
    "allCategories": "Все категории",
    "telemetry": "Телеметрия",
    "bloatware": "Встроенное ПО",
    "privacy": "Приватность",
    "services": "Службы",
    "ui_tweaks": "Интерфейс",
    "disk_cleanup": "Очистка диска",
    "noRulesMatch": "Нет правил, соответствующих фильтру",
    "noRulesDesc": "Попробуйте изменить поисковый запрос или выбрать другую категорию.",
    "hideUndo": "Скрыть откат",
    "inspectUndo": "Просмотр отката",
    "undoScript": "Скрипт отката PowerShell:"
  },
  "startup": {
    "title": "Менеджер автозагрузки",
    "desc": "Управление приложениями, запускаемыми при старте системы и входе пользователя.",
    "totalApps": "Всего приложений",
    "enabledApps": "Включено",
    "disabledApps": "Отключено",
    "searchPlaceholder": "Поиск по имени, команде или издателю...",
    "allLocations": "Все локации",
    "hkcuRegistry": "Реестр HKCU",
    "hklmRegistry": "Реестр HKLM",
    "startupFolders": "Папки автозагрузки",
    "noMatch": "Нет приложений автозагрузки, соответствующих фильтру.",
    "appPublisher": "Приложение и Издатель",
    "location": "Локация",
    "commandTarget": "Команда запуска",
    "removeTitle": "Удаление из автозагрузки: {{name}}",
    "removeDesc": "Вы уверены, что хотите навсегда удалить эту запись из автозагрузки? Это предотвратит автоматический запуск '{{name}}' при старте Windows."
  },
  "scheduler": {
    "title": "Планировщик задач",
    "desc": "Просмотр, переключение и запуск фоновых задач Планировщика Windows.",
    "totalTasks": "Всего задач",
    "ready": "Готова",
    "disabled": "Отключена",
    "running": "Выполняется",
    "searchPlaceholder": "Поиск по имени, пути, автору или команде...",
    "telemetryOnly": "Только телеметрия",
    "allStates": "Все состояния",
    "noMatch": "Нет запланированных задач, соответствующих запросу.",
    "taskNamePath": "Имя и путь задачи",
    "author": "Автор",
    "actionCommand": "Выполняемая команда",
    "runNow": "Запустить"
  },
  "restore": {
    "title": "Менеджер точек восстановления",
    "desc": "Создание точек восстановления Windows и управление откатом системы.",
    "protectionStatus": "Статус защиты системы",
    "activePoints": "Активные точки восстановления:",
    "elevationStatus": "Права доступа:",
    "executionMode": "Режим выполнения:",
    "createNewPoint": "Создать новую точку восстановления",
    "descriptionLabel": "Описание точки восстановления",
    "descriptionPlaceholder": "Например: Ручная точка WiScripts перед обновлением драйверов",
    "createBtn": "Создать точку",
    "availableCheckpoints": "Доступные точки восстановления",
    "seqNo": "№",
    "description": "Описание",
    "type": "Тип",
    "createdTime": "Дата создания",
    "rollback": "Откатить",
    "noPoints": "Точки восстановления не найдены или функция отключена в системе.",
    "confirmRollbackTitle": "Подтверждение отката системы",
    "confirmRollbackDesc": "Вы собираетесь восстановить системные файлы и настройки Windows к точке #{{seq}}:",
    "liveWarning": "БОЕВОЙ РЕЖИМ: Восстановление отменит изменения и потребует перезагрузки системы.",
    "dryRunWarning": "Режим симуляции: Выполнение команд будет сэмулировано без изменения состояния системы.",
    "proceedRollback": "Начать откат"
  },
  "settings": {
    "title": "Настройки и параметры приложения",
    "desc": "Управление режимом безопасности, параметрами интерфейса и информацией о системе.",
    "safetyModeTitle": "Режим безопасности (Dry-Run)",
    "globalDryRunLabel": "Глобальный режим симуляции",
    "globalDryRunDesc": "Если включено, все команды оптимизации, ODT и MAS выполняются в тестовом режиме без записи изменений в реестр и службы Windows.",
    "safetyStatusActive": "Статус: Режим безопасности АКТИВЕН (Только симуляция)",
    "safetyStatusDisabled": "Статус: Режим безопасности ОТКЛЮЧЕН (Прямые изменения)",
    "languageTitle": "Язык и локализация",
    "languageLabel": "Язык интерфейса приложения",
    "languageDesc": "Выберите язык отображения для навигации, заголовков, описаний правил и уведомлений.",
    "autoUpdaterTitle": "Автоматическое обновление ПО",
    "autoCheckLabel": "Автоматическая проверка",
    "autoCheckDesc": "Периодически проверять наличие подписанных обновлений на GitHub Releases.",
    "lastChecked": "Последняя проверка:",
    "checkUpdatesBtn": "Проверить обновления",
    "checkingBtn": "Проверка...",
    "updateAvailable": "Доступно обновление v{{ver}}!",
    "downloadInstallBtn": "Скачать и установить",
    "updateReady": "Обновление готово! Перезапустите приложение.",
    "restartNowBtn": "Перезапустить сейчас",
    "runtimeEnvTitle": "Среда выполнения",
    "appVersion": "Версия приложения",
    "tauriFramework": "Фреймворк Tauri",
    "uiArch": "Архитектура UI",
    "targetPlatform": "Целевая платформа",
    "designSystemTitle": "Дизайн-система: Refined Minimal",
    "designSystemDesc": "Разработано по принципам Refined Minimal (стиль Linear/Stripe) со сдержанным контрастом, тонкими линиями 1px и шрифтом Geist Mono.",
    "creditsTitle": "Благодарности и Open Source"
  },
  "toasts": {
    "updateAvailableTitle": "Доступно обновление",
    "updateAvailableMsg": "WiScripts v{{version}} готова к скачиванию.",
    "updateNow": "Обновить сейчас",
    "upToDateTitle": "Актуальная версия",
    "upToDateMsg": "WiScripts v{{version}} является последней версией.",
    "updateFailedTitle": "Ошибка проверки обновлений",
    "taskTriggeredTitle": "Задача запущена",
    "taskTriggeredMsg": "Задача '{{taskName}}' успешно запущенa.",
    "toggleStartupFailed": "Ошибка переключения автозагрузки",
    "removeStartupFailed": "Ошибка удаления автозагрузки",
    "toggleTaskFailed": "Ошибка переключения задачи",
    "runTaskFailed": "Ошибка запуска задачи"
  }
}
```

### 2.5 Zustand Integration & Settings Language Widget Plan

#### Store Integration Code Design (`src/store/useAppStore.ts`):

1. **State interface updates**:
```ts
export type Language = 'ru' | 'en';

interface AppState {
  // Localization State
  language: Language;
  setLanguage: (lang: Language) => void;
  ...
}
```

2. **Store implementation**:
```ts
language: 'ru',
setLanguage: (lang: Language) => {
  set({ language: lang });
  i18n.changeLanguage(lang);
},
```

3. **Persistence (`partialize`)**:
```ts
partialize: (state) => ({
  dryRunMode: state.dryRunMode,
  autoCheckUpdates: state.autoCheckUpdates,
  odtConfig: state.odtConfig,
  selectedMasMethod: state.selectedMasMethod,
  driverBackupPath: state.driverBackupPath,
  selectedDnsProvider: state.selectedDnsProvider,
  language: state.language, // <-- Persisted across app restarts
}),
```

#### Settings Language Selector Widget Design (`src/components/SettingsView.tsx`):

A new Card component placed in `SettingsView.tsx` under Safety & Execution Defaults:

```tsx
{/* Card: Language & Localization Selector */}
<div className="rounded-[6px] border border-border bg-surface p-5 space-y-4">
  <div className="flex items-center gap-2 border-b border-border-subtle pb-3">
    <Globe className="h-4 w-4 text-brand" />
    <h3 className="text-sm font-semibold text-text-primary">{t('settings.languageTitle')}</h3>
  </div>

  <div className="flex items-start justify-between gap-4">
    <div className="space-y-1">
      <div className="text-xs font-medium text-text-primary">{t('settings.languageLabel')}</div>
      <p className="text-xs text-text-secondary leading-relaxed">
        {t('settings.languageDesc')}
      </p>
    </div>
    
    {/* Segmented language switch buttons */}
    <div className="flex items-center gap-1.5 bg-surface-subtle p-1 rounded-[6px] border border-border-subtle shrink-0">
      <button
        onClick={() => setLanguage('ru')}
        className={`px-3 py-1.5 rounded-[4px] text-xs font-medium transition-all ${
          language === 'ru'
            ? 'bg-brand text-white shadow-sm'
            : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
        }`}
      >
        🇷🇺 Русский
      </button>
      <button
        onClick={() => setLanguage('en')}
        className={`px-3 py-1.5 rounded-[4px] text-xs font-medium transition-all ${
          language === 'en'
            ? 'bg-brand text-white shadow-sm'
            : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
        }`}
      >
        🇬🇧 English
      </button>
    </div>
  </div>
</div>
```

---

## 3. Caveats

1. **Dynamic Optimization Titles in Store Catalog**:
   - In `src/store/useAppStore.ts`, the `DEFAULT_OPTIMIZATIONS` array currently contains hardcoded English strings for `title` and `description`.
   - *Recommendation for Implementer*: Use key translation lookups in `OptimizationView.tsx` (e.g. `t(`rules.${item.id}.title`, { defaultValue: item.title })`), or store key identifiers in the catalog.
2. **Third-Party Powershell Outputs & System Errors**:
   - Dynamic error strings returned from Windows PowerShell / Tauri IPC backend (e.g., OS build strings, raw command output) remain un-localized as they originate directly from host OS APIs.
3. **No Direct Code Modifications Performed**:
   - In strict compliance with read-only explorer instructions, no files outside of `.agents/explorer_m4_1/` were modified.

---

## 4. Conclusion

The integration plan for `i18next` and `react-i18next` is fully defined and ready for immediate implementation by the implementer agent.

Summary of actionable steps for implementation:
1. Run `npm install i18next react-i18next i18next-browser-languagedetector`.
2. Create `src/i18n/locales/en.json` and `src/i18n/locales/ru.json` with the nested namespace schemas defined in Section 2.4.
3. Create `src/i18n/index.ts` and initialize `i18next` with fallback language set to `ru`/`en` and automatic browser detection.
4. Import `src/i18n/index.ts` in `src/main.tsx`.
5. Update `src/store/useAppStore.ts` with `language: 'ru' | 'en'`, `setLanguage`, and add `language` to `partialize`.
6. Add `useTranslation()` hook across components (`Navigation`, `Header`, `Dashboard`, `OptimizationView`, `StartupView`, `SchedulerView`, `RestorePointsView`, `SettingsView`, `ToastContainer`) and replace hardcoded text strings.
7. Add the Language Selector widget in `SettingsView.tsx`.

---

## 5. Verification Method

### 5.1 Manual Verification & Tests
1. **Dependency Installation Check**:
   - Run `npm list i18next react-i18next i18next-browser-languagedetector` to ensure packages are installed in `package.json`.
2. **Build Verification**:
   - Run `npm run build` (runs `tsc && vite build`) to confirm TypeScript compilation passes with zero type errors.
3. **Runtime Language Switch Verification**:
   - Run `npm run dev`.
   - Open Settings tab -> Click `🇷🇺 Русский` button -> Verify all navigation tabs, headers, cards, badges, and toasts update instantly to Russian.
   - Click `🇬🇧 English` button -> Verify UI reverts instantly to English.
   - Reload application -> Verify the selected language persists via localStorage (`wiscripts-app-store`).

---

**Report Prepared By**: Explorer M4-1 (i18next Localization Explorer)
