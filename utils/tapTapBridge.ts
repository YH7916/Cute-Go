/**
 * TapTap SDK Bridge Utility
 * Handles interactions with the global 'tap' object provided by TapTap environment.
 * Provides graceful degradation for non-TapTap environments.
 */

declare global {
  interface Window {
    tap?: any;
  }
}

// TapTap Leaderboard ID from user configuration
const ELO_LEADERBOARD_ID = 'bl6pglf32l46qbfwo5';

export const isTapTapEnv = () => {
  return typeof window !== 'undefined' && typeof (window as any).tap !== 'undefined';
};

/**
 * Get the global tap object safely
 */
const getTap = () => {
  if (isTapTapEnv()) {
    return (window as any).tap;
  }
  return null;
};

/**
 * TapTap Login
 * Returns the user info including unionId
 */
export const tapLogin = async () => {
  const tap = getTap();
  if (!tap) {
    console.error('[TapTapBridge] No tap object found in window. Ensure you are running in TapTap environment.');
    return null;
  }

  try {
    console.log('[TapTapBridge] Triggering tap.login()...');
    // Standard TapTap Minigame login
    const res = await tap.login();
    console.log('[TapTapBridge] tap.login succeeded:', res);
    return res;
  } catch (error) {
    console.error('[TapTapBridge] Login promise rejected:', error);
    return null;
  }
};

/**
 * Get a stable playerId from OnlineBattleManager (fallback for H5 environments)
 */
export const getTapPlayerId = async () => {
  const tap = getTap();
  if (!tap) return null;

  try {
    // OnlineBattleManager.connect() provides a persistent playerId for the session/user
    const manager = tap.getOnlineBattleManager();
    if (manager) {
      console.log('[TapTapBridge] Attempting to get playerId via OnlineBattleManager...');
      const res = await manager.connect();
      console.log('[TapTapBridge] connect() response:', res);
      return res.playerId || null;
    }
  } catch (error) {
    console.warn('[TapTapBridge] Failed to get playerId from OnlineBattleManager:', error);
  }
  return null;
};

/**
 * Submit score to TapTap Leaderboard
 */
export const submitTapTapElo = async (elo: number) => {
  const tap = getTap();
  if (!tap) return;

  try {
    const manager = tap.getLeaderboardManager();
    await manager.submitScores({
      scores: [{
        leaderboardId: ELO_LEADERBOARD_ID,
        score: elo
      }]
    });
    console.log('[TapTapBridge] ELO submitted to TapTap:', elo);
  } catch (error) {
    console.error('[TapTapBridge] Failed to submit ELO:', error);
  }
};

/**
 * Unlock TapTap Achievement
 * @param code The achievement code defined in TapTap Developer Center
 */
export const unlockTapTapAchievement = async (code: string) => {
  const tap = getTap();
  if (!tap) return;

  try {
    // Note: Achievement API name might vary by SDK version, 
    // but usually it's getAchievementManager()
    if (tap.getAchievementManager) {
        const manager = tap.getAchievementManager();
        await manager.reach({ displayId: code });
        console.log('[TapTapBridge] Achievement unlocked in TapTap:', code);
    }
  } catch (error) {
    console.warn('[TapTapBridge] Achievement sync failed (likely not configured in TapTap backend):', code);
  }
};

/**
 * Open TapTap Leaderboard UI
 */
export const openTapTapLeaderboard = () => {
  const tap = getTap();
  if (!tap) return;

  try {
    const manager = tap.getLeaderboardManager();
    manager.openLeaderboard({
      leaderboardId: ELO_LEADERBOARD_ID
    });
  } catch (error) {
    console.error('[TapTapBridge] Failed to open leaderboard:', error);
  }
};
