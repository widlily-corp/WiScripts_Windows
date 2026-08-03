# Release Notes — WiScripts Windows v0.9.9

**Release Date:** 2026-08-03

---

## Новый раздел: Script Runner

- Добавлен полнофункциональный раздел для выполнения пользовательских PowerShell (.ps1) и CMD (.bat/.cmd) скриптов с правами администратора.
- Встроенный редактор кода с подсветкой количества строк и символов.
- Загрузка скриптов из файла одним кликом.
- Потоковый вывод stdout/stderr в реальном времени (live streaming).
- Скачивание результатов выполнения в виде .log файла.
- Индикатор статуса привилегий (Administrator / Standard User).

## Динамическая главная страница

- Статические тексты на главной странице заменены на реальные данные о состоянии оптимизаций.
- Динамический счётчик: «Готовность к оптимизации системы, в очереди N оптимизаций».
- Праздничный баннер при полной оптимизации системы (N=0).
- Автоматический опрос состояния оптимизаций при загрузке страницы.

## Переработка температурных датчиков

- Полностью переписана система определения температурных датчиков: 6-уровневый каскад обнаружения.
- Tier 1: LibreHardwareMonitor (WMI)
- Tier 2: OpenHardwareMonitor (WMI)
- Tier 3: NVIDIA NVML (динамическая загрузка DLL)
- Tier 4: ACPI Thermal Zone (WMI)
- Tier 5: nvidia-smi CLI (фоллбэк для GPU)
- Tier 6: sysinfo Components (универсальный фоллбэк)
- Все WMI-вызовы защищены таймаутом 3 секунды.
- Добавлен выпадающий список для ручного выбора датчика CPU и GPU с сохранением настройки.

## Безопасность и исправления

- Проверка привилегий администратора через нативный Win32 API (OpenProcessToken + TOKEN_ELEVATION) вместо `net session`.
- Whitelist допустимых registry-путей для манипуляций с автозагрузкой.
- Исправлен escaping аргументов в ShellExecuteW (модуль деинсталлятора).
- Таймаут-защита для WMI subprocess (предотвращение зависаний).
- Дедупликация ID температурных датчиков при конфликтах провайдеров.

## Локализация

- Полная локализация нового раздела Script Runner (ru/en).
- Добавлены ключи для динамических баннеров на главной странице.

## Полная история коммитов

```
feat(script-runner): add Script Runner section with admin IPC execution
feat(dashboard): add dynamic optimization queue and success banner
feat(sensors): rewrite multi-tier temperature sensor detection
fix(security): add startup location whitelist and audit fixes
feat(i18n): add localization for Script Runner and dashboard banners
test(e2e): add comprehensive E2E test suite for v0.9.9 features
chore: bump version to 0.9.9
```
