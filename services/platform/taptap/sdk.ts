// Describe only SDK capabilities used by Cute-Go. External results remain unknown.
export interface TapCallbacks {
  success?: (result: unknown) => void;
  fail?: (error: unknown) => void;
  complete?: (result: unknown) => void;
}

export interface TapLoginOptions extends TapCallbacks { timeout?: number }
export interface TapUserInfoOptions extends TapCallbacks {
  withCredentials?: boolean;
  lang?: 'en' | 'zh_CN' | 'zh_TW';
}
export interface TapAuthorizeOptions extends TapCallbacks { scope: 'scope.userInfo' }

export interface TapBattleSdkListeners {
  onDisconnected?: (info: unknown) => void;
  onBattleServiceError?: (info: unknown) => void;
  playerEnterRoom?: (info: unknown) => void;
  playerLeaveRoom?: (info: unknown) => void;
  playerOffline?: (info: unknown) => void;
  onCustomMessage?: (info: unknown) => void;
  onPlayerEntered?: (info: unknown) => void;
  onPlayerLeft?: (info: unknown) => void;
  onPlayerOffline?: (info: unknown) => void;
  onCustomMessageReceived?: (info: unknown) => void;
}
export interface TapBattlePlayerConfig { customProperties: string }
export interface TapBattleRoomConfig {
  maxPlayerCount: number;
  type: string;
  matchParams: { level: string; score: string };
  name?: string;
}
export interface TapBattleRoomOptions {
  data: { roomCfg: TapBattleRoomConfig; playerCfg: TapBattlePlayerConfig };
}
export interface TapBattleJoinOptions {
  data: { roomId: string; playerCfg: TapBattlePlayerConfig };
}
export interface TapBattleMessageOptions { data: { msg: string; type: number } }
export interface TapBattleManager {
  connect?: () => Promise<unknown>;
  createRoom?: (options: TapBattleRoomOptions) => Promise<unknown>;
  joinRoom?: (options: TapBattleJoinOptions) => Promise<unknown>;
  matchRoom?: (options: TapBattleRoomOptions) => Promise<unknown>;
  disconnect?: () => Promise<unknown> | void;
  leaveRoom?: () => Promise<unknown> | void;
  sendCustomMessage?: (options: TapBattleMessageOptions) => Promise<unknown> | void;
  registerListener?: (listeners: TapBattleSdkListeners) => void;
  unregisterListener?: (listeners: TapBattleSdkListeners) => void;
}

export interface TapUserInfoButtonOptions {
  type: 'text' | 'image';
  text?: string;
  image?: string;
  style: {
    left: number; top: number; width: number; height: number;
    lineHeight?: number; backgroundColor?: string; color?: string;
    textAlign?: 'left' | 'center' | 'right'; fontSize?: number; borderRadius?: number;
    borderColor?: string; borderWidth?: number;
  };
  withScope?: boolean;
}
export interface TapUserInfoButton {
  onTap: (listener: (event: unknown) => void) => void;
  offTap?: (listener: (event: unknown) => void) => void;
  show?: () => void;
  hide?: () => void;
  destroy?: () => void;
}
export interface TapLeaderboardScores extends TapCallbacks {
  scores: { leaderboardId: string; score: number }[];
}
export interface TapLeaderboardOpen extends TapCallbacks { leaderboardId: string }
export interface TapAchievementOptions extends TapCallbacks { displayId: string }
export interface TapVibrateOptions extends TapCallbacks { type: 'heavy' | 'medium' | 'light' }

export interface TapSdk {
  login?: (options: TapLoginOptions) => unknown;
  getUserInfo?: (options: TapUserInfoOptions) => unknown;
  authorize?: (options: TapAuthorizeOptions) => unknown;
  requirePrivacyAuthorize?: (options: TapCallbacks) => unknown;
  getPrivacySetting?: (options: TapCallbacks) => unknown;
  getSetting?: (options: TapCallbacks) => unknown;
  getAccountInfoSync?: () => unknown;
  getOnlineBattleManager?: () => unknown;
  getLeaderboardManager?: () => unknown;
  createAchievementManager?: () => unknown;
  createUserInfoButton?: (options: TapUserInfoButtonOptions) => unknown;
  openPrivacyContract?: (options: TapCallbacks) => unknown;
  vibrateShort?: (options: TapVibrateOptions) => unknown;
  vibrateLong?: (options: TapCallbacks) => unknown;
}
