# Progress Tracker — Milestone 4 (Customization & Profiles)

Last visited: 2026-07-27T11:31:40Z

- [ ] Read Explorer Handoff reports (`explorer_m4_1`, `explorer_m4_2`, `explorer_m4_3`)
- [ ] Inspect existing project structure (`package.json`, `src/store/useAppStore.ts`, `src-tauri/src/...`)
- [ ] Install/Configure `i18next`, `react-i18next`, `i18next-browser-languagedetector`
- [ ] Create translation files `src/i18n/locales/en.json`, `src/i18n/locales/ru.json`, `src/i18n/index.ts`
- [ ] Configure Zustand `persist` in `src/store/useAppStore.ts`
- [ ] Implement/Update `src/components/SettingsView.tsx` with Refined Minimal UI, theme toggle, lang toggle
- [ ] Implement theme switcher logic (`useEffect` modifying `documentElement.classList`)
- [ ] Enhance Rust preset module `src-tauri/src/profiles/mod.rs` with `WiScriptsPreset`, `export_preset`, `import_preset`, `validate_and_parse_preset` & IPC commands
- [ ] Update Rust IPC registration in `src-tauri/src/lib.rs` / `main.rs`
- [ ] Implement/Update `PresetsView.tsx` UI for Import/Export custom JSON presets
- [ ] Localize UI strings across Navigation, Dashboard, Optimizations, Startup Apps, Scheduler, Restore Points, Settings, Toasts
- [ ] Write Rust unit tests in `src-tauri/src/profiles/mod.rs`
- [ ] Write empirical TypeScript test `src/tests/m4_empirical.ts`
- [ ] Execute `cargo test --manifest-path src-tauri/Cargo.toml` and verify 100% pass
- [ ] Execute `npx tsc --noEmit` and `npm run build` and verify 0 errors
- [ ] Create `handoff.md` and notify parent
