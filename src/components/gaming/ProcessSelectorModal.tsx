import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Search,
  X,
  Gamepad2,
  Cpu,
  Layers,
  Zap,
  CheckCircle2,
  Loader2,
  Flame,
  Shield,
  Clock,
  HardDrive,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { ProcessSelectorItem, GameOptimizationConfig } from '../../types';

interface ProcessSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProcessSelectorModal({ isOpen, onClose }: ProcessSelectorModalProps) {
  const { t } = useTranslation();

  const runningProcesses = useAppStore((s) => s.runningProcesses);
  const isProcessesLoading = useAppStore((s) => s.isProcessesLoading);
  const fetchRunningProcesses = useAppStore((s) => s.fetchRunningProcesses);
  const optimizeGameProcess = useAppStore((s) => s.optimizeGameProcess);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProcess, setSelectedProcess] = useState<ProcessSelectorItem | null>(null);

  // Tuning options
  const [setHighPriority, setSetHighPriority] = useState(true);
  const [pinPhysicalCores, setPinPhysicalCores] = useState(true);
  const [setTimerResolution, setSetTimerResolution] = useState(true);
  const [purgeStandbyRam, setPurgeStandbyRam] = useState(true);
  const [suspendServices, setSuspendServices] = useState(true);
  const [isOptimizing, setIsOptimizing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchRunningProcesses();
      setSelectedProcess(null);
      setSearchQuery('');
    }
  }, [isOpen, fetchRunningProcesses]);

  const filteredProcesses = useMemo(() => {
    if (!searchQuery.trim()) return runningProcesses;
    const q = searchQuery.toLowerCase();
    return runningProcesses.filter(
      (p) => p.name.toLowerCase().includes(q) || p.windowTitle.toLowerCase().includes(q)
    );
  }, [runningProcesses, searchQuery]);

  if (!isOpen) return null;

  const handleSelect = (proc: ProcessSelectorItem) => {
    setSelectedProcess(proc);
  };

  const handleApply = async () => {
    if (!selectedProcess) return;
    setIsOptimizing(true);
    const config: GameOptimizationConfig = {
      targetPid: selectedProcess.pid,
      processName: selectedProcess.name,
      setHighPriority,
      pinPhysicalCores,
      setTimerResolution,
      purgeStandbyRam,
      suspendServices,
    };
    await optimizeGameProcess(config);
    setIsOptimizing(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in select-none">
      <div className="bg-surface-base border border-surface-border rounded-xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-surface-border flex items-center justify-between bg-surface-subtle">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-brand/10 text-brand">
              <Gamepad2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-text-primary text-sm flex items-center gap-2">
                {t('gamingDaemon.selector.title', 'Выбор процесса для оптимизации')}
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-brand/10 text-brand border border-brand/20">
                  {runningProcesses.length} {t('gamingDaemon.selector.processes', 'процессов')}
                </span>
              </h3>
              <p className="text-xs text-text-muted mt-0.5">
                {t(
                  'gamingDaemon.selector.subtitle',
                  'Выберите активную 3D-игру или приложение для включения режима максимальной производительности'
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-base transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-3 border-b border-surface-border bg-surface-base flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('gamingDaemon.selector.searchPlaceholder', 'Поиск по имени процесса или заголовку окна...')}
              className="w-full pl-9 pr-3 py-1.5 bg-surface-subtle border border-surface-border rounded-lg text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand"
            />
          </div>
          <button
            onClick={() => fetchRunningProcesses()}
            disabled={isProcessesLoading}
            className="px-3 py-1.5 bg-surface-subtle hover:bg-surface-highlight border border-surface-border rounded-lg text-xs text-text-primary flex items-center gap-1.5 transition-colors"
          >
            {isProcessesLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-brand" />
            ) : (
              t('common.refresh', 'Обновить')
            )}
          </button>
        </div>

        {/* Content Body: Split View */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-5 min-h-[300px]">
          {/* Left: Process List (3 cols) */}
          <div className="md:col-span-3 border-r border-surface-border overflow-y-auto p-2 space-y-1">
            {isProcessesLoading && runningProcesses.length === 0 ? (
              <div className="p-8 text-center text-text-muted flex flex-col items-center justify-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-brand" />
                <span className="text-xs">{t('gamingDaemon.selector.scanning', 'Сканирование процессов...')}</span>
              </div>
            ) : filteredProcesses.length === 0 ? (
              <div className="p-8 text-center text-text-muted text-xs">
                {t('gamingDaemon.selector.notFound', 'Процессы не найдены')}
              </div>
            ) : (
              filteredProcesses.map((proc) => {
                const isSelected = selectedProcess?.pid === proc.pid;
                return (
                  <div
                    key={proc.pid}
                    onClick={() => handleSelect(proc)}
                    className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-all flex items-center justify-between ${
                      isSelected
                        ? 'bg-brand/10 border-brand text-text-primary shadow-sm'
                        : 'bg-surface-subtle/50 hover:bg-surface-subtle border-surface-border text-text-muted hover:text-text-primary'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-1.5 font-medium text-text-primary">
                        <span className="truncate">{proc.name}</span>
                        {proc.isKnownGame && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono uppercase bg-status-success/20 text-status-success border border-status-success/30">
                            GAME
                          </span>
                        )}
                      </div>
                      {proc.windowTitle && (
                        <div className="text-[11px] text-text-muted truncate mt-0.5">
                          {proc.windowTitle}
                        </div>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-mono text-[11px] text-text-primary font-semibold">
                        {proc.memoryMb} MB
                      </div>
                      <div className="text-[10px] text-text-muted font-mono">PID: {proc.pid}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right: Tuning Configuration Panel (2 cols) */}
          <div className="md:col-span-2 p-4 bg-surface-subtle/40 overflow-y-auto flex flex-col justify-between">
            <div>
              <h4 className="text-xs font-semibold text-text-primary uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-brand" />
                {t('gamingDaemon.selector.tuningOptions', 'Параметры ускорения')}
              </h4>

              {selectedProcess ? (
                <div className="space-y-2.5">
                  <div className="p-2.5 rounded-lg bg-surface-base border border-surface-border text-xs mb-3">
                    <span className="text-text-muted block text-[10px] uppercase font-mono">Выбранный процесс:</span>
                    <span className="font-semibold text-text-primary text-sm truncate block mt-0.5">
                      {selectedProcess.name}
                    </span>
                    <div className="text-text-muted text-[11px] font-mono mt-1">
                      PID: {selectedProcess.pid} • RAM: {selectedProcess.memoryMb} MB
                    </div>
                  </div>

                  {/* Toggle 1: Priority */}
                  <label className="flex items-start gap-2.5 p-2 rounded-lg bg-surface-base border border-surface-border cursor-pointer hover:border-brand/40 transition-colors">
                    <input
                      type="checkbox"
                      checked={setHighPriority}
                      onChange={(e) => setSetHighPriority(e.target.checked)}
                      className="mt-0.5 accent-brand"
                    />
                    <div>
                      <div className="text-xs font-medium text-text-primary flex items-center gap-1">
                        <Flame className="w-3 h-3 text-status-warning" />
                        {t('gamingDaemon.tuning.priority', 'Высокий приоритет')}
                      </div>
                      <div className="text-[10px] text-text-muted mt-0.5">
                        {t('gamingDaemon.tuning.priorityDesc', 'Приоритет HIGH_PRIORITY_CLASS в диспетчере')}
                      </div>
                    </div>
                  </label>

                  {/* Toggle 2: Affinity */}
                  <label className="flex items-start gap-2.5 p-2 rounded-lg bg-surface-base border border-surface-border cursor-pointer hover:border-brand/40 transition-colors">
                    <input
                      type="checkbox"
                      checked={pinPhysicalCores}
                      onChange={(e) => setPinPhysicalCores(e.target.checked)}
                      className="mt-0.5 accent-brand"
                    />
                    <div>
                      <div className="text-xs font-medium text-text-primary flex items-center gap-1">
                        <Cpu className="w-3 h-3 text-brand" />
                        {t('gamingDaemon.tuning.affinity', 'Физические P-ядра')}
                      </div>
                      <div className="text-[10px] text-text-muted mt-0.5">
                        {t('gamingDaemon.tuning.affinityDesc', 'Изоляция потоков игры на основных физических ядрах')}
                      </div>
                    </div>
                  </label>

                  {/* Toggle 3: Timer */}
                  <label className="flex items-start gap-2.5 p-2 rounded-lg bg-surface-base border border-surface-border cursor-pointer hover:border-brand/40 transition-colors">
                    <input
                      type="checkbox"
                      checked={setTimerResolution}
                      onChange={(e) => setSetTimerResolution(e.target.checked)}
                      className="mt-0.5 accent-brand"
                    />
                    <div>
                      <div className="text-xs font-medium text-text-primary flex items-center gap-1">
                        <Clock className="w-3 h-3 text-brand" />
                        {t('gamingDaemon.tuning.timer', 'Таймер 0.5 мс')}
                      </div>
                      <div className="text-[10px] text-text-muted mt-0.5">
                        {t('gamingDaemon.tuning.timerDesc', 'Фиксация 5000 100ns для плавного фреймпейсинга')}
                      </div>
                    </div>
                  </label>

                  {/* Toggle 4: Standby RAM */}
                  <label className="flex items-start gap-2.5 p-2 rounded-lg bg-surface-base border border-surface-border cursor-pointer hover:border-brand/40 transition-colors">
                    <input
                      type="checkbox"
                      checked={purgeStandbyRam}
                      onChange={(e) => setPurgeStandbyRam(e.target.checked)}
                      className="mt-0.5 accent-brand"
                    />
                    <div>
                      <div className="text-xs font-medium text-text-primary flex items-center gap-1">
                        <Layers className="w-3 h-3 text-brand" />
                        {t('gamingDaemon.tuning.ram', 'Сброс Standby RAM')}
                      </div>
                      <div className="text-[10px] text-text-muted mt-0.5">
                        {t('gamingDaemon.tuning.ramDesc', 'Очистка кэша памяти перед запуском для устранения фризов')}
                      </div>
                    </div>
                  </label>

                  {/* Toggle 5: Suspend Services */}
                  <label className="flex items-start gap-2.5 p-2 rounded-lg bg-surface-base border border-surface-border cursor-pointer hover:border-brand/40 transition-colors">
                    <input
                      type="checkbox"
                      checked={suspendServices}
                      onChange={(e) => setSuspendServices(e.target.checked)}
                      className="mt-0.5 accent-brand"
                    />
                    <div>
                      <div className="text-xs font-medium text-text-primary flex items-center gap-1">
                        <Shield className="w-3 h-3 text-status-success" />
                        {t('gamingDaemon.tuning.services', 'Пауза фоновых служб')}
                      </div>
                      <div className="text-[10px] text-text-muted mt-0.5">
                        {t('gamingDaemon.tuning.servicesDesc', 'Временная пауза SysMain, DiagTrack и WSearch')}
                      </div>
                    </div>
                  </label>
                </div>
              ) : (
                <div className="p-6 text-center text-text-muted text-xs border border-dashed border-surface-border rounded-lg">
                  {t('gamingDaemon.selector.selectPrompt', 'Выберите процесс из списка слева для настройки')}
                </div>
              )}
            </div>

            {/* Bottom Action Button */}
            <div className="pt-4 mt-auto">
              <button
                onClick={handleApply}
                disabled={!selectedProcess || isOptimizing}
                className="w-full py-2.5 px-4 bg-brand hover:bg-brand-hover text-brand-text font-semibold rounded-lg text-xs flex items-center justify-center gap-2 shadow-lg shadow-brand/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isOptimizing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('gamingDaemon.selector.optimizing', 'Применение оптимизаций...')}
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    {t('gamingDaemon.selector.boostButton', 'Оптимизировать процесс')}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
