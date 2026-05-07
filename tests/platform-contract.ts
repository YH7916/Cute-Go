import { getPlatform, platform } from '../services/platform';
import type { AchievementProgressInput, PlatformProvider } from '../services/platform';

const provider: PlatformProvider = getPlatform();
const selectedName: 'taptap' = provider.name;
const singletonName: 'taptap' = platform.name;

void selectedName;
void singletonName;

const achievementInput: AchievementProgressInput = {
  userId: 'user-1',
  achievementCode: 'FIRST_BLOOD',
  currentValue: 1,
  isUnlocked: true,
  unlockedAt: '2026-05-07T00:00:00.000Z',
};

async function verifyPlatformContract() {
  const achievements = await provider.achievements.loadForUser('user-1');
  achievements.forEach(item => {
    const code: string = item.achievement_code;
    const value: number = item.current_value;
    const unlocked: boolean = item.is_unlocked;
    void code;
    void value;
    void unlocked;
  });

  await provider.achievements.upsertProgress(achievementInput);
  await provider.leaderboard.submitElo(1234);
  provider.leaderboard.openEloLeaderboard();
  const authState = await provider.auth.restoreSession();
  void authState.session;
  void authState.profile;
  const unsubscribe = provider.auth.onSessionChange(() => {});
  unsubscribe();
  await provider.auth.signInWithTapTap();
  await provider.auth.signOut();
  await provider.profile.getByUserId('user-1');
  await provider.profile.restoreTapTapProfile('tap-1');
  await provider.profile.updateElo('user-1', 1300);
  await provider.profile.applyOnlineMatchResult({
    winnerId: 'user-1',
    loserId: 'user-2',
    winnerNewElo: 1305,
    loserNewElo: 1195,
  });
  await provider.profile.updateNickname('user-1', 'new-name');
  const usesNativeMatchmaking: boolean = provider.multiplayer.usesNativeMatchmaking;
  void usesNativeMatchmaking;
  if (provider.multiplayer.startNativeMatch) {
    const nativeMatch = await provider.multiplayer.startNativeMatch({
      roomType: 'go_9',
      playerProfile: { nickname: '棋手' },
      handlers: {
        onMessage: () => {},
      },
    });
    void nativeMatch?.roomId;
  }
}

void verifyPlatformContract;
