import type {
  TapAuthorizeOptions, TapCallbacks, TapLoginOptions, TapSdk,
  TapUserInfoButtonOptions, TapUserInfoOptions, TapVibrateOptions,
} from './sdk';

declare global { interface Window { tap?: TapSdk } }

export function asTapRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

// Preserve the SDK receiver; native methods can depend on this. A callable check
// proves only invocation support, never the result's shape or an identity claim.
export function getTapMethod<Args extends unknown[]>(
  source: unknown, name: string,
): ((...args: Args) => unknown) | undefined {
  const object = asTapRecord(source);
  if (!object) return undefined;
  try {
    const method = object[name];
    if (typeof method !== 'function') return undefined;
    return (...args) => Reflect.apply(method, source, args);
  } catch { return undefined; }
}

export function getTap(): TapSdk | null {
  if (typeof window === 'undefined') return null;
  let source: unknown;
  try { source = window.tap; } catch { return null; }
  if (!asTapRecord(source)) return null;
  return {
    login: getTapMethod<[TapLoginOptions]>(source, 'login'),
    getUserInfo: getTapMethod<[TapUserInfoOptions]>(source, 'getUserInfo'),
    authorize: getTapMethod<[TapAuthorizeOptions]>(source, 'authorize'),
    requirePrivacyAuthorize: getTapMethod<[TapCallbacks]>(source, 'requirePrivacyAuthorize'),
    getPrivacySetting: getTapMethod<[TapCallbacks]>(source, 'getPrivacySetting'),
    getSetting: getTapMethod<[TapCallbacks]>(source, 'getSetting'),
    getAccountInfoSync: getTapMethod<[]>(source, 'getAccountInfoSync'),
    getOnlineBattleManager: getTapMethod<[]>(source, 'getOnlineBattleManager'),
    getLeaderboardManager: getTapMethod<[]>(source, 'getLeaderboardManager'),
    createAchievementManager: getTapMethod<[]>(source, 'createAchievementManager'),
    createUserInfoButton: getTapMethod<[TapUserInfoButtonOptions]>(source, 'createUserInfoButton'),
    openPrivacyContract: getTapMethod<[TapCallbacks]>(source, 'openPrivacyContract'),
    vibrateShort: getTapMethod<[TapVibrateOptions]>(source, 'vibrateShort'),
    vibrateLong: getTapMethod<[TapCallbacks]>(source, 'vibrateLong'),
  };
}

export const isTapTapEnv = (): boolean => getTap() !== null;

export const TAP_CALLBACK_TIMEOUT_MS = 15000;

// Official login/getUserInfo are callback-only. Some shipped SDK wrappers return
// promises; observe both, settle once, and never guess support from function.length.
export function callTapAsync(
  invoke: (callbacks: TapCallbacks) => unknown,
  timeoutMs?: number,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (success: boolean, value: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (success) resolve(value); else reject(value);
    };
    // Permission dialogs must remain open while the player decides. Only callers
    // that request a bounded operation opt into a timeout.
    if (timeoutMs !== undefined) {
      timer = setTimeout(() => finish(false, new Error('TapTap SDK callback timed out')), timeoutMs);
    }
    try {
      const result = invoke({ success: value => finish(true, value), fail: error => finish(false, error) });
      if (result !== null && (typeof result === 'object' || typeof result === 'function') &&
          'then' in result && typeof result.then === 'function') {
        void Promise.resolve(result).then(value => finish(true, value), error => finish(false, error));
      }
    } catch (error) { finish(false, error); }
  });
}
