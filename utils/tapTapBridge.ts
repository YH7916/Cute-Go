/** @deprecated Import the corresponding services/platform API instead. */
export { isTapTapEnv } from '../services/platform/taptap/runtime';
export {
  tapLogin, tapAuthorizeUserInfo, getTapUserInfo, getAccountInfo,
  tapRequirePrivacyAuthorize, tapGetPrivacySetting, tapGetSetting,
} from '../services/platform/taptap/auth';
export {
  submitTapTapElo, unlockTapTapAchievement, openTapTapLeaderboard,
  tapCreateUserInfoButton, tapOpenPrivacyContract, tapVibrateShort, tapVibrateLong,
} from '../services/platform/taptap/capabilities';
export {
  getTapPlayerId, disconnectTap, startTapTapNativeMatch,
  createTapTapNativeRoom, joinTapTapNativeRoom, sendTapTapRoomMessage, leaveTapTapRoom,
} from '../services/platform/taptap/battle';
export { getTapTapRoomPlayerInfo, getTapTapRoomMessagePayload } from '../services/platform/taptap/battlePayloads';
export type { TapBattleRoomPlayer, TapBattleRoomInfo } from '../services/platform/taptap/battlePayloads';
export type { TapBattleMatchResult, TapBattleListeners } from '../services/platform/taptap/battle';
