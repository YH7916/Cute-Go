import assert from 'node:assert/strict';
import { test } from 'node:test';
import { taptapPlatform } from '../services/platform/providers/taptapPlatform';
import { createMatchListeners } from '../services/platform/taptap/matchSession';
import { tryTapVibration } from '../services/platform/haptics';

function installRuntime(t: { after(fn: () => void): void }, tap: unknown) {
  const values = new Map<string, string>();
  for (const [name, value] of Object.entries({
    window: { tap },
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    },
  })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, name, previous);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
  return values;
}

test('login code alone is never persisted as a stable player identity', async t => {
  const storage = installRuntime(t, {
    login: async () => ({ code: 'five-minute-login-code' }),
    getUserInfo: async () => ({ userInfo: { nickName: '棋手' } }),
  });
  const result = await taptapPlatform.auth.signInWithTapTap();
  assert.equal(result.session, null);
  assert.equal(result.profile, null);
  assert.ok(result.error);
  assert.equal(storage.has('cutego.taptap.activeProfileId'), false);
  assert.equal(storage.has('cutego.taptap.profiles'), false);
});

test('malformed identity fields cannot shadow a valid stable ID or enter profile storage', async t => {
  installRuntime(t, {
    login: async () => ({ unionId: {}, playerId: 'player-1', nickName: 3, avatarUrl: [] }),
    getUserInfo: async () => ({ userInfo: { nickname: '棋手', avatar_url: 'avatar.png' } }),
  });
  const result = await taptapPlatform.auth.signInWithTapTap();
  assert.equal(result.profile?.id, 'player-1');
  assert.equal(result.profile?.nickname, '棋手');
  assert.equal(result.profile?.avatarUrl, 'avatar.png');
  assert.equal(result.error, undefined);
});

for (const source of ['login', 'userInfo', 'accountInfo'] as const) {
  test(`identity source ${source} preserves the existing account and ELO when both IDs exist`, async t => {
    const identity = { openid: 'old-openid', unionid: 'old-unionid' };
    const expectedId = source === 'login' ? identity.unionid : identity.openid;
    const storage = installRuntime(t, {
      login: async () => source === 'login' ? identity : { code: 'temporary-code' },
      getUserInfo: async () => ({ userInfo: source === 'userInfo' ? identity : {} }),
      getAccountInfoSync: () => source === 'accountInfo' ? identity : {},
    });
    storage.set('cutego.taptap.profiles', JSON.stringify({
      [expectedId]: { id: expectedId, nickname: '老棋手', avatarUrl: null, elo: 1630 },
    }));
    const result = await taptapPlatform.auth.signInWithTapTap();
    assert.equal(result.profile?.id, expectedId);
    assert.equal(result.profile?.elo, 1630);
    assert.equal(result.message, 'TapTap 登录成功');
  });
}

test('logout invalidates a pending login before it can persist or publish a session', async t => {
  let finishLogin!: (value: unknown) => void;
  const storage = installRuntime(t, {
    login: () => new Promise(resolve => { finishLogin = resolve; }),
    getUserInfo: async () => ({ userInfo: { nickname: '棋手' } }),
  });
  const sessions: unknown[] = [];
  const unsubscribe = taptapPlatform.auth.onSessionChange(state => sessions.push(state.session));
  t.after(unsubscribe);
  const login = taptapPlatform.auth.signInWithTapTap();
  // Privacy preflight completes before the SDK login starts.
  for (let count = 0; count < 20 && !finishLogin; count++) await Promise.resolve();
  assert.equal(typeof finishLogin, 'function');
  await taptapPlatform.auth.signOut();
  finishLogin({ unionId: 'old-player' });
  const result = await login;
  assert.equal(result.session, null);
  assert.deepEqual(sessions, [null]);
  assert.equal(storage.has('cutego.taptap.activeProfileId'), false);
});

test('a delayed logout does not publish signed-out over a newer successful login', async t => {
  let finishDisconnect!: () => void;
  const storage = installRuntime(t, {
    login: async () => ({ unionId: 'new-player' }),
    getUserInfo: async () => ({ userInfo: { nickname: '新棋手' } }),
    getOnlineBattleManager: () => manager,
  });
  const manager = { disconnect: () => new Promise<void>(resolve => { finishDisconnect = resolve; }) };
  const sessions: unknown[] = [];
  const unsubscribe = taptapPlatform.auth.onSessionChange(state => sessions.push(state.session?.user.id ?? null));
  t.after(unsubscribe);
  const logout = taptapPlatform.auth.signOut();
  for (let count = 0; count < 20 && !finishDisconnect; count++) await Promise.resolve();
  assert.equal(typeof finishDisconnect, 'function');
  assert.equal((await taptapPlatform.auth.signInWithTapTap()).profile?.id, 'new-player');
  finishDisconnect();
  await logout;
  assert.deepEqual(sessions, ['new-player']);
  assert.equal(storage.get('cutego.taptap.activeProfileId'), 'new-player');
});

test('room listener adapter handles string/object messages and rejects malformed JSON or peers', () => {
  const messages: unknown[] = [], peers: string[] = [];
  const listeners = createMatchListeners({
    onMessage: value => { messages.push(value); },
    onPeerJoin: peer => { peers.push(peer.id); },
  });
  listeners.onCustomMessage?.({ msg: '{"type":"PASS"}' });
  listeners.onCustomMessage?.({ message: { type: 'MOVE', x: 2, y: 3 } });
  listeners.onCustomMessage?.({ message: '{malformed' });
  listeners.playerEnterRoom?.({ playerInfo: { id: 'peer' } });
  listeners.playerEnterRoom?.({ playerInfo: { id: {} } });
  assert.deepEqual(messages, [{ type: 'PASS' }, { type: 'MOVE', x: 2, y: 3 }]);
  assert.deepEqual(peers, ['peer']);
});

test('room listener adapter contains synchronous throws and rejected application callbacks', async () => {
  const listeners = createMatchListeners({
    onMessage: async () => { throw new Error('message failed'); },
    onPeerJoin: () => { throw new Error('peer failed'); },
  });
  assert.doesNotThrow(() => listeners.onCustomMessage?.({ msg: '{}' }));
  assert.doesNotThrow(() => listeners.playerEnterRoom?.({ id: 'peer' }));
  await new Promise(resolve => setImmediate(resolve));
});

test('haptics prefers short vibration and only uses long when short is unavailable', t => {
  const calls: string[] = [];
  const tap: { vibrateShort?: () => void; vibrateLong?: () => void } = {
    vibrateShort: () => { calls.push('short'); }, vibrateLong: () => { calls.push('long'); },
  };
  installRuntime(t, tap);
  assert.equal(tryTapVibration(), true);
  tap.vibrateShort = undefined;
  assert.equal(tryTapVibration(), true);
  tap.vibrateLong = undefined;
  assert.equal(tryTapVibration(), false);
  assert.deepEqual(calls, ['short', 'long']);
});
