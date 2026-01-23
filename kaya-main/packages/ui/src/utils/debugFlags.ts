const DEBUG_KEY = 'kaya.debug.ai';

/**
 * Determine whether verbose AI debugging logs are enabled.
 * Toggle via localStorage (set `kaya.debug.ai` to `1`) or by setting
 * a global `__KAYA_DEBUG_AI__` flag before the app initializes.
 */
export function isAIDebugEnabled(): boolean {
  // Support explicit global override first (works in both window + worker)
  if (typeof globalThis !== 'undefined') {
    const globalFlag = (globalThis as Record<string, unknown>).__KAYA_DEBUG_AI__;
    if (typeof globalFlag === 'boolean') {
      return globalFlag;
    }
  }

  try {
    if (typeof window !== 'undefined' && 'localStorage' in window) {
      const stored = window.localStorage.getItem(DEBUG_KEY);
      if (stored === '1') {
        return true;
      }
      if (stored === '0') {
        return false;
      }
    }
  } catch {
    // Ignore storage access errors (e.g., Safari private mode)
  }

  return false;
}
