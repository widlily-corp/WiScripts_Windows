import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';

export function useMetricsPoller() {
  const isPollingActive = useAppStore((s) => s.isPollingActive);
  const pollingIntervalMs = useAppStore((s) => s.pollingIntervalMs);
  const fetchLatestMetrics = useAppStore((s) => s.fetchLatestMetrics);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<boolean>(false);

  useEffect(() => {
    const clearScheduled = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    if (!isPollingActive) {
      clearScheduled();
      return;
    }

    let disposed = false;

    const scheduleNext = () => {
      clearScheduled();
      if (!disposed && !document.hidden) {
        timerRef.current = setTimeout(() => {
          void runPoll();
        }, pollingIntervalMs);
      }
    };

    const runPoll = async () => {
      if (disposed || document.hidden || inFlightRef.current) {
        if (!disposed && !document.hidden && !inFlightRef.current) {
          scheduleNext();
        }
        return;
      }
      inFlightRef.current = true;
      try {
        await fetchLatestMetrics();
      } finally {
        inFlightRef.current = false;
        scheduleNext();
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearScheduled();
      } else if (!disposed) {
        void runPoll();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    if (!document.hidden) {
      void runPoll();
    }

    return () => {
      disposed = true;
      clearScheduled();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isPollingActive, pollingIntervalMs, fetchLatestMetrics]);
}
