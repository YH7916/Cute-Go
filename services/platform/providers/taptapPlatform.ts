import type { UserAchievement } from '../../../types';
import {
  createTapTapNativeRoom,
  disconnectTap,
  getAccountInfo,
  getTapPlayerId,
  getTapTapRoomMessagePayload,
  getTapTapRoomPlayerInfo,
  getTapUserInfo,
  isTapTapEnv,
  joinTapTapNativeRoom,
  leaveTapTapRoom,
  openTapTapLeaderboard,
  sendTapTapRoomMessage,
  startTapTapNativeMatch,
  submitTapTapElo,
  tapGetPrivacySetting,
  tapGetSetting,
  tapLogin,
  tapRequirePrivacyAuthorize,
  unlockTapTapAchievement,
} from '../../../utils/tapTapBridge';
import type {
  AchievementProgressInput,
  AppProfile,
  AppSession,
  AuthState,
  PlatformAuthResult,
  PlatformLiveMatchSession,
  PlatformOpponentSummary,
  PlatformProvider,
} from '../types';

const PROFILE_STORE_KEY = 'cutego.taptap.profiles';
const ACTIVE_PROFILE_KEY = 'cutego.taptap.activeProfileId';
const ACHIEVEMENTS_PREFIX = 'cutego.taptap.achievements.';

type StoredProfile = AppProfile & {
  tapId: string;
  updatedAt: string;
};

const listeners = new Set<(state: AuthState) => void>();

const readJson = <T>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, value: unknown) => {
  localStorage.setItem(key, JSON.stringify(value));
};

const getStoredProfiles = (): Record<string, StoredProfile> =>
  readJson<Record<string, StoredProfile>>(PROFILE_STORE_KEY, {});

const saveStoredProfiles = (profiles: Record<string, StoredProfile>) => {
  writeJson(PROFILE_STORE_KEY, profiles);
};

const toTapTapSession = (profile: AppProfile): AppSession => ({
  user: {
    id: profile.id,
    email: null,
  },
  provider: 'taptap',
  accessToken: 'taptap-local-session',
});

const toOpponentSummary = (player?: { id?: string } | null): PlatformOpponentSummary | null => {
  if (!player?.id) return null;
  return { id: player.id };
};

const buildLiveMatchSession = (
  matchResult: Awaited<ReturnType<typeof startTapTapNativeMatch>>
): PlatformLiveMatchSession | null => {
  if (!matchResult) return null;

  return {
    roomId: matchResult.roomInfo.id,
    playerId: matchResult.playerId,
    isHost: matchResult.isHost,
    peers: (matchResult.roomInfo.players || [])
      .filter(player => player.id !== matchResult.playerId)
      .map(player => ({ id: player.id })),
    send: payload => sendTapTapRoomMessage(payload),
    leave: async () => {
      await leaveTapTapRoom();
    },
  };
};

const persistTapTapIdentity = (tapId: string) => {
  localStorage.setItem(ACTIVE_PROFILE_KEY, tapId);
  localStorage.setItem('is_taptap_user', 'true');
  localStorage.setItem('taptap_user_id', tapId);
};

const clearTapTapIdentity = () => {
  localStorage.removeItem(ACTIVE_PROFILE_KEY);
  localStorage.removeItem('is_taptap_user');
  localStorage.removeItem('taptap_user_id');
};

const emitAuthState = (state: AuthState) => {
  listeners.forEach(listener => listener(state));
};

const buildAuthStateFromProfile = (profile: AppProfile | null): AuthState => {
  if (!profile) return { session: null, profile: null };
  return {
    session: toTapTapSession(profile),
    profile,
  };
};

const getProfileById = (userId: string): AppProfile | null => {
  const profile = getStoredProfiles()[userId];
  if (!profile) return null;
  return {
    id: profile.id,
    nickname: profile.nickname,
    elo: profile.elo,
    avatarUrl: profile.avatarUrl ?? null,
  };
};

const upsertProfile = (input: {
  id: string;
  nickname: string;
  avatarUrl?: string | null;
  elo?: number;
}): AppProfile => {
  const profiles = getStoredProfiles();
  const existing = profiles[input.id];
  const next: StoredProfile = {
    id: input.id,
    tapId: input.id,
    nickname: input.nickname || existing?.nickname || `玩家_${input.id.slice(0, 6)}`,
    avatarUrl: input.avatarUrl ?? existing?.avatarUrl ?? null,
    elo: input.elo ?? existing?.elo ?? 1200,
    updatedAt: new Date().toISOString(),
  };

  profiles[input.id] = next;
  saveStoredProfiles(profiles);

  return {
    id: next.id,
    nickname: next.nickname,
    elo: next.elo,
    avatarUrl: next.avatarUrl,
  };
};

const getCurrentAuthState = (): AuthState => {
  const activeId = localStorage.getItem(ACTIVE_PROFILE_KEY);
  if (!activeId) return { session: null, profile: null };
  return buildAuthStateFromProfile(getProfileById(activeId));
};

const loadAchievements = (userId: string): UserAchievement[] =>
  readJson<UserAchievement[]>(`${ACHIEVEMENTS_PREFIX}${userId}`, []);

const saveAchievements = (userId: string, achievements: UserAchievement[]) => {
  writeJson(`${ACHIEVEMENTS_PREFIX}${userId}`, achievements);
};

const signInWithTapTap = async (): Promise<PlatformAuthResult> => {
  if (!isTapTapEnv()) {
    return {
      session: null,
      profile: null,
      error: '当前环境不支持 TapTap 登录，请在 TapTap 小游戏内使用。',
    };
  }

  const tap = (window as Window & { tap?: Record<string, unknown> }).tap;
  if (tap) {
    console.log('[Platform] tap object keys:', Object.keys(tap).join(', '));
    await tapRequirePrivacyAuthorize();
    console.log('[Platform] Privacy Settings:', JSON.stringify(await tapGetPrivacySetting()));
    console.log('[Platform] Current Tap Settings:', JSON.stringify(await tapGetSetting()));
  }

  const tapRes = await tapLogin();
  const profileInfo = await getTapUserInfo();

  let tapId: string | null = null;
  let tapNickname: string | null = null;
  let tapAvatar: string | null = null;

  if (typeof tapRes === 'string' && tapRes.length > 0) {
    tapId = tapRes;
  } else if (tapRes && typeof tapRes === 'object') {
    tapId =
      tapRes.unionId ||
      tapRes.union_id ||
      tapRes.unionid ||
      tapRes.openid ||
      tapRes.openId ||
      tapRes.open_id ||
      tapRes.playerId ||
      tapRes.player_id ||
      tapRes.user?.unionId ||
      tapRes.user?.openid ||
      tapRes.user?.id;

    tapNickname =
      tapRes.nickName || tapRes.nickname || tapRes.user?.nickName || tapRes.user?.nickname;
    tapAvatar =
      tapRes.avatarUrl ||
      tapRes.avatar_url ||
      tapRes.user?.avatarUrl ||
      tapRes.user?.avatar_url;
  }

  if (profileInfo) {
    tapNickname = tapNickname || profileInfo.nickName || profileInfo.nickname;
    tapAvatar = tapAvatar || profileInfo.avatarUrl || profileInfo.avatar_url;
    tapId = tapId || profileInfo.openid || profileInfo.unionid || profileInfo.playerId;
  }

  if (!tapId || tapId.length > 50) {
    const stableId = await getTapPlayerId();
    if (stableId) tapId = stableId;
  }

  if (!tapId) {
    const accountInfo = getAccountInfo();
    if (accountInfo) {
      tapId = accountInfo.openid || accountInfo.unionid || accountInfo.playerId;
    }
    if (!tapId && tapRes && typeof tapRes === 'object' && tapRes.code) {
      tapId = tapRes.code;
    }
  }

  if (!tapId) {
    const keys = tapRes && typeof tapRes === 'object' ? Object.keys(tapRes).join(',') : typeof tapRes;
    const msg = tapRes?.errMsg || tapRes?.message || 'none';
    return {
      session: null,
      profile: null,
      error: `TapTap 登录失败: 无法获取任何标识符 (${keys}, ${msg})`,
    };
  }

  const existing = getProfileById(tapId);
  const profile = upsertProfile({
    id: tapId,
    nickname: tapNickname || existing?.nickname || `玩家_${tapId.slice(0, 6)}`,
    avatarUrl: tapAvatar ?? existing?.avatarUrl ?? null,
    elo: existing?.elo ?? 1200,
  });

  persistTapTapIdentity(tapId);
  const state = buildAuthStateFromProfile(profile);
  emitAuthState(state);

  return {
    ...state,
    message: existing ? 'TapTap 登录成功' : '欢迎来到 Cute-Go！',
  };
};

export const taptapPlatform: PlatformProvider = {
  name: 'taptap',
  get isNative() {
    return isTapTapEnv();
  },
  auth: {
    async restoreSession() {
      return getCurrentAuthState();
    },

    onSessionChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    signInWithTapTap,

    async signOut(): Promise<void> {
      clearTapTapIdentity();
      await disconnectTap();
      emitAuthState({ session: null, profile: null });
    },
  },
  achievements: {
    async loadForUser(userId: string): Promise<UserAchievement[]> {
      return loadAchievements(userId);
    },

    async upsertProgress(input: AchievementProgressInput) {
      const current = loadAchievements(input.userId);
      const next = current.filter(item => item.achievement_code !== input.achievementCode);
      next.push({
        achievement_code: input.achievementCode,
        current_value: input.currentValue,
        is_unlocked: input.isUnlocked,
        unlocked_at: input.unlockedAt,
      });
      saveAchievements(input.userId, next);

      if (input.isUnlocked && isTapTapEnv()) {
        await unlockTapTapAchievement(input.achievementCode);
      }

      return {};
    },
  },
  leaderboard: {
    async submitElo(elo: number): Promise<void> {
      if (isTapTapEnv()) {
        await submitTapTapElo(elo);
      }
    },

    openEloLeaderboard(): void {
      if (isTapTapEnv()) {
        openTapTapLeaderboard();
      } else {
        console.info('[Platform] TapTap leaderboard is only available inside TapTap.');
      }
    },
  },
  profile: {
    async getByUserId(userId: string): Promise<AppProfile | null> {
      return getProfileById(userId);
    },

    async restoreTapTapProfile(tapId: string): Promise<AuthState> {
      persistTapTapIdentity(tapId);
      return buildAuthStateFromProfile(getProfileById(tapId));
    },

    async updateElo(userId: string, elo: number): Promise<void> {
      const profile = getProfileById(userId);
      if (!profile) return;
      const nextProfile = upsertProfile({ ...profile, id: userId, elo });
      if (localStorage.getItem(ACTIVE_PROFILE_KEY) === userId) {
        emitAuthState(buildAuthStateFromProfile(nextProfile));
      }
    },

    async applyOnlineMatchResult(): Promise<void> {
      // TapTap 原生联机不依赖项目自建 ELO 结算。
    },

    async updateNickname(userId: string, nickname: string): Promise<AppProfile | null> {
      const profile = getProfileById(userId);
      if (!profile) return null;
      const nextProfile = upsertProfile({
        id: userId,
        nickname,
        avatarUrl: profile.avatarUrl ?? null,
        elo: profile.elo,
      });
      if (localStorage.getItem(ACTIVE_PROFILE_KEY) === userId) {
        emitAuthState(buildAuthStateFromProfile(nextProfile));
      }
      return nextProfile;
    },
  },
  multiplayer: {
    get usesNativeMatchmaking() {
      return isTapTapEnv();
    },

    async startNativeMatch(input): Promise<PlatformLiveMatchSession | null> {
      if (!isTapTapEnv()) return null;

      const matchResult = await startTapTapNativeMatch(input.roomType, input.playerProfile, {
        onCustomMessage: info => {
          const raw = getTapTapRoomMessagePayload(info);
          if (!raw) return;

          try {
            input.handlers.onMessage(JSON.parse(raw));
          } catch (error) {
            console.warn('[Platform] Failed to parse TapTap room message:', error);
          }
        },
        playerEnterRoom: info => {
          const peer = toOpponentSummary(getTapTapRoomPlayerInfo(info));
          if (peer) void input.handlers.onPeerJoin?.(peer);
        },
        playerLeaveRoom: info => {
          const peer = toOpponentSummary(getTapTapRoomPlayerInfo(info));
          if (peer) void input.handlers.onPeerLeave?.(peer);
        },
        playerOffline: info => {
          const peer = toOpponentSummary(getTapTapRoomPlayerInfo(info));
          if (peer) void input.handlers.onPeerOffline?.(peer);
        },
        onDisconnected: () => {
          void input.handlers.onDisconnect?.();
        },
        onBattleServiceError: info => {
          void input.handlers.onError?.(info);
        },
      });

      return buildLiveMatchSession(matchResult);
    },

    async createNativeRoom(input): Promise<PlatformLiveMatchSession | null> {
      if (!isTapTapEnv()) return null;

      const matchResult = await createTapTapNativeRoom(input.roomType, input.playerProfile, {
        onCustomMessage: info => {
          const raw = getTapTapRoomMessagePayload(info);
          if (!raw) return;

          try {
            input.handlers.onMessage(JSON.parse(raw));
          } catch (error) {
            console.warn('[Platform] Failed to parse TapTap room message:', error);
          }
        },
        playerEnterRoom: info => {
          const peer = toOpponentSummary(getTapTapRoomPlayerInfo(info));
          if (peer) void input.handlers.onPeerJoin?.(peer);
        },
        playerLeaveRoom: info => {
          const peer = toOpponentSummary(getTapTapRoomPlayerInfo(info));
          if (peer) void input.handlers.onPeerLeave?.(peer);
        },
        playerOffline: info => {
          const peer = toOpponentSummary(getTapTapRoomPlayerInfo(info));
          if (peer) void input.handlers.onPeerOffline?.(peer);
        },
        onDisconnected: () => {
          void input.handlers.onDisconnect?.();
        },
        onBattleServiceError: info => {
          void input.handlers.onError?.(info);
        },
      });

      return buildLiveMatchSession(matchResult);
    },

    async joinNativeRoom(input): Promise<PlatformLiveMatchSession | null> {
      if (!isTapTapEnv()) return null;

      const matchResult = await joinTapTapNativeRoom(input.roomId, input.playerProfile, {
        onCustomMessage: info => {
          const raw = getTapTapRoomMessagePayload(info);
          if (!raw) return;

          try {
            input.handlers.onMessage(JSON.parse(raw));
          } catch (error) {
            console.warn('[Platform] Failed to parse TapTap room message:', error);
          }
        },
        playerEnterRoom: info => {
          const peer = toOpponentSummary(getTapTapRoomPlayerInfo(info));
          if (peer) void input.handlers.onPeerJoin?.(peer);
        },
        playerLeaveRoom: info => {
          const peer = toOpponentSummary(getTapTapRoomPlayerInfo(info));
          if (peer) void input.handlers.onPeerLeave?.(peer);
        },
        playerOffline: info => {
          const peer = toOpponentSummary(getTapTapRoomPlayerInfo(info));
          if (peer) void input.handlers.onPeerOffline?.(peer);
        },
        onDisconnected: () => {
          void input.handlers.onDisconnect?.();
        },
        onBattleServiceError: info => {
          void input.handlers.onError?.(info);
        },
      });

      return buildLiveMatchSession(matchResult);
    },
  },
};
