import React, { useEffect, useRef, useState } from 'react';
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
  Loader2,
  ArrowDown,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { AdminElevationBanner } from './AdminElevationBanner';

export function ScriptRunnerView() {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  const isElevated = useAppStore((s) => s.isElevated ?? s.systemInfo?.isElevated ?? false);
  const scriptContent = useAppStore((s) => s.scriptContent);
  const scriptType = useAppStore((s) => s.scriptType);
  const uploadedFileName = useAppStore((s) => s.uploadedFileName);
  const outputLogs = useAppStore((s) => s.outputLogs);
  const isExecutingScript = useAppStore((s) => s.isExecutingScript);

  const setScriptContent = useAppStore((s) => s.setScriptContent);
  const setScriptType = useAppStore((s) => s.setScriptType);
  const setUploadedFileName = useAppStore((s) => s.setUploadedFileName);
  const clearOutputLogs = useAppStore((s) => s.clearOutputLogs);
  const executeScript = useAppStore((s) => s.executeScript);
  const downloadOutputLog = useAppStore((s) => s.downloadOutputLog);
  const setupScriptOutputListener = useAppStore((s) => s.setupScriptOutputListener);
  const cleanupScriptOutputListener = useAppStore((s) => s.cleanupScriptOutputListener);

  const [autoScroll, setAutoScroll] = useState<boolean>(true);

  useEffect(() => {
    setupScriptOutputListener();
    return () => {
      cleanupScriptOutputListener();
    };
  }, [setupScriptOutputListener, cleanupScriptOutputListener]);

  useEffect(() => {
    if (autoScroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [outputLogs, autoScroll]);

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

  const lineCount = scriptContent ? scriptContent.split('\n').length : 0;
  const charCount = scriptContent.length;

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

      {/* Main Workspace Split */}
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
              className="w-full h-80 font-mono text-xs text-text-code bg-surface-subtle border border-border rounded-[6px] p-3 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand resize-none leading-relaxed"
            />
          </div>

          {/* Footer Bar (File & Line Info + Execution Trigger) */}
          <div className="flex items-center justify-between pt-2 border-t border-border text-xs text-text-secondary">
            <div className="flex items-center gap-3">
              {uploadedFileName && (
                <span className="font-mono text-[11px] text-brand truncate max-w-[180px]">
                  {uploadedFileName}
                </span>
              )}
              <span className="font-mono text-[11px]">
                {lineCount} {t('script_runner.lines', 'lines')} | {charCount} {t('script_runner.chars', 'chars')}
              </span>
            </div>

            <button
              onClick={() => executeScript()}
              disabled={isExecutingScript || !scriptContent.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-[6px] font-medium text-xs bg-brand hover:bg-brand-hover text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {isExecutingScript ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{t('script_runner.executing', 'Executing...')}</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-current" />
                  <span>{t('script_runner.execute', 'Execute Script')}</span>
                </>
              )}
            </button>
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
          <div className="relative flex-1 bg-[#0D1117] border border-border rounded-[6px] p-3 font-mono text-xs text-text-code h-80 overflow-y-auto space-y-1 select-text">
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
            <span>
              {outputLogs.length} {t('script_runner.log_lines', 'output entries')}
            </span>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-status-success" />
              <span className="font-mono text-[11px]">
                {isExecutingScript
                  ? t('script_runner.status_executing', 'STREAMING')
                  : t('script_runner.status_idle', 'READY')}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
