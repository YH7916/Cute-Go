/**
 * Throttle utility - limits function execution to at most once per interval
 *
 * Used for performance optimization on high-frequency events:
 * - Mouse movement (60fps = 16ms)
 * - Viewport panning
 * - Rapid keyboard navigation
 */

/**
 * Creates a throttled version of a function that only executes at most once
 * per specified interval. Uses trailing edge execution.
 *
 * @param fn - The function to throttle
 * @param wait - Minimum time between executions in milliseconds
 * @returns Throttled function with cancel() method
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  wait: number
): T & { cancel: () => void } {
  let lastTime = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;

  const throttled = (...args: Parameters<T>) => {
    const now = Date.now();
    const remaining = wait - (now - lastTime);

    lastArgs = args;

    if (remaining <= 0) {
      // Execute immediately
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      lastTime = now;
      fn(...args);
    } else if (!timeoutId) {
      // Schedule trailing execution
      timeoutId = setTimeout(() => {
        lastTime = Date.now();
        timeoutId = null;
        if (lastArgs) {
          fn(...lastArgs);
        }
      }, remaining);
    }
  };

  throttled.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    lastArgs = null;
  };

  return throttled as T & { cancel: () => void };
}

/**
 * Creates a throttled function using requestAnimationFrame.
 * Ideal for visual updates that should sync with screen refresh (~60fps).
 *
 * @param fn - The function to throttle
 * @returns RAF-throttled function with cancel() method
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
