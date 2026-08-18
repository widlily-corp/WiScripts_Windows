import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Terminal,
  Upload,
  Play,
  Download,
  Trash2,
  FileCode,
  ShieldCheck,
  ShieldAlert,
  Shield,
  Loader2,
  ArrowDown,
  Globe,
  RefreshCw,
  Search,
  CheckCircle2,
  Wrench,
  Wifi,
  Lock,
  Zap,
  Activity,
  Layers,
  Code2,
  X,
  FileText,
  Copy,
  Check,
  Square,
  Timer,
  Sliders,
  RotateCcw,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { AdminElevationBanner } from './AdminElevationBanner';
import type { ScriptCategory, ScriptRiskLevel } from '../types';

export function ScriptRunnerView() {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Store state
  const isElevated = useAppStore((s) => s.isElevated ?? s.systemInfo?.isElevated ?? false);
  const scriptContent = useAppStore((s) => s.scriptContent);
  const scriptType = useAppStore((s) => s.scriptType);
  const uploadedFileName = useAppStore((s) => s.uploadedFileName);
  const outputLogs = useAppStore((s) => s.outputLogs);
  const isExecutingScript = useAppStore((s) => s.isExecutingScript);
  const activeExecutionId = useAppStore((s) => s.activeExecutionId);
  const isCancellingScript = useAppStore((s) => s.isCancellingScript);
  const executionStartTime = useAppStore((s) => s.executionStartTime);

  // Online Library state
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

  // Parameter Configuration Dialog State
  const parameterDialogScript = useAppStore((s) => s.parameterDialogScript);
  const parameterValues = useAppStore((s) => s.parameterValues);
  const parameterValidationErrors = useAppStore((s) => s.parameterValidationErrors);

  // Actions
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

  // Parameter Dialog Actions
  const closeParameterDialog = useAppStore((s) => s.closeParameterDialog);
  const setParameterValue = useAppStore((s) => s.setParameterValue);
  const resetParameterValues = useAppStore((s) => s.resetParameterValues);
  const executeScriptWithParameters = useAppStore((s) => s.executeScriptWithParameters);

  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [copiedHash, setCopiedHash] = useState<boolean>(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  // Timer tracking active execution
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

  // Mount effects
  useEffect(() => {
    setupScriptOutputListener();
    return () => {
      cleanupScriptOutputListener();
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, [setupScriptOutputListener, cleanupScriptOutputListener]);

  useEffect(() => {
    if (!libraryManifest && !isLoadingLibrary) {
      fetchLibrary(false);
    }
  }, [libraryManifest, isLoadingLibrary, fetchLibrary]);

  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [outputLogs, autoScroll]);

  // Handle ESC key for modal dialogs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (parameterDialogScript) {
          closeParameterDialog();
        } else if (previewScript) {
          closeScriptPreview();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewScript, closeScriptPreview, parameterDialogScript, closeParameterDialog]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
  };

  const handleClearEditor = () => {
    setScriptContent('');
    setUploadedFileName(null);
  };

  const handleCopyChecksum = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(true);
    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current);
    }
    copyTimeoutRef.current = setTimeout(() => {
      setCopiedHash(false);
      copyTimeoutRef.current = null;
    }, 2000);
  };

  // Filtered scripts calculation
  const filteredScripts = useMemo(() => {
    if (!libraryManifest?.scripts) return [];
    return libraryManifest.scripts.filter((script) => {
      // Category filter
      if (
        librarySelectedCategory !== 'all' &&
        script.category.toLowerCase() !== librarySelectedCategory.toLowerCase()
      ) {
        return false;
      }
      // Risk filter
      if (
        librarySelectedRisk !== 'all' &&
        script.riskLevel.toLowerCase() !== librarySelectedRisk.toLowerCase()
      ) {
        return false;
      }
      // Search query filter
      if (librarySearchQuery.trim()) {
        const q = librarySearchQuery.toLowerCase().trim();
        const matchesName = script.name.toLowerCase().includes(q);
        const matchesDesc = script.description.toLowerCase().includes(q);
        const matchesTags = script.tags.some((t) => t.toLowerCase().includes(q));
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
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-[11px] font-medium bg-status-errorSubtle text-status-error border border-status-error/30">
        <Shield className="h-3 w-3" />
        <span>{t('script_runner.risk_critical', 'Critical')}</span>
      </span>
    );
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header & Privilege Badge */}
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

      {/* Admin Elevation Warning Banner (if non-elevated) */}
      <AdminElevationBanner featureName={t('script_runner.admin_feature_name', 'Script Execution')} />

      {/* Active Execution Floating/Sticky Banner when in library view */}
      {isExecutingScript && activeRunnerTab === 'library' && (
        <div className="flex items-center justify-between p-3 rounded-[6px] border border-brand/40 bg-brand/10 text-text-primary text-xs shadow-sm">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-brand" />
            <span className="font-medium">{t('script_runner.active_execution_banner', 'A script is actively executing')}</span>
            <span className="font-mono text-brand font-bold tabular-nums">({formattedElapsed})</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => cancelRunningScript()}
              disabled={isCancellingScript}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[4px] font-medium text-xs bg-status-error hover:bg-status-error/90 text-white transition-colors disabled:opacity-50"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
              <span>{isCancellingScript ? t('script_runner.cancelling', 'Cancelling...') : t('script_runner.cancel', 'Cancel')}</span>
            </button>
            <button
              onClick={() => setActiveRunnerTab('editor')}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[4px] font-medium text-xs bg-surface-card hover:bg-surface-hover border border-border text-text-primary transition-colors"
            >
              <span>{t('script_runner.view_terminal', 'View Terminal')}</span>
            </button>
          </div>
        </div>
      )}

      {/* Primary Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-border pb-2">
        <div className="inline-flex p-1 rounded-[6px] bg-surface-subtle border border-border">
          <button
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
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono tabular-nums ${
                  activeRunnerTab === 'library'
                    ? 'bg-white/20 text-white'
                    : 'bg-surface-card border border-border text-text-secondary'
                }`}
              >
                {libraryManifest.scripts.length}
              </span>
            )}
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
              onClick={() => fetchLibrary(true)}
              disabled={isLoadingLibrary}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-xs font-medium bg-surface-card hover:bg-surface-hover text-text-primary border border-border transition-colors disabled:opacity-50 shadow-xs"
              title={t('script_runner.sync_library', 'Sync with GitHub')}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoadingLibrary ? 'animate-spin text-brand' : ''}`} />
              <span>{isLoadingLibrary ? t('script_runner.syncing', 'Syncing...') : t('script_runner.sync_library', 'Sync with GitHub')}</span>
            </button>
          </div>
        )}
      </div>

      {/* TAB 1: Editor & Terminal */}
      {activeRunnerTab === 'editor' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: Script Editor */}
          <div className="flex flex-col rounded-[6px] border border-border bg-surface-card p-4 space-y-4 shadow-sm">
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
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isExecutingScript}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] text-xs font-medium bg-surface-subtle hover:bg-surface-hover text-text-primary border border-border transition-colors disabled:opacity-50"
                  title={t('script_runner.upload_file', 'Upload File')}
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>{t('script_runner.upload_file', 'Upload File')}</span>
                </button>

                <button
                  onClick={handleClearEditor}
                  disabled={isExecutingScript || !scriptContent}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] text-xs font-medium bg-surface-subtle hover:bg-surface-hover text-text-secondary hover:text-status-error border border-border transition-colors disabled:opacity-50"
                  title={t('script_runner.clear_editor', 'Clear Editor')}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Script Type Selector Toggle */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-secondary font-medium">
                {t('script_runner.script_type', 'Script Type:')}
              </span>
              <div className="inline-flex p-0.5 rounded-[6px] bg-surface-subtle border border-border">
                <button
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

            {/* Code Textarea Editor */}
            <div className="relative flex-1">
              <textarea
                value={scriptContent}
                onChange={(e) => setScriptContent(e.target.value)}
                disabled={isExecutingScript}
                placeholder={t(
                  'script_runner.editor_placeholder',
                  'Enter PowerShell or CMD script content here...'
                )}
                spellCheck={false}
                className="w-full h-80 font-mono text-xs text-text-code bg-surface-subtle border border-border rounded-[6px] p-3 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand resize-none leading-relaxed select-text"
              />
            </div>

            {/* Footer Bar (File & Line Info + Execution Trigger / Cancel Trigger) */}
            <div className="flex items-center justify-between pt-2 border-t border-border text-xs text-text-secondary">
              <div className="flex items-center gap-3">
                {uploadedFileName && (
                  <span className="font-mono text-[11px] text-brand truncate max-w-[180px]">
                    {uploadedFileName}
                  </span>
                )}
                <span className="font-mono text-[11px] tabular-nums">
                  {lineCount} {t('script_runner.lines', 'lines')} | {charCount} {t('script_runner.chars', 'chars')}
                </span>
              </div>

              {isExecutingScript ? (
                <button
                  onClick={() => cancelRunningScript()}
                  disabled={isCancellingScript}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-[6px] font-medium text-xs bg-status-error hover:bg-status-error/90 text-white transition-colors disabled:opacity-50 shadow-sm"
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
                  onClick={() => executeScript()}
                  disabled={!scriptContent.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-[6px] font-medium text-xs bg-brand hover:bg-brand-hover text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                >
                  <Play className="h-4 w-4 fill-current" />
                  <span>{t('script_runner.execute', 'Execute Script')}</span>
                </button>
              )}
            </div>
          </div>

          {/* Right Column: Execution Output Terminal Console */}
          <div className="flex flex-col rounded-[6px] border border-border bg-surface-card p-4 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-brand" />
                <span className="text-sm font-semibold text-text-primary">
                  {t('script_runner.terminal_title', 'Execution Output Console')}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {isExecutingScript && (
                  <div className="flex items-center gap-1.5 mr-1">
                    <span className="inline-flex items-center gap-1 font-mono text-[11px] text-brand bg-brand/10 px-2 py-0.5 rounded border border-brand/30">
                      <Timer className="h-3 w-3 animate-pulse" />
                      <span>{formattedElapsed}</span>
                    </span>
                    <button
                      onClick={() => cancelRunningScript()}
                      disabled={isCancellingScript}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-[4px] font-mono text-[11px] bg-status-errorSubtle hover:bg-status-error/20 text-status-error border border-status-error/40 transition-colors disabled:opacity-50"
                      title={t('script_runner.cancel_execution', 'Cancel Execution')}
                    >
                      <Square className="h-3 w-3 fill-current" />
                      <span>{isCancellingScript ? t('script_runner.cancelling', 'Cancelling...') : t('script_runner.cancel', 'Cancel')}</span>
                    </button>
                  </div>
                )}

                <button
                  onClick={() => setAutoScroll(!autoScroll)}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-[4px] font-mono text-[11px] border transition-colors ${
                    autoScroll
                      ? 'bg-brand/10 border-brand/40 text-brand'
                      : 'bg-surface-subtle border-border text-text-secondary'
                  }`}
                  title={t('script_runner.toggle_autoscroll', 'Toggle Auto-scroll')}
                >
                  <ArrowDown className="h-3 w-3" />
                  <span>Auto-scroll</span>
                </button>

                <button
                  onClick={downloadOutputLog}
                  disabled={outputLogs.length === 0}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] text-xs font-medium bg-surface-subtle hover:bg-surface-hover text-text-primary border border-border transition-colors disabled:opacity-50"
                  title={t('script_runner.download_log', 'Download Output Log')}
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>{t('script_runner.download_log', 'Download Log')}</span>
                </button>

                <button
                  onClick={clearOutputLogs}
                  disabled={outputLogs.length === 0 || isExecutingScript}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] text-xs font-medium bg-surface-subtle hover:bg-surface-hover text-text-secondary hover:text-status-error border border-border transition-colors disabled:opacity-50"
                  title={t('script_runner.clear_terminal', 'Clear Log Console')}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Console Window */}
            <div className="relative flex-1 bg-surface-subtle border border-border rounded-[6px] p-3 font-mono text-xs text-text-code h-80 overflow-y-auto space-y-1 select-text">
              {outputLogs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-text-secondary text-center p-4 space-y-2 select-none">
                  <Terminal className="h-8 w-8 text-text-secondary/40" />
                  <p className="text-xs">
                    {t(
                      'script_runner.no_output',
                      'Console idle. Run a script to view live stdout/stderr stream.'
                    )}
                  </p>
                </div>
              ) : (
                outputLogs.map((item) => (
                  <div
                    key={item.id}
                    className={`leading-relaxed whitespace-pre-wrap break-all ${
                      item.stream === 'stderr'
                        ? 'text-status-error font-medium'
                        : 'text-text-primary'
                    }`}
                  >
                    <span className="text-text-secondary/50 text-[10px] select-none mr-2">
                      [{item.timestamp}]
                    </span>
                    <span>{item.line}</span>
                  </div>
                ))
              )}
              <div ref={terminalEndRef} />
            </div>

            {/* Console Footer Stats */}
            <div className="flex items-center justify-between text-xs text-text-secondary pt-1">
              <span className="font-mono tabular-nums">
                {outputLogs.length} {t('script_runner.log_lines', 'output entries')}
              </span>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    isExecutingScript ? 'bg-brand animate-ping' : 'bg-status-success'
                  }`}
                />
                <span className="font-mono text-[11px]">
                  {isExecutingScript
                    ? t('script_runner.status_executing', 'STREAMING')
                    : t('script_runner.status_idle', 'READY')}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Online Script Library */}
      {activeRunnerTab === 'library' && (
        <div className="space-y-6">
          {/* Controls Bar: Search & Category Chips */}
          <div className="flex flex-col gap-4 bg-surface-card border border-border rounded-[6px] p-4 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              {/* Search Bar */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-text-secondary/60" />
                <input
                  type="text"
                  value={librarySearchQuery}
                  onChange={(e) => setLibrarySearchQuery(e.target.value)}
                  placeholder={t(
                    'script_runner.search_placeholder',
                    'Search scripts by name, tags, description...'
                  )}
                  className="w-full bg-surface-subtle border border-border rounded-[6px] pl-9 pr-8 py-2 text-xs text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                />
                {librarySearchQuery && (
                  <button
                    onClick={() => setLibrarySearchQuery('')}
                    className="absolute right-2.5 top-2.5 text-text-secondary hover:text-text-primary"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Risk Level Filter Dropdown / Pill */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-text-secondary font-medium">Risk:</span>
                <div className="inline-flex p-0.5 rounded-[6px] bg-surface-subtle border border-border">
                  {(['all', 'safe', 'elevated'] as const).map((risk) => (
                    <button
                      key={risk}
                      onClick={() => setLibrarySelectedRisk(risk)}
                      className={`px-2.5 py-1 rounded-[4px] text-[11px] font-medium capitalize transition-colors ${
                        librarySelectedRisk === risk
                          ? 'bg-brand text-white shadow-xs'
                          : 'text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      {risk === 'all' ? t('script_runner.risk_all', 'All') : risk}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Category Filter Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setLibrarySelectedCategory(cat.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-xs font-medium border transition-colors shrink-0 ${
                    librarySelectedCategory === cat.id
                      ? 'bg-brand text-white border-brand shadow-xs'
                      : 'bg-surface-subtle hover:bg-surface-hover text-text-secondary hover:text-text-primary border-border'
                  }`}
                >
                  {cat.icon}
                  <span>{cat.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Error Banner */}
          {libraryError && (
            <div className="p-4 rounded-[6px] border border-status-error/40 bg-status-errorSubtle text-status-error flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>{libraryError}</span>
              </div>
              <button
                onClick={() => fetchLibrary(true)}
                className="px-3 py-1 bg-surface-card hover:bg-surface-hover text-text-primary border border-border text-xs rounded-[4px] font-medium shrink-0"
              >
                Retry
              </button>
            </div>
          )}

          {/* Loading Skeletons */}
          {isLoadingLibrary && !libraryManifest && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={idx}
                  className="border border-border rounded-[6px] bg-surface-card p-4 space-y-3 animate-pulse"
                >
                  <div className="h-4 bg-surface-subtle rounded w-3/4" />
                  <div className="h-3 bg-surface-subtle rounded w-full" />
                  <div className="h-3 bg-surface-subtle rounded w-5/6" />
                  <div className="flex gap-2 pt-2">
                    <div className="h-6 bg-surface-subtle rounded w-16" />
                    <div className="h-6 bg-surface-subtle rounded w-16" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty State */}
          {!isLoadingLibrary && filteredScripts.length === 0 && (
            <div className="flex flex-col items-center justify-center p-12 border border-dashed border-border rounded-[6px] bg-surface-card text-center space-y-3">
              <Code2 className="h-8 w-8 text-text-secondary/40" />
              <p className="text-sm font-semibold text-text-primary">
                {t('script_runner.no_scripts_found', 'No scripts found matching the active filter criteria.')}
              </p>
              <p className="text-xs text-text-secondary max-w-sm">
                Try clearing your search query or selecting another category above.
              </p>
              {(librarySearchQuery || librarySelectedCategory !== 'all' || librarySelectedRisk !== 'all') && (
                <button
                  onClick={() => {
                    setLibrarySearchQuery('');
                    setLibrarySelectedCategory('all');
                    setLibrarySelectedRisk('all');
                  }}
                  className="px-3 py-1.5 rounded-[6px] text-xs font-medium bg-surface-subtle hover:bg-surface-hover text-text-primary border border-border"
                >
                  Clear Filters
                </button>
              )}
            </div>
          )}

          {/* Scripts Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredScripts.map((script) => (
              <div
                key={script.id}
                className="flex flex-col justify-between rounded-[6px] border border-border bg-surface-card p-4 space-y-3 hover:border-brand/40 transition-colors shadow-sm group"
              >
                <div className="space-y-2">
                  {/* Top Bar: Category & Badges */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-brand font-semibold px-2 py-0.5 rounded bg-brand/10 border border-brand/20">
                      {script.category}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {getRiskBadge(script.riskLevel)}
                      {script.requiresAdmin && (
                        <span
                          className="p-1 rounded-[4px] bg-surface-subtle text-text-secondary border border-border"
                          title={t('script_runner.requires_admin', 'Admin Required')}
                        >
                          <Lock className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Title & Description */}
                  <h3 className="text-sm font-semibold text-text-primary group-hover:text-brand transition-colors leading-snug">
                    {script.name}
                  </h3>
                  <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed">
                    {script.description}
                  </p>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1 pt-1">
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

                {/* Footer Action Buttons */}
                <div className="pt-3 border-t border-border flex items-center justify-between gap-2">
                  <button
                    onClick={() => openScriptPreview(script)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[4px] text-xs font-medium bg-surface-subtle hover:bg-surface-hover text-text-primary border border-border transition-colors"
                    title={t('script_runner.preview_code', 'Preview Code')}
                  >
                    <FileText className="h-3.5 w-3.5 text-text-secondary" />
                    <span>{t('script_runner.preview_code', 'Preview')}</span>
                  </button>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => loadScriptToEditor(script)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[4px] text-xs font-medium bg-surface-subtle hover:bg-surface-hover text-text-primary border border-border transition-colors"
                      title={t('script_runner.load_to_editor', 'Load to Editor')}
                    >
                      <Code2 className="h-3.5 w-3.5" />
                      <span>{t('script_runner.load_to_editor', 'Load')}</span>
                    </button>

                    <button
                      onClick={() => runLibraryScriptDirectly(script)}
                      disabled={isExecutingScript}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-[4px] text-xs font-medium bg-brand hover:bg-brand-hover text-white transition-colors disabled:opacity-50 shadow-xs"
                      title={t('script_runner.run_directly', 'Run Directly')}
                    >
                      <Play className="h-3.5 w-3.5 fill-current" />
                      <span>{t('script_runner.run_directly', 'Run')}</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Code Preview Modal */}
      {previewScript && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex flex-col w-full max-w-4xl max-h-[90vh] bg-surface-card border border-border rounded-[8px] shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-border bg-surface-subtle">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-[6px] bg-brand/10 border border-brand/30 text-brand">
                  <FileCode className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-text-primary tracking-tight">
                      {previewScript.name}
                    </h2>
                    {getRiskBadge(previewScript.riskLevel)}
                    {previewScript.requiresAdmin && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-card border border-border text-text-secondary">
                        Admin Required
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-secondary mt-0.5">
                    {previewScript.path} | v{previewScript.version} | Author: {previewScript.author}
                  </p>
                </div>
              </div>

              <button
                onClick={closeScriptPreview}
                className="p-1.5 rounded-[6px] text-text-secondary hover:text-text-primary hover:bg-surface-hover border border-transparent hover:border-border transition-colors"
                title={t('script_runner.close_preview', 'Close Preview')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Metadata Header Info */}
            <div className="p-4 bg-surface-card border-b border-border space-y-2 text-xs">
              <p className="text-text-secondary leading-relaxed">
                {previewScript.description}
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-text-secondary font-medium">SHA-256:</span>
                <code className="font-mono text-[11px] bg-surface-subtle text-text-code px-2 py-0.5 rounded border border-border/80">
                  {previewScript.sha256}
                </code>
                <button
                  onClick={() => handleCopyChecksum(previewScript.sha256)}
                  className="inline-flex items-center gap-1 text-[11px] text-brand hover:underline"
                >
                  {copiedHash ? (
                    <>
                      <Check className="h-3 w-3 text-status-success" />
                      <span className="text-status-success">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span>Copy Hash</span>
                    </>
                  )}
                </button>
              </div>

              {/* Configurable parameters if present */}
              {previewScript.parameters && previewScript.parameters.length > 0 && (
                <div className="pt-2">
                  <span className="font-semibold text-text-primary text-[11px]">
                    {t('script_runner.parameters_label', 'Configurable Parameters')}:
                  </span>
                  <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {previewScript.parameters.map((param) => (
                      <div
                        key={param.name}
                        className="p-2 rounded bg-surface-subtle border border-border text-[11px]"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-brand">{param.name}</span>
                          <span className="font-mono text-text-secondary text-[10px]">
                            {param.type} (default: {String(param.default)})
                          </span>
                        </div>
                        <p className="text-text-secondary text-[10px] mt-0.5">{param.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Code Viewer */}
            <div className="flex-1 overflow-y-auto p-4 bg-surface-subtle select-text">
              {isLoadingPreview ? (
                <div className="flex flex-col items-center justify-center h-64 text-text-secondary space-y-2">
                  <Loader2 className="h-6 w-6 animate-spin text-brand" />
                  <span className="text-xs">Loading verified script code...</span>
                </div>
              ) : (
                <pre className="font-mono text-xs text-text-code leading-relaxed whitespace-pre-wrap break-all">
                  {previewContent ?? '# Error reading script content'}
                </pre>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between p-4 border-t border-border bg-surface-subtle">
              <div className="flex items-center gap-2 text-xs text-text-secondary">
                <CheckCircle2 className="h-4 w-4 text-status-success" />
                <span>SHA-256 Integrity Verified</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => loadScriptToEditor(previewScript)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[6px] text-xs font-medium bg-surface-card hover:bg-surface-hover text-text-primary border border-border transition-colors shadow-xs"
                >
                  <Code2 className="h-4 w-4" />
                  <span>{t('script_runner.load_to_editor', 'Load to Editor')}</span>
                </button>

                <button
                  onClick={() => runLibraryScriptDirectly(previewScript)}
                  disabled={isExecutingScript}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[6px] text-xs font-medium bg-brand hover:bg-brand-hover text-white transition-colors disabled:opacity-50 shadow-sm"
                >
                  <Play className="h-4 w-4 fill-current" />
                  <span>{t('script_runner.run_directly', 'Run Directly')}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Parameter Configuration Modal Dialog */}
      {parameterDialogScript && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex flex-col w-full max-w-xl max-h-[90vh] bg-surface-card border border-border rounded-[8px] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border bg-surface-subtle">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-[6px] bg-brand/10 border border-brand/30 text-brand">
                  <Sliders className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-text-primary">
                    {t('script_runner.param_dialog_title', 'Configure Script Parameters')}
                  </h2>
                  <p className="text-xs text-text-secondary">
                    {parameterDialogScript.name} (v{parameterDialogScript.version})
                  </p>
                </div>
              </div>
              <button
                onClick={closeParameterDialog}
                className="p-1.5 rounded-[6px] text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {parameterDialogScript.parameters?.map((param) => {
                const error = parameterValidationErrors[param.name];
                const value = parameterValues[param.name];
                return (
                  <div
                    key={param.name}
                    className={`p-3 rounded-[6px] border bg-surface-subtle space-y-1.5 ${
                      error ? 'border-status-error/60' : 'border-border'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <label className="font-mono text-xs font-bold text-brand">
                        ${param.name}
                      </label>
                      <span className="text-[10px] text-text-secondary">
                        Default: {String(param.default)}
                      </span>
                    </div>
                    <p className="text-xs text-text-secondary">
                      {param.description}
                    </p>
                    {param.type === 'boolean' ? (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => setParameterValue(param.name, !value)}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none border border-transparent ${
                            value ? 'bg-brand' : 'bg-surface-card border-border'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition duration-200 ease-in-out shadow-sm mt-0.5 ${
                              value ? 'translate-x-4' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                      </div>
                    ) : (
                      <input
                        type={param.type === 'number' ? 'number' : 'text'}
                        value={value !== undefined && value !== null ? String(value) : ''}
                        onChange={(e) =>
                          setParameterValue(
                            param.name,
                            param.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value
                          )
                        }
                        className="w-full bg-surface-card border border-border rounded-[4px] px-3 py-1.5 text-xs font-mono text-text-primary focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                      />
                    )}
                    {error && <p className="text-[11px] text-status-error">{error}</p>}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between p-4 border-t border-border bg-surface-subtle">
              <button
                onClick={resetParameterValues}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] text-xs font-medium bg-surface-card hover:bg-surface-hover border border-border text-text-secondary hover:text-text-primary transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>{t('script_runner.param_dialog_reset', 'Reset to Defaults')}</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={closeParameterDialog}
                  className="px-3 py-1.5 rounded-[4px] text-xs font-medium bg-surface-card hover:bg-surface-hover border border-border text-text-secondary hover:text-text-primary transition-colors"
                >
                  {t('script_runner.cancel', 'Cancel')}
                </button>
                <button
                  onClick={() => executeScriptWithParameters(parameterDialogScript)}
                  disabled={isExecutingScript}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-[4px] text-xs font-medium bg-brand hover:bg-brand-hover text-white transition-colors disabled:opacity-50 shadow-sm"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  <span>{t('script_runner.param_dialog_run', 'Run with Parameters')}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
