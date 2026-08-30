import type { UserAchievement } from '../../types';

export type PlatformName = 'taptap';

export interface AchievementProgressInput {
  userId: string;
  achievementCode: string;
  currentValue: number;
  isUnlocked: boolean;
  unlockedAt: string | null;
}

export interface AppProfile {
  id: string;
  nickname: string;
  elo: number;
  avatarUrl?: string | null;
}

export interface AppSession {
  user: {
    id: string;
    email?: string | null;
  };
  provider: PlatformName;
  accessToken?: string;
}

export interface AuthState {
  session: AppSession | null;
  profile: AppProfile | null;
}

export interface PlatformAuthResult extends AuthState {
  error?: string;
  message?: string;
  requiresEmailConfirmation?: boolean;
}

export interface PlatformOpponentSummary {
  id: string;
  elo?: number;
}

export interface PlatformLiveMatchHandlers {
  onMessage: (payload: unknown) => void | Promise<void>;
  onPeerJoin?: (peer: PlatformOpponentSummary) => void | Promise<void>;
  onPeerLeave?: (peer: PlatformOpponentSummary) => void | Promise<void>;
  onPeerOffline?: (peer: PlatformOpponentSummary) => void | Promise<void>;
  onDisconnect?: () => void | Promise<void>;
  onError?: (error: unknown) => void | Promise<void>;
}

export interface PlatformLiveMatchSession {
  roomId: string;
  playerId: string;
  isHost: boolean;
  peers: PlatformOpponentSummary[];
  send(payload: unknown): Promise<boolean>;
  leave(): Promise<void>;
}

export interface PlatformAchievementsApi {
  loadForUser(userId: string): Promise<UserAchievement[]>;
  upsertProgress(input: AchievementProgressInput): Promise<{ error?: string }>;
}

export interface PlatformLeaderboardApi {
  submitElo(elo: number): Promise<void>;
  openEloLeaderboard(): void;
}

export interface PlatformAuthApi {
  restoreSession(): Promise<AuthState>;
  onSessionChange(listener: (state: AuthState) => void): () => void;
  signInWithTapTap(): Promise<PlatformAuthResult>;
  signOut(): Promise<void>;
}

export interface PlatformProfileApi {
  getByUserId(userId: string): Promise<AppProfile | null>;
  restoreTapTapProfile(tapId: string): Promise<AuthState>;
  updateElo(userId: string, elo: number): Promise<void>;
  applyOnlineMatchResult(input: {
    winnerId: string;
    loserId: string;
    winnerNewElo: number;
    loserNewElo: number;
  }): Promise<void>;
  updateNickname(userId: string, nickname: string): Promise<AppProfile | null>;
}

export interface PlatformMultiplayerApi {
  usesNativeMatchmaking: boolean;
  startNativeMatch?: (input: {
    roomType: string;
    playerProfile: Record<string, unknown>;
    handlers: PlatformLiveMatchHandlers;
  }) => Promise<PlatformLiveMatchSession | null>;
  createNativeRoom?: (input: {
    roomType: string;
    playerProfile: Record<string, unknown>;
    handlers: PlatformLiveMatchHandlers;
  }) => Promise<PlatformLiveMatchSession | null>;
  joinNativeRoom?: (input: {
    roomId: string;
    playerProfile: Record<string, unknown>;
    handlers: PlatformLiveMatchHandlers;
  }) => Promise<PlatformLiveMatchSession | null>;
}

export interface PlatformProvider {
  name: PlatformName;
  isNative: boolean;
  auth: PlatformAuthApi;
  achievements: PlatformAchievementsApi;
  leaderboard: PlatformLeaderboardApi;
  profile: PlatformProfileApi;
  multiplayer: PlatformMultiplayerApi;
}
