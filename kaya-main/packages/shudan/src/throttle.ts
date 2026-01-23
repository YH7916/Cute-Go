/**
 * Throttle utility for Shudan board component
 * Limits function execution to at most once per animation frame
 */

/**
 * Creates a throttled function using requestAnimationFrame.
 * Ideal for visual updates that should sync with screen refresh (~60fps).
 */
export function rafThrottle<T extends (...args: any[]) => any>(fn: T): T & { cancel: () => void } {
  let rafId: number | null = null;
  let lastArgs: Parameters<T> | null = null;

  const throttled = (...args: Parameters<T>) => {
    lastArgs = args;

    if (rafId === null) {
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (lastArgs) {
          fn(...lastArgs);
        }
      });
    }
  };

  throttled.cancel = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    lastArgs = null;
  };

  return throttled as T & { cancel: () => void };
}
