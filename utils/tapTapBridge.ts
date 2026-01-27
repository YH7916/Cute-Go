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
 * Request Privacy Authorization (Minigame prerequisite)
 */
export const tapRequirePrivacyAuthorize = async () => {
  const tap = getTap();
  if (tap && tap.requirePrivacyAuthorize) {
    try {
      console.log('[TapTapBridge] Calling tap.requirePrivacyAuthorize()...');
      const res = await tap.requirePrivacyAuthorize();
      console.log('[TapTapBridge] requirePrivacyAuthorize result:', JSON.stringify(res || 'void/success'));
      return true;
    } catch (e: any) {
      console.error('[TapTapBridge] Privacy authorization failed:', JSON.stringify(e));
      if (e.errno === 1027) {
        console.error('[TapTapBridge] Error 1027: Privacy API not declared in Developer Center.');
      }
    }
  }
  return false;
};

/**
 * Get Privacy Setting Status
 */
export const tapGetPrivacySetting = async () => {
    const tap = getTap();
    if (tap && tap.getPrivacySetting) {
        try {
            const res = await tap.getPrivacySetting();
            console.log('[TapTapBridge] getPrivacySetting result:', JSON.stringify(res));
            return res;
        } catch (e) {
            console.warn('[TapTapBridge] getPrivacySetting failed:', e);
        }
    }
    return null;
};

/**
 * Get Settings (Permissions)
 */
export const tapGetSetting = async () => {
  const tap = getTap();
  if (tap) {
    try {
      if (tap.getSystemInfoSync) {
        const sys = tap.getSystemInfoSync();
        console.log('[TapTapBridge] System Info:', JSON.stringify(sys));
      }
      if (tap.getSetting) {
        const res = await tap.getSetting();
        console.log('[TapTapBridge] getSetting result:', JSON.stringify(res));
        return res;
      }
    } catch (e) {
      console.warn('[TapTapBridge] getSetting/systemInfo failed:', JSON.stringify(e));
    }
  }
  return null;
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
    console.log('[TapTapBridge] Triggering tap.login() with scopes...');
    // Standard TapTap Minigame login with common scopes
    const res = await tap.login({ 
        scopes: ['public_profile', 'user_info'], // Common scopes
        scope: 'public_profile' // Fallback for some versions
    });
    console.log('[TapTapBridge] tap.login result:', JSON.stringify(res));
    return res;
  } catch (error) {
    console.error('[TapTapBridge] Login promise rejected:', error);
    // Try fallback without params if error occurs
    try {
        console.log('[TapTapBridge] Retrying tap.login() without scopes...');
        return await tap.login();
    } catch (e) {
        return null;
    }
  }
};

/**
 * Request User Info Scope
 */
export const tapAuthorizeUserInfo = async () => {
  const tap = getTap();
  if (tap && tap.authorize) {
    try {
      console.log('[TapTapBridge] Requesting scope.userInfo...');
      await tap.authorize({ scope: 'scope.userInfo' });
      return true;
    } catch (e: any) {
      console.warn('[TapTapBridge] Authorization failed:', JSON.stringify(e));
      if (e.errno === 1027) {
        console.error('[TapTapBridge] CRITICAL: 1027 error detected. Developer MUST declare "getUserInfo" API in TapTap Developer Center -> 游戏服务 -> 小程序 -> 开发设置 -> 隐私设置.');
      }
      return false;
    }
  }
  return false;
};

/**
 * Get User Info (Profile)
 */
export const getTapUserInfo = async (retryIfUnauthorized = true) => {
  const tap = getTap();
  if (tap && tap.getUserInfo) {
    try {
      console.log('[TapTapBridge] Calling tap.getUserInfo()...');
      const res = await tap.getUserInfo();
      console.log('[TapTapBridge] getUserInfo result:', JSON.stringify(res));
      return res;
    } catch (e: any) {
      console.warn('[TapTapBridge] getUserInfo failed:', JSON.stringify(e));
      
      // errno 1027: miniapp no privacy api permission
      if (e.errno === 1027) {
        console.error('[TapTapBridge] CRITICAL: errno 1027 detected. This means the privacy declaration is MISSING in backend or game.json.');
        // We throw or return a specific object to let the UI know
        return { _error: 'PRIVACY_MISSING', original: e };
      }

      if (retryIfUnauthorized && (e.errno === 6 || (e.errMsg && e.errMsg.includes('unauthorized')))) {
        const authorized = await tapAuthorizeUserInfo();
        if (authorized) return getTapUserInfo(false);
      }
    }
  }
  return null;
};

/**
 * Get Account Info (Minigame only)
 */
export const getAccountInfo = () => {
    const tap = getTap();
    if (tap && tap.getAccountInfoSync) {
        try {
            const info = tap.getAccountInfoSync();
            console.log('[TapTapBridge] getAccountInfoSync:', JSON.stringify(info));
            return info;
        } catch (e) {
            console.warn('[TapTapBridge] getAccountInfoSync failed', e);
        }
    }
    return null;
};

/**
 * Get a stable playerId from OnlineBattleManager (fallback for H5 environments)
 */
export const getTapPlayerId = async () => {
  const tap = getTap();
  if (!tap) return null;

  try {
    const manager = tap.getOnlineBattleManager ? tap.getOnlineBattleManager() : null;
    if (manager) {
      console.log('[TapTapBridge] Attempting to get playerId via OnlineBattleManager...');
      // IMPORTANT: In some SDK versions, if already connected, it might throw error or return cached
      const res = await manager.connect();
      console.log('[TapTapBridge] connect() full response:', JSON.stringify(res));
      const pId = res.playerId || res.id || (res.playerInfo && res.playerInfo.id);
      console.log('[TapTapBridge] connect() extracted ID:', pId);
      return pId || null;
    } else {
      console.warn('[TapTapBridge] OnlineBattleManager not found on tap object');
    }
  } catch (error) {
    console.warn('[TapTapBridge] connect() failed:', JSON.stringify(error));
  }
  return null;
};

/**
 * Disconnect Tap (Cleanup for session issues)
 */
export const disconnectTap = async () => {
  const tap = getTap();
  if (tap && tap.getOnlineBattleManager) {
    try {
      const manager = tap.getOnlineBattleManager();
      if (manager && manager.disconnect) {
        await manager.disconnect();
        console.log('[TapTapBridge] OnlineBattleManager disconnected');
      }
    } catch (e) {
      console.warn('[TapTapBridge] Disconnect failed', e);
    }
  }
};

/**
 * Submit score to TapTap Leaderboard
 */
export const submitTapTapElo = async (elo: number) => {
  const tap = getTap();
  if (!tap) return;

  try {
    const manager = tap.getLeaderboardManager();
    console.log('[TapTapBridge] Calling manager.submitScores...', ELO_LEADERBOARD_ID, elo);
    const res = await manager.submitScores({
      scores: [{
        leaderboardId: ELO_LEADERBOARD_ID,
        score: elo
      }]
    });
    console.log('[TapTapBridge] submitScores response:', JSON.stringify(res || 'success'));
  } catch (error) {
    console.error('[TapTapBridge] submitScores failed:', JSON.stringify(error));
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
    if (tap.createAchievementManager) {
        const manager = tap.createAchievementManager();
        console.log('[TapTapBridge] Unlocking achievement:', code);
        const res = await manager.reach({ displayId: code });
        console.log('[TapTapBridge] reach response:', JSON.stringify(res || 'success'));
    }
  } catch (error) {
    console.warn('[TapTapBridge] Achievement sync failed:', code, JSON.stringify(error));
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
    console.log('[TapTapBridge] Opening leaderboard window:', ELO_LEADERBOARD_ID);
    manager.openLeaderboard({
      leaderboardId: ELO_LEADERBOARD_ID
    });
  } catch (error) {
    console.error('[TapTapBridge] openLeaderboard failed:', JSON.stringify(error));
  }
};

/**
 * Create UserInfo Button (Alternative for getUserInfo if popup is blocked)
 * Options typically include type, text, image, and style.
 */
export const tapCreateUserInfoButton = async (options: any) => {
    const tap = getTap();
    if (tap && tap.createUserInfoButton) {
        try {
            console.log('[TapTapBridge] Creating UserInfoButton with scope: public_profile');
            // Ensure public_profile scope is implicit or explicit
            const button = tap.createUserInfoButton({
                ...options,
                withScope: true // Some versions might need this
            });
            return button;
        } catch (e) {
            console.warn('[TapTapBridge] Failed to create UserInfoButton:', e);
        }
    }
    return null;
};

/**
 * Open Privacy Contract Window
 */
export const tapOpenPrivacyContract = async () => {
    const tap = getTap();
    if (tap && tap.openPrivacyContract) {
        try {
            console.log('[TapTapBridge] Opening privacy contract...');
            await tap.openPrivacyContract();
            return true;
        } catch (e) {
            console.warn('[TapTapBridge] Failed to open privacy contract:', e);
        }
    }
    return false;
};
