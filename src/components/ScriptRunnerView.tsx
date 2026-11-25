import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Terminal,
  Upload,
  Play,
  Trash2,
  FileCode,
  ShieldCheck,
  ShieldAlert,
  Shield,
  Loader2,
  Globe,
  RefreshCw,
  Wrench,
  Wifi,
  Lock,
  Zap,
  Activity,
  Layers,
  Code2,
  FileText,
  Square,
  Sliders,
  History,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { AdminElevationBanner } from './AdminElevationBanner';
import { ScriptDetailsModal } from './ScriptDetailsModal';
import { ScriptRunnerModal } from './ScriptRunnerModal';
import { ScriptExecutionHistoryView } from './ScriptExecutionHistoryView';
import { ImpactSimulatorModal } from './ImpactSimulatorModal';
import { OutputTerminalPanel } from './ScriptRunner/OutputTerminalPanel';
import { ScriptLibraryFilters } from './ScriptRunner/ScriptLibraryFilters';
import type { ScriptCategory, ScriptRiskLevel } from '../types';

const MAX_SCRIPT_FILE_SIZE_BYTES = 2 * 1024 * 1024;

export function ScriptRunnerView() {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addToast = useAppStore((s) => s.addToast);
  const isElevated = useAppStore((s) => s.isElevated ?? s.systemInfo?.isElevated ?? false);
  const isElevatedRunning = useAppStore((s) => s.isElevatedRunning);
  const editorRunAsAdmin = useAppStore((s) => s.editorRunAsAdmin);
  const setEditorRunAsAdmin = useAppStore((s) => s.setEditorRunAsAdmin);
  const scriptContent = useAppStore((s) => s.scriptContent);
  const scriptType = useAppStore((s) => s.scriptType);
  const uploadedFileName = useAppStore((s) => s.uploadedFileName);
  const outputLogs = useAppStore((s) => s.outputLogs);
  const isExecutingScript = useAppStore((s) => s.isExecutingScript);
  const isCancellingScript = useAppStore((s) => s.isCancellingScript);
  const executionStartTime = useAppStore((s) => s.executionStartTime);

  const libraryManifest = useAppStore((s) => s.libraryManifest);
  const isLoadingLibrary = useAppStore((s) => s.isLoadingLibrary);
  const libraryError = useAppStore((s) => s.libraryError);
  const lastSyncTimestamp = useAppStore((s) => s.lastSyncTimestamp);
  const activeRunnerTab = useAppStore((s) => s.activeRunnerTab);
  const librarySelectedCategory = useAppStore((s) => s.librarySelectedCategory);
  const librarySearchQuery = useAppStore((s) => s.librarySearchQuery);
  const librarySelectedRisk = useAppStore((s) => s.librarySelectedRisk);
  const previewScript = useAppStore((s) => s.previewScript);
  const previewContent = useAppStore((s) => s.previewContent);
  const isLoadingPreview = useAppStore((s) => s.isLoadingPreview);

  const parameterDialogScript = useAppStore((s) => s.parameterDialogScript);
  const parameterValues = useAppStore((s) => s.parameterValues);
  const parameterValidationErrors = useAppStore((s) => s.parameterValidationErrors);

  const executionHistory = useAppStore((s) => s.executionHistory || []);
  const isImpactSimulatorOpen = useAppStore((s) => s.isImpactSimulatorOpen);
  const impactSimulatorScript = useAppStore((s) => s.impactSimulatorScript);
  const impactSimulatorContent = useAppStore((s) => s.impactSimulatorContent);
  const openImpactSimulator = useAppStore((s) => s.openImpactSimulator);
  const closeImpactSimulator = useAppStore((s) => s.closeImpactSimulator);

  const setScriptContent = useAppStore((s) => s.setScriptContent);
  const setScriptType = useAppStore((s) => s.setScriptType);
  const setUploadedFileName = useAppStore((s) => s.setUploadedFileName);
  const clearOutputLogs = useAppStore((s) => s.clearOutputLogs);
  const executeScript = useAppStore((s) => s.executeScript);
  const cancelRunningScript = useAppStore((s) => s.cancelRunningScript);
  const downloadOutputLog = useAppStore((s) => s.downloadOutputLog);
  const setupScriptOutputListener = useAppStore((s) => s.setupScriptOutputListener);
  const cleanupScriptOutputListener = useAppStore((s) => s.cleanupScriptOutputListener);

  const setActiveRunnerTab = useAppStore((s) => s.setActiveRunnerTab);
  const setLibrarySelectedCategory = useAppStore((s) => s.setLibrarySelectedCategory);
  const setLibrarySearchQuery = useAppStore((s) => s.setLibrarySearchQuery);
  const setLibrarySelectedRisk = useAppStore((s) => s.setLibrarySelectedRisk);
  const fetchLibrary = useAppStore((s) => s.fetchLibrary);
  const openScriptPreview = useAppStore((s) => s.openScriptPreview);
  const closeScriptPreview = useAppStore((s) => s.closeScriptPreview);
  const loadScriptToEditor = useAppStore((s) => s.loadScriptToEditor);
  const runLibraryScriptDirectly = useAppStore((s) => s.runLibraryScriptDirectly);

  const closeParameterDialog = useAppStore((s) => s.closeParameterDialog);
  const executeScriptWithParameters = useAppStore((s) => s.executeScriptWithParameters);

  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [editorDryRun, setEditorDryRun] = useState<boolean>(false);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isExecutingScript && executionStartTime) {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - executionStartTime) / 1000)));
      interval = setInterval(() => {
        setElapsedSeconds(Math.max(0, Math.floor((Date.now() - executionStartTime) / 1000)));
      }, 500);
    } else {
      setElapsedSeconds(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isExecutingScript, executionStartTime]);

  const formattedElapsed = useMemo(() => {
    const mins = Math.floor(elapsedSeconds / 60);
    const secs = elapsedSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, [elapsedSeconds]);

  useEffect(() => {
    setupScriptOutputListener();
    return () => {
      cleanupScriptOutputListener();
    };
  }, [setupScriptOutputListener, cleanupScriptOutputListener]);

  useEffect(() => {
    if (!libraryManifest && !isLoadingLibrary) {
      fetchLibrary(false);
    }
  }, [libraryManifest, isLoadingLibrary, fetchLibrary]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_SCRIPT_FILE_SIZE_BYTES) {
      addToast({
        type: 'error',
        title: t('script_runner.upload_too_large_title', 'File Too Large'),
        message: t('script_runner.upload_too_large_msg', 'Script files must be 2 MB or smaller.'),
      });
      e.target.value = '';
      return;
    }

    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension === 'ps1') {
      setScriptType('ps1');
    } else if (extension === 'bat') {
      setScriptType('bat');
    } else if (extension === 'cmd') {
      setScriptType('cmd');
    }

    setUploadedFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === 'string') {
        setScriptContent(content);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleClearEditor = () => {
    setScriptContent('');
    setUploadedFileName(null);
  };

  const filteredScripts = useMemo(() => {
    if (!libraryManifest?.scripts) return [];
    return libraryManifest.scripts.filter((script) => {
      if (
        librarySelectedCategory !== 'all' &&
        script.category.toLowerCase() !== librarySelectedCategory.toLowerCase()
      ) {
        return false;
      }
      if (
        librarySelectedRisk !== 'all' &&
        script.riskLevel.toLowerCase() !== librarySelectedRisk.toLowerCase()
      ) {
        return false;
      }
      if (librarySearchQuery.trim()) {
        const q = librarySearchQuery.toLowerCase().trim();
        const matchesName = script.name.toLowerCase().includes(q);
        const matchesDesc = script.description.toLowerCase().includes(q);
        const matchesTags = script.tags.some((tag) => tag.toLowerCase().includes(q));
        const matchesPath = script.path.toLowerCase().includes(q);
        if (!matchesName && !matchesDesc && !matchesTags && !matchesPath) {
          return false;
        }
      }
      return true;
    });
  }, [libraryManifest, librarySelectedCategory, librarySelectedRisk, librarySearchQuery]);

  const lineCount = scriptContent ? scriptContent.split('\n').length : 0;
  const charCount = scriptContent.length;

  const categories: { id: ScriptCategory; label: string; icon: React.ReactNode }[] = [
    { id: 'all', label: t('script_runner.category_all', 'All Categories'), icon: <Layers className="h-3.5 w-3.5" /> },
    { id: 'maintenance', label: t('script_runner.category_maintenance', 'Maintenance'), icon: <Wrench className="h-3.5 w-3.5" /> },
    { id: 'network', label: t('script_runner.category_network', 'Network'), icon: <Wifi className="h-3.5 w-3.5" /> },
    { id: 'security', label: t('script_runner.category_security', 'Security'), icon: <Lock className="h-3.5 w-3.5" /> },
    { id: 'performance', label: t('script_runner.category_performance', 'Performance'), icon: <Zap className="h-3.5 w-3.5" /> },
    { id: 'diagnostics', label: t('script_runner.category_diagnostics', 'Diagnostics'), icon: <Activity className="h-3.5 w-3.5" /> },
  ];

  const getRiskBadge = (risk: ScriptRiskLevel | string) => {
    const r = risk.toLowerCase();
    if (r === 'safe') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-[11px] font-medium bg-status-successSubtle text-status-success border border-status-success/30">
          <ShieldCheck className="h-3 w-3" />
          <span>{t('script_runner.risk_safe', 'Safe')}</span>
        </span>
      );
    }
    if (r === 'elevated') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-[11px] font-medium bg-status-warningSubtle text-status-warning border border-status-warning/30">
          <ShieldAlert className="h-3 w-3" />
          <span>{t('script_runner.risk_elevated', 'Elevated')}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-[11px] font-medium bg-status-dangerSubtle text-status-danger border border-status-danger/30">
        <Shield className="h-3 w-3" />
        <span>{t('script_runner.risk_critical', 'Critical')}</span>
      </span>
    );
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Terminal className="h-6 w-6 text-brand" />
            <h1 className="text-xl font-bold text-text-primary tracking-tight">
              {t('script_runner.title', 'Script Runner')}
            </h1>
          </div>
          <p className="text-xs text-text-secondary mt-1">
            {t(
              'script_runner.subtitle',
              'Execute custom PowerShell and CMD scripts with administrative elevation'
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-[6px] text-xs font-medium border ${
              isElevated
                ? 'bg-status-successSubtle border-status-success/40 text-status-success'
                : 'bg-status-warningSubtle border-status-warning/40 text-status-warning'
            }`}
          >
            {isElevated ? (
              <>
                <ShieldCheck className="h-4 w-4 shrink-0 text-status-success" />
                <span>{t('script_runner.privilege_elevated', 'Administrator (Elevated)')}</span>
              </>
            ) : (
              <>
                <ShieldAlert className="h-4 w-4 shrink-0 text-status-warning" />
                <span>{t('script_runner.privilege_standard', 'Standard User')}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <AdminElevationBanner featureName={t('script_runner.admin_feature_name', 'Script Execution')} />

      {isExecutingScript && activeRunnerTab === 'library' && (
        <div className="flex items-center justify-between p-3 rounded-[6px] border border-brand/40 bg-brand/10 text-text-primary text-xs shadow-sm">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-brand" />
            <span className="font-medium">
              {t('script_runner.active_execution_banner', 'A script is actively executing')}
            </span>
            <span className="font-mono text-brand font-bold tabular-nums">({formattedElapsed})</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => cancelRunningScript()}
              disabled={isCancellingScript}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[4px] font-medium text-xs bg-status-danger hover:bg-status-danger/90 text-white transition-colors disabled:opacity-50"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
              <span>
                {isCancellingScript
                  ? t('script_runner.cancelling', 'Cancelling...')
                  : t('script_runner.cancel', 'Cancel')}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveRunnerTab('editor')}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[4px] font-medium text-xs bg-surface hover:bg-surface-hover border border-border text-text-primary transition-colors"
            >
              <span>{t('script_runner.view_terminal', 'View Terminal')}</span>
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2">
        <div className="inline-flex flex-wrap p-1 rounded-[6px] bg-surface-subtle border border-border">
          <button
            type="button"
            onClick={() => setActiveRunnerTab('editor')}
            className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-[4px] text-xs font-medium transition-colors ${
              activeRunnerTab === 'editor'
                ? 'bg-brand text-white shadow-xs font-semibold'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Code2 className="h-4 w-4" />
            <span>{t('script_runner.tab_editor', 'Editor & Terminal')}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveRunnerTab('library')}
            className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-[4px] text-xs font-medium transition-colors ${
              activeRunnerTab === 'library'
                ? 'bg-brand text-white shadow-xs font-semibold'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Globe className="h-4 w-4" />
            <span>{t('script_runner.tab_library', 'Online Script Library')}</span>
            {libraryManifest?.scripts && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono tabular-nums ${
                  activeRunnerTab === 'library'
                    ? 'bg-white/20 text-white'
                    : 'bg-surface border border-border text-text-secondary'
                }`}
              >
                {libraryManifest.scripts.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveRunnerTab('history')}
            className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-[4px] text-xs font-medium transition-colors ${
              activeRunnerTab === 'history'
                ? 'bg-brand text-white shadow-xs font-semibold'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <History className="h-4 w-4" />
            <span>{t('script_runner.tab_history', 'Execution History')}</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono tabular-nums ${
                activeRunnerTab === 'history'
                  ? 'bg-white/20 text-white'
                  : 'bg-surface border border-border text-text-secondary'
              }`}
            >
              {executionHistory.length}
            </span>
          </button>
        </div>

        {activeRunnerTab === 'library' && (
          <div className="flex items-center gap-3">
            {lastSyncTimestamp && (
              <span className="hidden sm:inline-flex text-[11px] text-text-secondary font-mono">
                {t('script_runner.synced_with_github', 'GitHub Verified')}: {lastSyncTimestamp}
              </span>
            )}
            <button
              type="button"
              onClick={() => fetchLibrary(true)}
              disabled={isLoadingLibrary}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-xs font-medium bg-surface hover:bg-surface-hover text-text-primary border border-border transition-colors disabled:opacity-50 shadow-xs"
              title={t('script_runner.sync_library', 'Sync with GitHub')}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoadingLibrary ? 'animate-spin text-brand' : ''}`} />
              <span>
                {isLoadingLibrary
                  ? t('script_runner.syncing', 'Syncing...')
                  : t('script_runner.sync_library', 'Sync with GitHub')}
              </span>
            </button>
          </div>
        )}
      </div>

      {activeRunnerTab === 'editor' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="flex flex-col rounded-[6px] border border-border bg-surface p-4 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <FileCode className="h-4 w-4 text-brand" />
                <span className="text-sm font-semibold text-text-primary">
                  {t('script_runner.editor_title', 'Script Editor')}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".ps1,.bat,.cmd"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isExecutingScript}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] text-xs font-medium bg-surface-subtle hover:bg-surface-hover text-text-primary border border-border transition-colors disabled:opacity-50"
                  title={t('script_runner.upload_file', 'Upload File')}
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>{t('script_runner.upload_file', 'Upload File')}</span>
                </button>

                <button
                  type="button"
                  onClick={handleClearEditor}
                  disabled={isExecutingScript || !scriptContent}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] text-xs font-medium bg-surface-subtle hover:bg-surface-hover text-text-secondary hover:text-status-danger border border-border transition-colors disabled:opacity-50"
                  title={t('script_runner.clear_editor', 'Clear Editor')}
                  aria-label={t('script_runner.clear_editor', 'Clear Editor')}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-text-secondary font-medium">
                {t('script_runner.script_type', 'Script Type:')}
              </span>
              <div className="inline-flex p-0.5 rounded-[6px] bg-surface-subtle border border-border">
                <button
                  type="button"
                  onClick={() => setScriptType('ps1')}
                  disabled={isExecutingScript}
                  className={`px-3 py-1 rounded-[4px] font-mono text-xs transition-colors ${
                    scriptType === 'ps1'
                      ? 'bg-brand text-white font-semibold shadow-xs'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  .ps1 (PowerShell)
                </button>
                <button
                  type="button"
                  onClick={() => setScriptType('bat')}
                  disabled={isExecutingScript}
                  className={`px-3 py-1 rounded-[4px] font-mono text-xs transition-colors ${
                    scriptType === 'bat'
                      ? 'bg-brand text-white font-semibold shadow-xs'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  .bat (Batch)
                </button>
                <button
                  type="button"
                  onClick={() => setScriptType('cmd')}
                  disabled={isExecutingScript}
                  className={`px-3 py-1 rounded-[4px] font-mono text-xs transition-colors ${
                    scriptType === 'cmd'
                      ? 'bg-brand text-white font-semibold shadow-xs'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  .cmd
                </button>
              </div>
            </div>

            <div className="relative flex-1">
              <textarea
                value={scriptContent}
                onChange={(e) => setScriptContent(e.target.value)}
                disabled={isExecutingScript}
                placeholder={t(
                  'script_runner.editor_placeholder',
                  'Enter PowerShell or CMD script content here...'
                )}
                aria-label={t('script_runner.editor_title', 'Script Editor')}
                spellCheck={false}
                className="w-full h-80 font-mono text-xs text-text-code bg-surface-subtle border border-border rounded-[6px] p-3 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand resize-none leading-relaxed select-text"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border text-xs text-text-secondary">
              <div className="flex items-center gap-3">
                {uploadedFileName && (
                  <span className="font-mono text-[11px] text-brand truncate max-w-[180px]" title={uploadedFileName}>
                    {uploadedFileName}
                  </span>
                )}
                <span className="font-mono text-[11px] tabular-nums">
                  {lineCount} {t('script_runner.lines', 'lines')} | {charCount} {t('script_runner.chars', 'chars')}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label
                  className="inline-flex items-center gap-1.5 cursor-pointer select-none text-xs text-text-secondary hover:text-text-primary transition-colors"
                  title={t(
                    'script_runner.dry_run_disclaimer',
                    'Simulates system modifications without mutating your operating system.'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={editorDryRun}
                    onChange={(e) => setEditorDryRun(e.target.checked)}
                    disabled={isExecutingScript}
                    className="rounded border-border text-brand focus:ring-brand bg-surface-subtle h-3.5 w-3.5 cursor-pointer disabled:opacity-50"
                  />
                  <span className="font-medium">{t('script_runner.dry_run', 'Dry Run')}</span>
                </label>

                <label
                  className={`inline-flex items-center gap-1.5 cursor-pointer select-none text-xs transition-colors ${
                    isElevated ? 'text-status-success' : 'text-text-secondary hover:text-text-primary'
                  }`}
                  title={
                    isElevated
                      ? t(
                          'script_runner.already_elevated_tooltip',
                          'Process is already running with administrative privileges'
                        )
                      : t(
                          'script_runner.uac_elevation_tooltip',
                          'Execute script with elevated administrator privileges via Windows UAC prompt'
                        )
                  }
                >
                  <input
                    type="checkbox"
                    checked={isElevated || editorRunAsAdmin}
                    disabled={isElevated || isExecutingScript}
                    onChange={(e) => setEditorRunAsAdmin(e.target.checked)}
                    className="rounded border-border text-brand focus:ring-brand bg-surface-subtle h-3.5 w-3.5 cursor-pointer disabled:opacity-50"
                  />
                  {isElevated ? (
                    <ShieldCheck className="h-3.5 w-3.5 text-status-success" />
                  ) : (
                    <Shield className="h-3.5 w-3.5 text-status-warning" />
                  )}
                  <span className="font-medium">
                    {t('script_runner.run_as_admin', 'Run as Administrator')}
                  </span>
                </label>

                <button
                  type="button"
                  onClick={() => openImpactSimulator(undefined, scriptContent)}
                  disabled={!scriptContent.trim() || isExecutingScript}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[6px] font-medium text-xs bg-surface-subtle hover:bg-surface-hover text-text-secondary hover:text-text-primary border border-border transition-colors disabled:opacity-50 shadow-xs"
                  title={t(
                    'script_runner.simulate_impact_tooltip',
                    'Preview affected registry keys, services, tasks, and files before execution'
                  )}
                >
                  <Sliders className="h-3.5 w-3.5" />
                  <span>{t('script_runner.simulate_impact', 'Simulate Impact')}</span>
                </button>

                {isExecutingScript ? (
                  <button
                    type="button"
                    onClick={() => cancelRunningScript()}
                    disabled={isCancellingScript}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-[6px] font-medium text-xs bg-status-danger hover:bg-status-danger/90 text-white transition-colors disabled:opacity-50 shadow-sm"
                    title={t('script_runner.cancel_tooltip', 'Terminate script process tree immediately')}
                  >
                    {isCancellingScript ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>{t('script_runner.cancelling', 'Cancelling...')}</span>
                      </>
                    ) : (
                      <>
                        <Square className="h-4 w-4 fill-current" />
                        <span>{t('script_runner.cancel_execution', 'Cancel Execution')}</span>
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => executeScript(undefined, undefined, { runAsAdmin: editorRunAsAdmin, dryRun: editorDryRun })}
                    disabled={!scriptContent.trim()}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-[6px] font-medium text-xs text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm ${
                      editorRunAsAdmin && !isElevated
                        ? 'bg-status-warning hover:bg-status-warning/90'
                        : 'bg-brand hover:bg-brand-hover'
                    }`}
                  >
                    {editorRunAsAdmin && !isElevated ? (
                      <ShieldAlert className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4 fill-current" />
                    )}
                    <span>
                      {editorDryRun
                        ? t('script_runner.execute_dry_run', 'Dry Run Script')
                        : editorRunAsAdmin && !isElevated
                        ? t('script_runner.execute_as_admin', 'Execute Elevated')
                        : t('script_runner.execute', 'Execute Script')}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>

          <OutputTerminalPanel
            outputLogs={outputLogs}
            isExecutingScript={isExecutingScript}
            isElevatedRunning={isElevatedRunning}
            isCancellingScript={isCancellingScript}
            formattedElapsed={formattedElapsed}
            autoScroll={autoScroll}
            onToggleAutoScroll={() => setAutoScroll(!autoScroll)}
            onCancelScript={() => cancelRunningScript()}
            onDownloadLog={downloadOutputLog}
            onClearLogs={clearOutputLogs}
          />
        </div>
      )}

      {activeRunnerTab === 'library' && (
        <div className="space-y-6">
          <ScriptLibraryFilters
            searchQuery={librarySearchQuery}
            onSearchChange={setLibrarySearchQuery}
            selectedRisk={librarySelectedRisk}
            onRiskChange={setLibrarySelectedRisk}
            selectedCategory={librarySelectedCategory}
            onCategoryChange={setLibrarySelectedCategory}
            categories={categories}
            libraryError={libraryError}
            onRetry={() => fetchLibrary(true)}
            isLoadingLibrary={isLoadingLibrary}
            hasManifest={Boolean(libraryManifest)}
            filteredCount={filteredScripts.length}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredScripts.map((script) => (
              <div
                key={script.id}
                className="flex flex-col justify-between rounded-[6px] border border-border bg-surface p-4 space-y-3 hover:border-brand/40 transition-colors shadow-sm group min-w-0"
              >
                <div className="space-y-2 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-brand font-semibold px-2 py-0.5 rounded bg-brand/10 border border-brand/20">
                      {script.category}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {getRiskBadge(script.riskLevel)}
                      {script.requiresAdmin && (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] text-[10px] font-mono font-semibold bg-status-warning/15 text-status-warning border border-status-warning/30"
                          title={t(
                            'script_runner.requires_admin_tooltip',
                            'This script requires administrative elevation. Click to execute with UAC.'
                          )}
                        >
                          <ShieldAlert className="h-3 w-3" />
                          <span>UAC</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <h3 className="text-sm font-semibold text-text-primary group-hover:text-brand transition-colors leading-snug break-words">
                    {script.name}
                  </h3>
                  <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed">
                    {script.description}
                  </p>

                  <div className="flex flex-wrap gap-1 pt-1 min-w-0">
                    {script.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-subtle text-text-secondary border border-border/60"
                      >
                        #{tag}
                      </span>
                    ))}
                    {script.tags.length > 3 && (
                      <span className="text-[10px] font-mono text-text-secondary/60">
                        +{script.tags.length - 3}
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-border flex flex-wrap items-center justify-between gap-2 min-w-0">
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openScriptPreview(script)}
                      className="h-7 w-7 flex items-center justify-center rounded-[4px] bg-surface-subtle hover:bg-surface-hover text-text-secondary hover:text-text-primary border border-border transition-colors"
                      title={t('script_runner.preview_code', 'Preview Code')}
                      aria-label={t('script_runner.preview_code', 'Preview Code')}
                    >
                      <FileText className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openImpactSimulator(script)}
                      className="h-7 w-7 flex items-center justify-center rounded-[4px] bg-surface-subtle hover:bg-surface-hover text-text-secondary hover:text-text-primary border border-border transition-colors"
                      title={t(
                        'script_runner.simulate_impact_tooltip',
                        'Preview affected registry keys, services, tasks, and files before execution'
                      )}
                      aria-label={t('script_runner.simulate_impact', 'Simulate Impact')}
                    >
                      <Sliders className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 min-w-0">
                    <button
                      type="button"
                      onClick={() => loadScriptToEditor(script)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[4px] text-xs font-medium bg-surface-subtle hover:bg-surface-hover text-text-primary border border-border transition-colors shrink-0"
                      title={t('script_runner.load_to_editor', 'Load to Editor')}
                    >
                      <Code2 className="h-3.5 w-3.5 text-text-secondary" />
                      <span>{t('script_runner.load_to_editor', 'Load')}</span>
                    </button>

                    {script.requiresAdmin || script.riskLevel === 'elevated' || script.riskLevel === 'critical' ? (
                      <button
                        type="button"
                        onClick={() => runLibraryScriptDirectly(script, { runAsAdmin: true })}
                        disabled={isExecutingScript}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-[4px] text-xs font-semibold bg-status-warning/20 hover:bg-status-warning/30 text-status-warning border border-status-warning/40 transition-colors disabled:opacity-50 shadow-xs shrink-0"
                        title={t(
                          'script_runner.run_as_admin_tooltip',
                          'Run this script with elevated administrator privileges (UAC prompt)'
                        )}
                      >
                        <ShieldAlert className="h-3.5 w-3.5" />
                        <span>{t('script_runner.run_as_admin_short', 'Run Admin')}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => runLibraryScriptDirectly(script, { runAsAdmin: false })}
                        disabled={isExecutingScript}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-[4px] text-xs font-semibold bg-brand hover:bg-brand-hover text-white transition-colors disabled:opacity-50 shadow-xs shrink-0"
                        title={t('script_runner.run_directly', 'Run Directly')}
                      >
                        <Play className="h-3.5 w-3.5 fill-current" />
                        <span>{t('script_runner.run_directly', 'Run')}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeRunnerTab === 'history' && (
        <div className="flex-1 min-h-0">
          <ScriptExecutionHistoryView />
        </div>
      )}

      <ScriptDetailsModal
        script={previewScript}
        content={previewContent}
        isLoading={isLoadingPreview}
        isElevated={isElevated}
        isExecutingScript={isExecutingScript}
        onClose={closeScriptPreview}
        onLoadToEditor={loadScriptToEditor}
        onRunDirectly={(script, opts) => runLibraryScriptDirectly(script, opts)}
        onSimulateImpact={(script, content) => openImpactSimulator(script, content)}
      />

      <ScriptRunnerModal
        script={parameterDialogScript}
        initialValues={parameterValues}
        validationErrors={parameterValidationErrors}
        isElevated={isElevated}
        isExecutingScript={isExecutingScript}
        onClose={closeParameterDialog}
        onExecute={(script, values, options) =>
          executeScriptWithParameters(script, values, options)
        }
      />

      <ImpactSimulatorModal
        script={impactSimulatorScript}
        scriptContent={impactSimulatorContent || scriptContent}
        isOpen={isImpactSimulatorOpen}
        isElevated={isElevated}
        isExecutingScript={isExecutingScript}
        onClose={closeImpactSimulator}
        onExecuteDryRun={(targetScript, content, shouldElevate) => {
          if (targetScript) {
            runLibraryScriptDirectly(targetScript, { runAsAdmin: shouldElevate, dryRun: true });
          } else {
            executeScript(content, scriptType, { runAsAdmin: shouldElevate, dryRun: true });
          }
        }}
        onExecuteLive={(targetScript, content, shouldElevate) => {
          if (targetScript) {
            runLibraryScriptDirectly(targetScript, { runAsAdmin: shouldElevate, dryRun: false });
          } else {
            executeScript(content, scriptType, { runAsAdmin: shouldElevate, dryRun: false });
          }
        }}
        onLoadToEditor={loadScriptToEditor}
      />
    </div>
  );
}
