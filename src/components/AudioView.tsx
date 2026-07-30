import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store/useAppStore';
import { AdminElevationBanner } from './AdminElevationBanner';
import { AudioDevice, AppAudioSession } from '../types';
import {
  Volume2,
  VolumeX,
  Speaker,
  Mic,
  Sliders,
  Radio,
  RefreshCw,
  Search,
  Music,
  Globe,
  MessageSquare,
  Gamepad2,
  AppWindow,
  RotateCcw,
  Check,
  AlertCircle,
  Activity,
} from 'lucide-react';

export function AudioView() {
  const { t } = useTranslation();
  const audioDevicesPayload = useAppStore((s) => s.audioDevicesPayload || s.audioDevices);
  const appAudioSessions = useAppStore((s) => s.appAudioSessions);
  const isAudioLoading = useAppStore((s) => s.isAudioLoading || s.audioLoading);
  const fetchAudioDevices = useAppStore((s) => s.fetchAudioDevices);
  const fetchAppAudioSessions = useAppStore((s) => s.fetchAppAudioSessions);
  const setGlobalAudioDevice = useAppStore((s) => s.setGlobalAudioDevice);
  const setAppAudioDevice = useAppStore((s) => s.setAppAudioDevice);
  const setAppVolume = useAppStore((s) => s.setAppVolume);
  const dryRunMode = useAppStore((s) => s.dryRunMode);

  const [searchQuery, setSearchQuery] = useState('');
  const [autoPoll, setAutoPoll] = useState(true);

  // Initial load
  useEffect(() => {
    fetchAudioDevices();
    fetchAppAudioSessions();
  }, [fetchAudioDevices, fetchAppAudioSessions]);

  // Auto-polling interval for dynamic session changes
  useEffect(() => {
    if (!autoPoll) return;
    const interval = setInterval(() => {
      fetchAppAudioSessions();
    }, 3000);
    return () => clearInterval(interval);
  }, [autoPoll, fetchAppAudioSessions]);

  const handleRefresh = async () => {
    await Promise.all([fetchAudioDevices(), fetchAppAudioSessions()]);
  };

  const renderDevices = audioDevicesPayload?.renderDevices || [];
  const captureDevices = audioDevicesPayload?.captureDevices || [];
  const defaultRenderId = audioDevicesPayload?.defaultRenderId;
  const defaultCaptureId = audioDevicesPayload?.defaultCaptureId;

  const activeRenderDevice = renderDevices.find((d) => d.id === defaultRenderId || d.isDefault) || renderDevices[0];
  const activeCaptureDevice = captureDevices.find((d) => d.id === defaultCaptureId || d.isDefault) || captureDevices[0];

  const filteredSessions = appAudioSessions.filter((session) => {
    const query = searchQuery.toLowerCase();
    return (
      session.name.toLowerCase().includes(query) ||
      (session.processName && session.processName.toLowerCase().includes(query)) ||
      (session.displayName && session.displayName.toLowerCase().includes(query)) ||
      session.pid.toString().includes(query)
    );
  });

  const resolveAppIcon = (session: AppAudioSession) => {
    const iconKey = (session.icon || session.name).toLowerCase();
    if (iconKey.includes('spotify') || iconKey.includes('music')) return <Music className="h-4 w-4 text-emerald-400 shrink-0" />;
    if (iconKey.includes('chrome') || iconKey.includes('edge') || iconKey.includes('browser') || iconKey.includes('globe'))
      return <Globe className="h-4 w-4 text-sky-400 shrink-0" />;
    if (iconKey.includes('discord') || iconKey.includes('chat') || iconKey.includes('teams'))
      return <MessageSquare className="h-4 w-4 text-indigo-400 shrink-0" />;
    if (iconKey.includes('game') || iconKey.includes('steam')) return <Gamepad2 className="h-4 w-4 text-purple-400 shrink-0" />;
    return <AppWindow className="h-4 w-4 text-text-secondary shrink-0" />;
  };

  return (
    <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-3.5rem)] bg-background">
      <AdminElevationBanner featureName={t('audioView.title')} />

      {/* Header Bar */}
      <div className="rounded-[6px] border border-border bg-surface p-5 flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Volume2 className="h-5 w-5 text-brand" />
            <h2 className="text-base font-semibold text-text-primary leading-tight">
              {t('audioView.title')}
            </h2>
            {dryRunMode && (
              <span className="text-[10px] font-mono uppercase bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-[4px] font-bold">
                Dry-Run Mode
              </span>
            )}
          </div>
          <p className="text-xs text-text-secondary leading-relaxed">
            {t('audioView.description')}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setAutoPoll(!autoPoll)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] text-xs font-mono border transition-colors ${
              autoPoll
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-surface-subtle text-text-muted border-border-subtle hover:text-text-secondary'
            }`}
            aria-label="Toggle session auto-polling"
            title="Auto-refresh active audio app sessions every 3 seconds"
          >
            <Activity className="h-3.5 w-3.5" />
            <span>{autoPoll ? 'Auto-Poll: ON' : 'Auto-Poll: OFF'}</span>
          </button>

          <button
            onClick={handleRefresh}
            disabled={isAudioLoading}
            className="flex items-center gap-2 rounded-[6px] border border-border bg-surface-hover px-3.5 py-1.5 text-xs font-mono text-text-secondary hover:bg-surface-active transition-colors disabled:opacity-50"
            aria-label={t('audioView.refresh')}
          >
            <RefreshCw className={`h-3.5 w-3.5 text-brand ${isAudioLoading ? 'animate-spin' : ''}`} />
            <span>{t('audioView.refresh')}</span>
          </button>
        </div>
      </div>

      {/* Summary Metrics Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-[6px] border border-border bg-surface p-4 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-text-secondary font-medium">{t('audioView.totalDevices')} (Render)</span>
            <div className="text-xl font-bold font-mono tabular-nums text-text-primary">
              {renderDevices.length}
            </div>
          </div>
          <div className="p-2.5 rounded-[6px] bg-surface-subtle border border-border-subtle">
            <Speaker className="h-5 w-5 text-brand" />
          </div>
        </div>

        <div className="rounded-[6px] border border-border bg-surface p-4 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-text-secondary font-medium">{t('audioView.totalDevices')} (Capture)</span>
            <div className="text-xl font-bold font-mono tabular-nums text-text-primary">
              {captureDevices.length}
            </div>
          </div>
          <div className="p-2.5 rounded-[6px] bg-surface-subtle border border-border-subtle">
            <Mic className="h-5 w-5 text-emerald-400" />
          </div>
        </div>

        <div className="rounded-[6px] border border-border bg-surface p-4 flex items-center justify-between">
          <div className="space-y-1 overflow-hidden pr-2">
            <span className="text-xs text-text-secondary font-medium">{t('audioView.defaultOutput')}</span>
            <div className="text-xs font-semibold text-text-primary truncate" title={activeRenderDevice?.name || 'N/A'}>
              {activeRenderDevice?.name || 'No Device Found'}
            </div>
          </div>
          <div className="p-2.5 rounded-[6px] bg-surface-subtle border border-border-subtle shrink-0">
            <Volume2 className="h-5 w-5 text-brand" />
          </div>
        </div>

        <div className="rounded-[6px] border border-border bg-surface p-4 flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-text-secondary font-medium">{t('audioView.activeSessions')}</span>
            <div className="text-xl font-bold font-mono tabular-nums text-text-primary">
              {appAudioSessions.length}
            </div>
          </div>
          <div className="p-2.5 rounded-[6px] bg-surface-subtle border border-border-subtle">
            <Radio className="h-5 w-5 text-amber-400" />
          </div>
        </div>
      </div>

      {/* Section 1: Global Audio Devices Management */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Output Devices Card */}
        <div className="rounded-[6px] border border-border bg-surface p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Speaker className="h-4 w-4 text-brand" />
              <h3 className="text-sm font-semibold text-text-primary">{t('audioView.outputDevices')}</h3>
            </div>
            <span className="text-xs font-mono text-text-muted">{renderDevices.length} endpoints</span>
          </div>

          {/* Master Output Quick Dropdown Selector */}
          <div className="space-y-2">
            <label className="text-xs text-text-secondary font-medium block">
              {t('audioView.defaultOutput')}
            </label>
            <select
              value={defaultRenderId || activeRenderDevice?.id || ''}
              onChange={(e) => setGlobalAudioDevice(e.target.value, 'render')}
              className="w-full rounded-[6px] border border-border bg-surface-hover px-3 py-2 text-xs font-mono text-text-primary focus:outline-none focus:border-brand transition-colors"
              aria-label={t('audioView.defaultOutput')}
            >
              {renderDevices.map((dev) => (
                <option key={dev.id} value={dev.id}>
                  {dev.name} {dev.isDefault ? `(${t('audioView.activeDefault')})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Render Device List */}
          <div className="space-y-2.5 pt-2">
            {renderDevices.map((dev) => {
              const isCurrentDefault = dev.id === defaultRenderId || dev.isDefault;
              return (
                <div
                  key={dev.id}
                  className={`rounded-[6px] border p-3 flex items-center justify-between transition-colors ${
                    isCurrentDefault
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : 'border-border bg-surface-hover hover:bg-surface-active'
                  }`}
                >
                  <div className="flex items-center gap-3 overflow-hidden pr-2">
                    <Speaker className={`h-4 w-4 shrink-0 ${isCurrentDefault ? 'text-emerald-400' : 'text-text-muted'}`} />
                    <div className="space-y-0.5 min-w-0">
                      <div className="text-xs font-medium text-text-primary truncate">{dev.name}</div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-text-muted uppercase">{dev.state}</span>
                        {dev.channels && <span className="text-[10px] font-mono text-text-muted">{dev.channels} Ch</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isCurrentDefault ? (
                      <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                        <Check className="h-3 w-3" />
                        {t('audioView.activeDefault')}
                      </span>
                    ) : (
                      <button
                        onClick={() => setGlobalAudioDevice(dev.id, 'render')}
                        className="px-2.5 py-1 rounded-[6px] text-xs font-mono bg-surface-subtle hover:bg-brand/20 text-text-secondary hover:text-brand border border-border-subtle transition-colors"
                        aria-label={`${t('audioView.setAsDefault')} ${dev.name}`}
                      >
                        {t('audioView.setAsDefault')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Input Devices Card */}
        <div className="rounded-[6px] border border-border bg-surface p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Mic className="h-4 w-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-text-primary">{t('audioView.inputDevices')}</h3>
            </div>
            <span className="text-xs font-mono text-text-muted">{captureDevices.length} endpoints</span>
          </div>

          {/* Master Input Quick Dropdown Selector */}
          <div className="space-y-2">
            <label className="text-xs text-text-secondary font-medium block">
              {t('audioView.defaultInput')}
            </label>
            <select
              value={defaultCaptureId || activeCaptureDevice?.id || ''}
              onChange={(e) => setGlobalAudioDevice(e.target.value, 'capture')}
              className="w-full rounded-[6px] border border-border bg-surface-hover px-3 py-2 text-xs font-mono text-text-primary focus:outline-none focus:border-emerald-400 transition-colors"
              aria-label={t('audioView.defaultInput')}
            >
              {captureDevices.map((dev) => (
                <option key={dev.id} value={dev.id}>
                  {dev.name} {dev.isDefault ? `(${t('audioView.activeDefault')})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Capture Device List */}
          <div className="space-y-2.5 pt-2">
            {captureDevices.map((dev) => {
              const isCurrentDefault = dev.id === defaultCaptureId || dev.isDefault;
              return (
                <div
                  key={dev.id}
                  className={`rounded-[6px] border p-3 flex items-center justify-between transition-colors ${
                    isCurrentDefault
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : 'border-border bg-surface-hover hover:bg-surface-active'
                  }`}
                >
                  <div className="flex items-center gap-3 overflow-hidden pr-2">
                    <Mic className={`h-4 w-4 shrink-0 ${isCurrentDefault ? 'text-emerald-400' : 'text-text-muted'}`} />
                    <div className="space-y-0.5 min-w-0">
                      <div className="text-xs font-medium text-text-primary truncate">{dev.name}</div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-text-muted uppercase">{dev.state}</span>
                        {dev.channels && <span className="text-[10px] font-mono text-text-muted">{dev.channels} Ch</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isCurrentDefault ? (
                      <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                        <Check className="h-3 w-3" />
                        {t('audioView.activeDefault')}
                      </span>
                    ) : (
                      <button
                        onClick={() => setGlobalAudioDevice(dev.id, 'capture')}
                        className="px-2.5 py-1 rounded-[6px] text-xs font-mono bg-surface-subtle hover:bg-emerald-500/20 text-text-secondary hover:text-emerald-400 border border-border-subtle transition-colors"
                        aria-label={`${t('audioView.setAsDefault')} ${dev.name}`}
                      >
                        {t('audioView.setAsDefault')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Section 2: Per-Application Audio Routing & Volume Control */}
      <div className="rounded-[6px] border border-border bg-surface p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Sliders className="h-5 w-5 text-brand" />
            <h3 className="text-sm font-semibold text-text-primary">{t('audioView.appRoutingTitle')}</h3>
          </div>

          {/* Search Filter Input */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('audioView.searchAppPlaceholder')}
              className="w-full rounded-[6px] border border-border bg-surface-hover pl-9 pr-3 py-1.5 text-xs font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand transition-colors"
            />
          </div>
        </div>

        {/* Sessions List */}
        {filteredSessions.length === 0 ? (
          <div className="rounded-[6px] border border-dashed border-border p-8 text-center space-y-3">
            <div className="mx-auto w-10 h-10 rounded-full bg-surface-subtle flex items-center justify-center text-text-muted">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-medium text-text-primary">{t('audioView.noAppSessions')}</h4>
              <p className="text-xs text-text-secondary max-w-md mx-auto">
                {t('audioView.noAppSessionsDesc')}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredSessions.map((session) => {
              const currentVolPct = Math.round((session.volume ?? 1) * 100);
              const isMuted = session.isMuted;
              const currentOutputId = session.outputDeviceId || session.deviceId || defaultRenderId || '';
              const currentInputId = session.inputDeviceId || defaultCaptureId || '';

              return (
                <div
                  key={session.pid}
                  className="rounded-[6px] border border-border bg-surface-hover p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors hover:border-border"
                >
                  {/* App Header & Process Meta */}
                  <div className="flex items-center gap-3 min-w-[220px]">
                    <div className="p-2 rounded-[6px] bg-surface border border-border">
                      {resolveAppIcon(session)}
                    </div>
                    <div className="space-y-0.5">
                      <div className="text-xs font-semibold text-text-primary">
                        {session.displayName || session.name}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] font-mono text-text-muted">
                        <span>{session.processName || session.name}</span>
                        <span>•</span>
                        <span className="tabular-nums">PID: {session.pid}</span>
                      </div>
                    </div>
                  </div>

                  {/* Volume Slider & Mute Toggle Controls */}
                  <div className="flex items-center gap-3 flex-1 max-w-md">
                    <button
                      onClick={() => setAppVolume(session.pid, session.volume, !isMuted)}
                      className={`p-2 rounded-[6px] border transition-colors shrink-0 ${
                        isMuted
                          ? 'bg-red-500/10 text-red-400 border-red-500/30'
                          : 'bg-surface-subtle text-text-secondary border-border-subtle hover:text-brand'
                      }`}
                      aria-label={isMuted ? `${t('audioView.unmute')} ${session.name}` : `${t('audioView.mute')} ${session.name}`}
                      aria-pressed={isMuted}
                    >
                      {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    </button>

                    <div className="flex-1 flex items-center gap-3">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={isMuted ? 0 : currentVolPct}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) / 100;
                          setAppVolume(session.pid, val, false);
                        }}
                        className="w-full h-1.5 bg-background rounded-lg appearance-none cursor-pointer accent-brand"
                        aria-label={`Volume level for ${session.name} PID ${session.pid}`}
                      />
                      <span className="text-xs font-mono tabular-nums text-text-primary w-9 text-right shrink-0">
                        {isMuted ? '0%' : `${currentVolPct}%`}
                      </span>
                    </div>
                  </div>

                  {/* Audio Routing Controls */}
                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-mono text-text-muted hidden xl:inline">
                        {t('audioView.appOutputDevice')}:
                      </span>
                      <select
                        value={currentOutputId}
                        onChange={(e) => setAppAudioDevice(session.pid, e.target.value, 'render')}
                        className="rounded-[6px] border border-border bg-surface px-2.5 py-1.5 text-xs font-mono text-text-primary focus:outline-none focus:border-brand transition-colors max-w-[180px] truncate"
                        aria-label={`Output audio route for ${session.name}`}
                      >
                        <option value="">{t('audioView.systemDefault')}</option>
                        {renderDevices.map((dev) => (
                          <option key={dev.id} value={dev.id}>
                            {dev.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-mono text-text-muted hidden xl:inline">
                        {t('audioView.appInputDevice')}:
                      </span>
                      <select
                        value={currentInputId}
                        onChange={(e) => setAppAudioDevice(session.pid, e.target.value, 'capture')}
                        className="rounded-[6px] border border-border bg-surface px-2.5 py-1.5 text-xs font-mono text-text-primary focus:outline-none focus:border-emerald-400 transition-colors max-w-[180px] truncate"
                        aria-label={`Input audio route for ${session.name}`}
                      >
                        <option value="">{t('audioView.systemDefault')}</option>
                        {captureDevices.map((dev) => (
                          <option key={dev.id} value={dev.id}>
                            {dev.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      onClick={() => {
                        if (defaultRenderId) setAppAudioDevice(session.pid, defaultRenderId, 'render');
                        if (defaultCaptureId) setAppAudioDevice(session.pid, defaultCaptureId, 'capture');
                      }}
                      className="p-1.5 rounded-[6px] border border-border-subtle bg-surface-subtle text-text-muted hover:text-text-secondary hover:bg-surface-hover transition-colors"
                      title={t('audioView.resetRouting')}
                      aria-label={`${t('audioView.resetRouting')} for ${session.name}`}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
