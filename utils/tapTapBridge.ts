/* eslint-disable @typescript-eslint/no-explicit-any */

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

type TapBattleManager = {
  connect?: () => Promise<any>;
  createRoom?: (options: Record<string, unknown>) => Promise<any>;
  disconnect?: () => Promise<void>;
  joinRoom?: (options: Record<string, unknown>) => Promise<any>;
  registerListener?: (listeners: Record<string, unknown>) => void;
  matchRoom?: (options: Record<string, unknown>) => Promise<any>;
  sendCustomMessage?: (options: Record<string, unknown>) => Promise<any> | void;
  leaveRoom?: () => Promise<void>;
};

export interface TapBattleRoomPlayer {
  id: string;
  customProperties?: string;
}

export interface TapBattleRoomInfo {
  id: string;
  ownerId?: string;
  players: TapBattleRoomPlayer[];
}

export interface TapBattleMatchResult {
  playerId: string;
  roomInfo: TapBattleRoomInfo;
  isHost: boolean;
}

export interface TapBattleListeners {
  onDisconnected?: (info: any) => void;
  onBattleServiceError?: (info: any) => void;
  playerEnterRoom?: (info: any) => void;
  playerLeaveRoom?: (info: any) => void;
  playerOffline?: (info: any) => void;
  onCustomMessage?: (info: any) => void;
}

const resolveBattlePlayerId = (connectResult: any) =>
  connectResult?.playerId || connectResult?.id || connectResult?.playerInfo?.id || null;

const resolveRoomInfo = (result: any): TapBattleRoomInfo | null =>
  result?.roomInfo || result?.data?.roomInfo || result?.room || result?.data || null;

const resolveRoomPlayer = (info: any) => {
  const nestedPlayer =
    info?.playerInfo || info?.data?.playerInfo || info?.player || info?.data?.player;
  if (nestedPlayer) return nestedPlayer;

  const id = info?.playerId || info?.id || info?.userId || info?.fromPlayerId;
  return id ? { ...info, id } : null;
};

export const getTapTapRoomPlayerInfo = resolveRoomPlayer;

export const getTapTapRoomMessagePayload = (info: any) =>
  info?.msg || info?.message || info?.content || info?.data?.msg || info?.data?.message || info?.data?.content;

const buildBattlePlayerConfig = (playerProperties: Record<string, unknown>) => ({
  customProperties: JSON.stringify(playerProperties),
});

const buildBattleRoomConfig = (roomType: string, includeName = false) => ({
  maxPlayerCount: 2,
  type: roomType,
  matchParams: {
    level: roomType,
    score: '0',
  },
  ...(includeName ? { name: `Cute-Go ${roomType}` } : {}),
});

const toBattleMatchResult = (
  playerId: string,
  rawRoomInfo: any
): TapBattleMatchResult | null => {
  const roomInfo = rawRoomInfo
    ? {
      ...rawRoomInfo,
      id: rawRoomInfo.id ?? rawRoomInfo.roomId ?? rawRoomInfo.roomID,
      ownerId: rawRoomInfo.ownerId ?? rawRoomInfo.ownerID ?? rawRoomInfo.masterId ?? rawRoomInfo.masterID,
      players: rawRoomInfo.players ?? rawRoomInfo.playerList ?? [],
    }
    : null;
  if (!roomInfo?.id) return null;
  return {
    playerId,
    roomInfo,
    isHost: roomInfo.ownerId === playerId,
  };
};

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

const getTapOnlineBattleManager = (): TapBattleManager | null => {
  const tap = getTap();
  if (!tap?.getOnlineBattleManager) return null;
  return tap.getOnlineBattleManager();
};

let connectedBattleManager: TapBattleManager | null = null;
let connectedBattlePlayerId: string | null = null;
let pendingBattleManager: TapBattleManager | null = null;
let battleConnectPromise: Promise<string> | null = null;
let registeredBattleManager: TapBattleManager | null = null;
let activeBattleListeners: TapBattleListeners = {};

const resetBattleConnection = (manager?: TapBattleManager) => {
  if (
    manager &&
    connectedBattleManager &&
    connectedBattleManager !== manager &&
    pendingBattleManager !== manager
  ) return;
  connectedBattleManager = null;
  connectedBattlePlayerId = null;
  pendingBattleManager = null;
  battleConnectPromise = null;
};

const registerTapBattleListeners = (
  manager: TapBattleManager,
  listeners: TapBattleListeners
) => {
  activeBattleListeners = listeners;
  if (!manager.registerListener || registeredBattleManager === manager) return;

  registeredBattleManager = manager;
  manager.registerListener({
    onDisconnected: (info: any) => {
      if (registeredBattleManager !== manager) return;
      resetBattleConnection(manager);
      activeBattleListeners.onDisconnected?.(info);
    },
    onBattleServiceError: (info: any) => {
      if (registeredBattleManager !== manager) return;
      activeBattleListeners.onBattleServiceError?.(info);
    },
    playerEnterRoom: (info: any) => {
      if (registeredBattleManager !== manager) return;
      activeBattleListeners.playerEnterRoom?.(info);
    },
    playerLeaveRoom: (info: any) => {
      if (registeredBattleManager !== manager) return;
      activeBattleListeners.playerLeaveRoom?.(info);
    },
    playerOffline: (info: any) => {
      if (registeredBattleManager !== manager) return;
      activeBattleListeners.playerOffline?.(info);
    },
    onCustomMessage: (info: any) => {
      if (registeredBattleManager !== manager) return;
      activeBattleListeners.onCustomMessage?.(info);
    },
  });
};

const connectTapBattle = async (manager: TapBattleManager): Promise<string> => {
  if (connectedBattleManager === manager && connectedBattlePlayerId) {
    return connectedBattlePlayerId;
  }
  if (pendingBattleManager === manager && battleConnectPromise) {
    return battleConnectPromise;
  }
  if (!manager.connect) {
    throw new Error('TapTap OnlineBattleManager.connect is unavailable');
  }

  pendingBattleManager = manager;
  const currentPromise = manager.connect().then(result => {
    const playerId = resolveBattlePlayerId(result);
    if (!playerId) {
      throw new Error('TapTap connect() returned no playerId');
    }
    connectedBattleManager = manager;
    connectedBattlePlayerId = playerId;
    return playerId;
  });
  battleConnectPromise = currentPromise;

  try {
    return await currentPromise;
  } finally {
    if (battleConnectPromise === currentPromise) {
      battleConnectPromise = null;
      pendingBattleManager = null;
    }
  }
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
    const res = await tap.login();
    console.log('[TapTapBridge] tap.login result:', JSON.stringify(res));
    return res;
  } catch (error) {
    console.error('[TapTapBridge] Login promise rejected:', error);
    return null;
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
export const getTapUserInfo = async (retryIfUnauthorized = true): Promise<any> => {
  const tap = getTap();
  if (tap && tap.getUserInfo) {
    try {
      console.log('[TapTapBridge] Calling tap.getUserInfo()...');
      const res = await new Promise<any>((resolve, reject) => {
        const maybePromise = tap.getUserInfo({
          success: (result: any) => resolve(result?.userInfo ?? result),
          fail: reject,
        });
        if (maybePromise?.then) {
          void maybePromise.then(
            (result: any) => resolve(result?.userInfo ?? result),
            reject
          );
        }
      });
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
      const playerId = await connectTapBattle(manager);
      console.log('[TapTapBridge] connect() extracted ID:', playerId);
      return playerId;
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
  const manager = getTapOnlineBattleManager();
  if (manager) {
    try {
      if (manager.disconnect) {
        await manager.disconnect();
        console.log('[TapTapBridge] OnlineBattleManager disconnected');
      }
    } catch (e) {
      console.warn('[TapTapBridge] Disconnect failed', e);
    } finally {
      activeBattleListeners = {};
      resetBattleConnection(manager);
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

export const startTapTapNativeMatch = async (
  roomType: string,
  playerProperties: Record<string, unknown>,
  listeners: TapBattleListeners = {}
): Promise<TapBattleMatchResult | null> => {
  const manager = getTapOnlineBattleManager();
  if (!manager?.connect || !manager?.matchRoom) {
    console.warn('[TapTapBridge] OnlineBattleManager connect/matchRoom is unavailable');
    return null;
  }

  registerTapBattleListeners(manager, listeners);
  const playerId = await connectTapBattle(manager);

  const matchResult = await manager.matchRoom({
    data: {
      roomCfg: buildBattleRoomConfig(roomType),
      playerCfg: buildBattlePlayerConfig(playerProperties),
    },
  });

  const result = toBattleMatchResult(playerId, resolveRoomInfo(matchResult));
  if (!result) {
    console.warn('[TapTapBridge] matchRoom() returned invalid roomInfo');
    return null;
  }

  return result;
};

export const createTapTapNativeRoom = async (
  roomType: string,
  playerProperties: Record<string, unknown>,
  listeners: TapBattleListeners = {}
): Promise<TapBattleMatchResult | null> => {
  const manager = getTapOnlineBattleManager();
  if (!manager?.connect || !manager?.createRoom) {
    console.warn('[TapTapBridge] OnlineBattleManager connect/createRoom is unavailable');
    return null;
  }

  registerTapBattleListeners(manager, listeners);
  const playerId = await connectTapBattle(manager);

  const createResult = await manager.createRoom({
    data: {
      roomCfg: buildBattleRoomConfig(roomType, true),
      playerCfg: buildBattlePlayerConfig(playerProperties),
    },
  });

  const result = toBattleMatchResult(playerId, resolveRoomInfo(createResult));
  if (!result) {
    console.warn('[TapTapBridge] createRoom() returned invalid roomInfo');
    return null;
  }

  return result;
};

export const joinTapTapNativeRoom = async (
  roomId: string,
  playerProperties: Record<string, unknown>,
  listeners: TapBattleListeners = {}
): Promise<TapBattleMatchResult | null> => {
  const manager = getTapOnlineBattleManager();
  if (!manager?.connect || !manager?.joinRoom) {
    console.warn('[TapTapBridge] OnlineBattleManager connect/joinRoom is unavailable');
    return null;
  }

  registerTapBattleListeners(manager, listeners);
  const playerId = await connectTapBattle(manager);

  const joinResult = await manager.joinRoom({
    data: {
      roomId,
      playerCfg: buildBattlePlayerConfig(playerProperties),
    },
  });

  const result = toBattleMatchResult(playerId, resolveRoomInfo(joinResult));
  if (!result) {
    console.warn('[TapTapBridge] joinRoom() returned invalid roomInfo');
    return null;
  }

  return result;
};

export const sendTapTapRoomMessage = async (payload: unknown): Promise<boolean> => {
  const manager = getTapOnlineBattleManager();
  if (!manager?.sendCustomMessage) return false;

  try {
    await manager.sendCustomMessage({
      data: {
        msg: JSON.stringify(payload),
        type: 0,
      },
    });
    return true;
  } catch (error) {
    console.warn('[TapTapBridge] sendCustomMessage failed:', error);
    return false;
  }
};

export const leaveTapTapRoom = async () => {
  const manager = getTapOnlineBattleManager();
  if (!manager?.leaveRoom) return;

  try {
    await manager.leaveRoom();
  } catch (error) {
    console.warn('[TapTapBridge] leaveRoom failed:', error);
  }
};

/**
 * TapTap Vibration - Short
 * @param type 'heavy' | 'medium' | 'light'
 */
export const tapVibrateShort = (type: 'heavy' | 'medium' | 'light' = 'medium') => {
    const tap = getTap();
    if (tap && tap.vibrateShort) {
        try {
            console.log('[TapTapBridge] Triggering short vibration:', type);
            tap.vibrateShort({
                type,
                success: () => console.log('[TapTapBridge] Short vibration success'),
                fail: (err: any) => console.warn('[TapTapBridge] Short vibration failed:', err)
            });
            return true;
        } catch (e) {
            console.warn('[TapTapBridge] vibrateShort error:', e);
        }
    }
    return false;
};

/**
 * TapTap Vibration - Long
 */
export const tapVibrateLong = () => {
    const tap = getTap();
    if (tap && tap.vibrateLong) {
        try {
            console.log('[TapTapBridge] Triggering long vibration');
            tap.vibrateLong({
                success: () => console.log('[TapTapBridge] Long vibration success'),
                fail: (err: any) => console.warn('[TapTapBridge] Long vibration failed:', err)
            });
            return true;
        } catch (e) {
            console.warn('[TapTapBridge] vibrateLong error:', e);
        }
    }
    return false;
};
