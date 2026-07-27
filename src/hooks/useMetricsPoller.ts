import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';

export function useMetricsPoller() {
  const isPollingActive = useAppStore((s) => s.isPollingActive);
  const pollingIntervalMs = useAppStore((s) => s.pollingIntervalMs);
  const fetchLatestMetrics = useAppStore((s) => s.fetchLatestMetrics);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isPollingActive) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    // Execute immediate poll on initial mount / enable
    fetchLatestMetrics();

    timerRef.current = setInterval(() => {
      fetchLatestMetrics();
    }, pollingIntervalMs);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPollingActive, pollingIntervalMs, fetchLatestMetrics]);
}
