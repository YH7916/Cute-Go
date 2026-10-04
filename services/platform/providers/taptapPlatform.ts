import type { AuthState, PlatformAuthResult, PlatformProvider } from '../types';
import { isTapTapEnv } from '../taptap/runtime';
import { getAccountInfo, getTapUserInfo, tapLogin, tapRequirePrivacyAuthorize } from '../taptap/auth';
import { openTapTapLeaderboard, submitTapTapElo, unlockTapTapAchievement } from '../taptap/capabilities';
import { createTapTapNativeRoom, disconnectTap, getTapPlayerId, joinTapTapNativeRoom, startTapTapNativeMatch } from '../taptap/battle';
import { buildLiveMatchSession, createMatchListeners } from '../taptap/matchSession';
import { parseTapIdentity } from '../taptap/identity';
import {
  buildAuthStateFromProfile, clearTapTapIdentity, getActiveProfileId,
  getCurrentAuthState, getProfileById, loadAchievements, persistTapTapIdentity,
  saveAchievements, upsertProfile,
} from '../taptap/profileStore';

const listeners = new Set<(state: AuthState) => void>();
let authRevision = 0;
const authFailure = (error: string): PlatformAuthResult => ({ session: null, profile: null, error });

function emitAuthState(state: AuthState) {
  listeners.forEach(listener => {
    try { listener(state); }
    catch { console.warn('[Platform] TapTap auth listener failed'); }
  });
}

async function signInWithTapTap(): Promise<PlatformAuthResult> {
  if (!isTapTapEnv()) return authFailure('当前环境不支持 TapTap 登录，请在 TapTap 小游戏内使用。');
  const revision = ++authRevision;
  const cancelled = () => revision !== authRevision;
  const cancellation = () => authFailure('本次登录已取消，请重试。');
  await tapRequirePrivacyAuthorize();
  if (cancelled()) return cancellation();
  const login = parseTapIdentity(await tapLogin(), 'login');
  if (cancelled()) return cancellation();
  const userInfo = parseTapIdentity(await getTapUserInfo(), 'userInfo');
  if (cancelled()) return cancellation();
  let tapId = login.id ?? userInfo.id;
  // Keep the battle-ID fallback; a missing stable ID must not create an account
  // from tap.login's temporary code.
  if (!tapId || tapId.length > 50) {
    const stableId = await getTapPlayerId();
    if (cancelled()) return cancellation();
    if (stableId) tapId = stableId;
  }
  tapId ??= parseTapIdentity(getAccountInfo(), 'accountInfo').id;
  if (!tapId) return authFailure('TapTap 登录失败：未取得稳定玩家标识，请重试。');

  const existing = getProfileById(tapId);
  const profile = upsertProfile({
    id: tapId,
    nickname: login.nickname ?? userInfo.nickname ?? existing?.nickname ?? `玩家_${tapId.slice(0, 6)}`,
    avatarUrl: login.avatarUrl ?? userInfo.avatarUrl ?? existing?.avatarUrl ?? null,
    elo: existing?.elo ?? 1200,
  });
  if (!profile || !persistTapTapIdentity(tapId)) return authFailure('无法保存 TapTap 登录状态，请检查本地存储后重试。');
  const state = buildAuthStateFromProfile(profile);
  emitAuthState(state);
  return { ...state, message: existing ? 'TapTap 登录成功' : '欢迎来到 Cute-Go！' };
}

export const taptapPlatform: PlatformProvider = {
  name: 'taptap',
  get isNative() { return isTapTapEnv(); },
  auth: {
    async restoreSession() { return getCurrentAuthState(); },
    onSessionChange(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    signInWithTapTap,
    async signOut() {
      const revision = ++authRevision;
      const cleared = clearTapTapIdentity();
      await disconnectTap();
      if (revision !== authRevision) return;
      if (!cleared) throw new Error('无法清除本地 TapTap 登录状态，请重试。');
      emitAuthState({ session: null, profile: null });
    },
  },
  achievements: {
    async loadForUser(userId) { return loadAchievements(userId); },
    async upsertProgress(input) {
      const next = loadAchievements(input.userId).filter(item => item.achievement_code !== input.achievementCode);
      next.push({
        achievement_code: input.achievementCode, current_value: input.currentValue,
        is_unlocked: input.isUnlocked, unlocked_at: input.unlockedAt,
      });
      if (!saveAchievements(input.userId, next)) return { error: '无法保存成就进度' };
      if (input.isUnlocked && isTapTapEnv()) await unlockTapTapAchievement(input.achievementCode);
      return {};
    },
  },
  leaderboard: {
    async submitElo(elo) { if (isTapTapEnv()) await submitTapTapElo(elo); },
    openEloLeaderboard() {
      if (isTapTapEnv()) openTapTapLeaderboard();
      else console.info('[Platform] TapTap leaderboard is only available inside TapTap.');
    },
  },
  profile: {
    async getByUserId(userId) { return getProfileById(userId); },
    async restoreTapTapProfile(tapId) {
      const profile = getProfileById(tapId);
      return profile && persistTapTapIdentity(tapId) ? buildAuthStateFromProfile(profile) : { session: null, profile: null };
    },
    async updateElo(userId, elo) {
      const profile = getProfileById(userId);
      if (!profile) return;
      const next = upsertProfile({ ...profile, elo });
      if (!next) throw new Error('无法保存积分');
      if (getActiveProfileId() === userId) emitAuthState(buildAuthStateFromProfile(next));
    },
    async applyOnlineMatchResult() {
      // TapTap 原生联机不依赖项目自建 ELO 结算。
    },
    async updateNickname(userId, nickname) {
      const profile = getProfileById(userId);
      if (!profile) return null;
      const next = upsertProfile({ ...profile, nickname });
      if (next && getActiveProfileId() === userId) emitAuthState(buildAuthStateFromProfile(next));
      return next;
    },
  },
  multiplayer: {
    get usesNativeMatchmaking() { return isTapTapEnv(); },
    async startNativeMatch(input) {
      if (!isTapTapEnv()) return null;
      return buildLiveMatchSession(await startTapTapNativeMatch(input.roomType, input.playerProfile, createMatchListeners(input.handlers)));
    },
    async createNativeRoom(input) {
      if (!isTapTapEnv()) return null;
      return buildLiveMatchSession(await createTapTapNativeRoom(input.roomType, input.playerProfile, createMatchListeners(input.handlers)));
    },
    async joinNativeRoom(input) {
      if (!isTapTapEnv()) return null;
      return buildLiveMatchSession(await joinTapTapNativeRoom(input.roomId, input.playerProfile, createMatchListeners(input.handlers)));
    },
  },
};
