export const PERF_LOG_THRESHOLD = 12;

export const now = (): number => {
  if (typeof performance !== 'undefined') {
    return performance.now();
  }
  return Date.now();
};

export const shouldEmitPerfLogs = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }
  const globalFlag = (window as any).__KAYA_ENABLE_PERF_LOGS;
  if (typeof globalFlag === 'boolean') {
    return globalFlag;
  }
  return false;
};

export function logPerf(label: string, duration: number, stage?: string): void {
  if (!shouldEmitPerfLogs()) return;
  if (duration < PERF_LOG_THRESHOLD) return;
  const emoji = duration > 45 ? '🐢' : '⏱️';
  const stageSuffix = stage ? ` ${stage}` : '';
  console.log(`${emoji} ${label}${stageSuffix}: ${duration.toFixed(1)}ms`);
}
