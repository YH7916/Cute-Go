import { asTapRecord, callTapAsync, getTap, TAP_CALLBACK_TIMEOUT_MS } from './runtime';
import type { TapCallbacks } from './sdk';

type TapRecord = Record<string, unknown>;

async function requestRecord(
  invoke: ((callbacks: TapCallbacks) => unknown) | undefined,
): Promise<TapRecord | null> {
  if (!invoke) return null;
  try { return asTapRecord(await callTapAsync(invoke, TAP_CALLBACK_TIMEOUT_MS)); } catch { return null; }
}

async function requestPermission(
  invoke: ((callbacks: TapCallbacks) => unknown) | undefined,
): Promise<boolean> {
  if (!invoke) return false;
  try { await callTapAsync(invoke); return true; } catch { return false; }
}

export const tapRequirePrivacyAuthorize = (): Promise<boolean> =>
  requestPermission(getTap()?.requirePrivacyAuthorize);

export const tapGetPrivacySetting = (): Promise<TapRecord | null> =>
  requestRecord(getTap()?.getPrivacySetting);

export const tapGetSetting = (): Promise<TapRecord | null> =>
  requestRecord(getTap()?.getSetting);

// A login code is a short-lived credential for a server exchange, not a player
// identity. Preserve legacy SDK string results for the provider to interpret.
export async function tapLogin(): Promise<TapRecord | string | null> {
  const login = getTap()?.login;
  if (!login) return null;
  try {
    const result = await callTapAsync(login, TAP_CALLBACK_TIMEOUT_MS);
    if (typeof result === 'string') return result.trim() ? result : null;
    return asTapRecord(result);
  } catch { return null; }
}

export function tapAuthorizeUserInfo(): Promise<boolean> {
  const authorize = getTap()?.authorize;
  return requestPermission(authorize && (callbacks => authorize({ ...callbacks, scope: 'scope.userInfo' })));
}

export async function getTapUserInfo(retryIfUnauthorized = true): Promise<TapRecord | null> {
  const getUserInfo = getTap()?.getUserInfo;
  if (!getUserInfo) return null;
  try {
    const result = asTapRecord(await callTapAsync(getUserInfo, TAP_CALLBACK_TIMEOUT_MS));
    if (!result) return null;
    return 'userInfo' in result ? asTapRecord(result.userInfo) : result;
  } catch (error) {
    const failure = asTapRecord(error);
    if (failure?.errno === 1027) return { _error: 'PRIVACY_MISSING', original: error };
    const unauthorized = failure?.errno === 6 ||
      (typeof failure?.errMsg === 'string' && failure.errMsg.includes('unauthorized'));
    if (retryIfUnauthorized && unauthorized && await tapAuthorizeUserInfo()) return getTapUserInfo(false);
    return null;
  }
}

export function getAccountInfo(): TapRecord | null {
  const getAccountInfoSync = getTap()?.getAccountInfoSync;
  if (!getAccountInfoSync) return null;
  try { return asTapRecord(getAccountInfoSync()); } catch { return null; }
}
