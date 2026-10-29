import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTestModule } from './helpers/loadTestModule.mjs';

const { useEndGameAction, useGameState, useAchievements, platform, upsertProfile,
  parseNativeMatchMessage, renderHook } = await loadTestModule({
  reactHost: true,
  contents: `
    export { useEndGameAction } from './hooks/gameActions/useEndGameAction';
    export { useGameState } from './hooks/useGameState';
    export { useAchievements } from './hooks/useAchievements';
    export { platform } from './services/platform';
    export { upsertProfile } from './services/platform/taptap/profileStore';
    export { parseNativeMatchMessage } from './services/platform/nativeMatchMessages';
    export { renderHook } from './tests/helpers/reactHooks';
  `,
});

const profileKey = 'cutego.taptap.profiles';

async function setup(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const values = new Map();
  // Only storage, media and the hook host are replaced. Profile updates and
  // achievement persistence execute the production provider and profile store.
  for (const [key, value] of Object.entries({
    localStorage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value); },
      removeItem: key => { values.delete(key); },
    },
    window: {},
  })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, key, previous);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
  for (const id of ['player', 'opponent', 'next-player']) {
    assert.ok(upsertProfile({ id, nickname: id, elo: 1200 }));
    values.set(`last_login_date_${id}`, new Date().toDateString());
  }
  const auth = await platform.profile.restoreTapTapProfile('player');
  assert.ok(auth.session && auth.profile);
  const applyOnline = t.mock.method(platform.profile, 'applyOnlineMatchResult');
  const updateElo = t.mock.method(platform.profile, 'updateElo');
  const readProfile = t.mock.method(platform.profile, 'getByUserId');
  const onUnlocked = t.mock.fn();
  const fetched = [], achievementInputs = [], achievementWork = [], authEvents = [];
  t.after(platform.auth.onSessionChange(state => authEvents.push(state)));
  const display = { text: '+999', style: 'gold' };
  const options = {
    settings: { gameType: 'Go', gameMode: 'PvP', difficulty: 'Medium', userColor: 'black', boardSize: 9, coachMode: false },
    aiTimerRef: { current: null }, aiTurnLock: { current: false }, pendingEndGameRef: { current: null },
    onlineStatus: 'connected', myColor: 'white', opponentProfile: null,
    session: auth.session, userProfile: auth.profile, displayTerritory: null,
    fetchProfile: async id => { fetched.push(await platform.profile.getByUserId(id)); },
    setEloDiffText: text => { display.text = text; },
    setEloDiffStyle: style => { display.style = style; },
    stopWebThinking() {}, vibrate() {}, playSfx() {},
  };
  const host = renderHook(() => {
    const state = useGameState(9);
    const achievements = useAchievements(options.session?.user.id, onUnlocked);
    const end = useEndGameAction({ ...options, gameState: state,
      checkEndGameAchievements: input => {
        achievementInputs.push(input);
        achievementWork.push(achievements.checkEndGameAchievements(input));
      },
    });
    return { state, end };
  });
  t.after(() => host.unmount());
  host.render();
  await Promise.resolve();
  return { ...host, values, options, display, fetched, achievementInputs, achievementWork,
    authEvents, applyOnline, updateElo, readProfile, onUnlocked };
}

for (const legacyElo of [false, true]) {
  for (const winner of ['white', 'black']) {
    test(`online ${winner === 'white' ? 'win' : 'loss'} ${legacyElo ? 'with legacy elo' : 'without elo'} preserves achievements without claiming rating changes`, async t => {
      const s = await setup(t);
      const message = parseNativeMatchMessage({ type: 'SYNC', boardSize: 9, gameType: 'Go', startColor: 'white',
        opponentInfo: { id: 'opponent', ...(legacyElo ? { elo: 1200 } : {}) },
      }, 9);
      assert.equal(message?.type, 'SYNC');
      s.options.opponentProfile = message.opponentInfo;
      const { state, end } = s.render();
      const position = { ...state.readPosition(), blackCaptures: 3, whiteCaptures: 21 };
      state.writePosition(position);
      const score = winner === 'white' ? { black: 39, white: 39.5 } : { black: 42, white: 39 };
      const before = s.values.get(profileKey);
      await end(winner, '联机结束', score);
      await Promise.all(s.achievementWork);
      t.mock.timers.tick(5000);
      await Promise.resolve();
      const finished = s.render().state;
      assert.equal(finished.gameOver, true);
      assert.equal(finished.winner, winner);
      assert.equal(finished.readPosition(), position);
      assert.deepEqual(s.achievementInputs, [{ winner, myColor: 'white', score, captures: { black: 3, white: 21 } }]);
      const achievements = await platform.achievements.loadForUser('player');
      assert.deepEqual(achievements.map(item => item.achievement_code).sort(), winner === 'white'
        ? ['BIG_EATER', 'FIRST_BLOOD', 'LUCKY_DOG', 'WINNER_1'] : ['BIG_EATER', 'FIRST_BLOOD']);
      assert.ok(achievements.every(item => item.is_unlocked));
      assert.equal(s.onUnlocked.mock.callCount(), achievements.length, 'each new achievement reaches the shared sound callback');
      assert.equal(s.values.get(profileKey), before);
      assert.deepEqual({ reason: finished.winReason, ...s.display, fetched: s.fetched,
        reads: s.readProfile.mock.callCount(), updates: s.updateElo.mock.callCount(),
        onlineResults: s.applyOnline.mock.callCount(), authEvents: s.authEvents },
      { reason: '联机结束', text: null, style: null, fetched: [], reads: 0, updates: 0, onlineResults: 0, authEvents: [] });
    });
  }
}

test('online loss cannot refresh the old account after switching accounts during the former delay', async t => {
  const s = await setup(t);
  s.options.opponentProfile = { id: 'opponent', elo: 1200 };
  await s.render().end('black', '联机结束', { black: 42, white: 39 });
  await Promise.all(s.achievementWork);
  const next = await platform.profile.restoreTapTapProfile('next-player');
  Object.assign(s.options, { session: next.session, userProfile: next.profile, onlineStatus: 'disconnected' });
  s.render();
  t.mock.timers.tick(5000);
  await Promise.resolve();
  assert.deepEqual(s.fetched, []);
  assert.equal(s.readProfile.mock.callCount(), 0);
  assert.equal((await platform.auth.restoreSession()).session.user.id, 'next-player');
  assert.deepEqual(s.authEvents, []);
});

for (const winner of ['black', 'white']) {
  test(`ordinary PvAI ${winner === 'black' ? 'win' : 'loss'} still persists and refreshes the real rating`, async t => {
    const s = await setup(t);
    s.options.onlineStatus = 'disconnected';
    s.options.settings.gameMode = 'PvAI';
    const expectedElo = winner === 'black' ? 1208 : 1192;
    const expectedDiff = winner === 'black' ? '+8' : '-8';
    const score = winner === 'black' ? { black: 42, white: 39 } : { black: 39, white: 42 };
    await s.render().end(winner, '数目结束', score);
    await Promise.all(s.achievementWork);
    assert.deepEqual(s.updateElo.mock.calls.map(call => call.arguments), [['player', expectedElo]]);
    assert.equal(s.applyOnline.mock.callCount(), 0);
    assert.deepEqual(s.fetched.map(profile => [profile.id, profile.elo]), [['player', expectedElo]]);
    assert.equal((await platform.profile.getByUserId('player')).elo, expectedElo);
    assert.equal((await platform.profile.getByUserId('opponent')).elo, 1200);
    assert.deepEqual(s.authEvents.map(event => event.profile.elo), [expectedElo]);
    assert.deepEqual(s.achievementInputs, [{ winner, myColor: 'black', score, captures: { black: 0, white: 0 } }]);
    assert.deepEqual(s.display, { text: expectedDiff, style: winner === 'black' ? 'normal' : 'negative' });
    assert.equal(s.render().state.winReason, `数目结束 (积分 ${expectedDiff})`);
  });
}
