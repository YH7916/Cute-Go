import { asTapRecord, callTapAsync, getTap, getTapMethod } from './runtime';
import type {
  TapAchievementOptions, TapCallbacks, TapLeaderboardOpen, TapLeaderboardScores,
  TapUserInfoButton, TapUserInfoButtonOptions,
} from './sdk';

const LEADERBOARD_ID = 'bl6pglf32l46qbfwo5';

export async function submitTapTapElo(elo: number): Promise<void> {
  if (!Number.isFinite(elo)) return;
  try {
    const manager = getTap()?.getLeaderboardManager?.();
    const submit = getTapMethod<[TapLeaderboardScores]>(manager, 'submitScores');
    if (submit) await callTapAsync(callbacks => submit({
      ...callbacks, scores: [{ leaderboardId: LEADERBOARD_ID, score: elo }],
    }));
  } catch { /* Optional platform capability; local progress remains available. */ }
}

export async function unlockTapTapAchievement(code: string): Promise<void> {
  if (!code.trim()) return;
  try {
    const manager = getTap()?.createAchievementManager?.();
    const reach = getTapMethod<[TapAchievementOptions]>(manager, 'reach');
    if (reach) await callTapAsync(callbacks => reach({ ...callbacks, displayId: code }));
  } catch { /* Optional platform capability; local progress remains available. */ }
}

// These APIs report whether invocation was possible, not whether a native UI or
// vibration completed. Consume late promise failures without logging SDK data.
function invokeOptional(invoke: (callbacks: TapCallbacks) => unknown): boolean {
  try {
    const result = invoke({ success: () => {}, fail: () => {} });
    void Promise.resolve(result).catch(() => {});
    return true;
  } catch { return false; }
}

export function openTapTapLeaderboard(): void {
  try {
    const manager = getTap()?.getLeaderboardManager?.();
    const open = getTapMethod<[TapLeaderboardOpen]>(manager, 'openLeaderboard');
    if (open) invokeOptional(callbacks => open({ ...callbacks, leaderboardId: LEADERBOARD_ID }));
  } catch { /* Missing or unavailable native UI is a supported fallback. */ }
}

export async function tapCreateUserInfoButton(options: TapUserInfoButtonOptions): Promise<TapUserInfoButton | null> {
  const create = getTap()?.createUserInfoButton;
  if (!create) return null;
  try {
    const button = await create({ ...options, withScope: true });
    if (!asTapRecord(button)) return null;
    const onTap = getTapMethod<[(event: unknown) => void]>(button, 'onTap');
    if (!onTap) return null;
    return {
      onTap,
      offTap: getTapMethod<[(event: unknown) => void]>(button, 'offTap'),
      show: getTapMethod<[]>(button, 'show'),
      hide: getTapMethod<[]>(button, 'hide'),
      destroy: getTapMethod<[]>(button, 'destroy'),
    };
  } catch { return null; }
}

export async function tapOpenPrivacyContract(): Promise<boolean> {
  const open = getTap()?.openPrivacyContract;
  if (!open) return false;
  try { await callTapAsync(open); return true; } catch { return false; }
}

export function tapVibrateShort(type: 'heavy' | 'medium' | 'light' = 'medium'): boolean {
  const vibrate = getTap()?.vibrateShort;
  return vibrate ? invokeOptional(callbacks => vibrate({ ...callbacks, type })) : false;
}

export function tapVibrateLong(): boolean {
  const vibrate = getTap()?.vibrateLong;
  return vibrate ? invokeOptional(vibrate) : false;
}
