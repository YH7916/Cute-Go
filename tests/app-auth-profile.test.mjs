import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTestModule } from './helpers/loadTestModule.mjs';

// Use the real auth hook/provider with a fake SDK and storage. The hook host
// exercises callback ordering; it does not emulate React concurrent rendering.
const { useAppAuthProfile, renderHook, platform } = await loadTestModule({
  reactHost: true,
  contents: `
      export { useAppAuthProfile } from './hooks/useAppAuthProfile';
      export { renderHook } from './tests/helpers/reactHooks';
      export { platform } from './services/platform';
    `,
});

async function setup(t, native = true) {
  const profile = { id: 'old-player', nickname: '原棋手', elo: 1630, avatarUrl: null };
  const storage = new Map([
    ['cutego.taptap.profiles', JSON.stringify({ [profile.id]: profile })],
    ['cutego.taptap.activeProfileId', profile.id],
    ['is_taptap_user', 'true'], ['taptap_user_id', profile.id],
  ]);
  let disconnectCount = 0;
  let finishDisconnect;
  const manager = {
    disconnect: () => {
      disconnectCount++;
      return new Promise(resolve => { finishDisconnect = resolve; });
    },
  };
  const globals = {
    window: native ? { tap: {
      login: async () => ({ unionId: 'new-player' }),
      getUserInfo: async () => ({ userInfo: { nickname: '新棋手' } }),
      getOnlineBattleManager: () => manager,
    } } : {},
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => { storage.set(key, value); },
      removeItem: key => { storage.delete(key); },
    },
  };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
  const toasts = [];
  const host = renderHook(() => useAppAuthProfile({ setToastMsg: message => { toasts.push(message); } }));
  t.after(() => {
    host.unmount();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  host.render();
  // Initial restoration completes before user actions start.
  await Promise.resolve();
  assert.equal(host.render().session?.user.id, profile.id);
  return {
    ...host, storage, toasts,
    get disconnectCount() { return disconnectCount; },
    async waitForDisconnect() {
      for (let count = 0; count < 20 && !finishDisconnect; count++) await Promise.resolve();
      assert.equal(typeof finishDisconnect, 'function');
    },
    finishDisconnect() { finishDisconnect(); },
  };
}

test('auth hook receives the complete successful login event before the command completes', async t => {
  const s = await setup(t);
  const expectedProfile = { id: 'new-player', nickname: '新棋手', elo: 1780, avatarUrl: 'saved-avatar.png' };
  const profiles = JSON.parse(s.storage.get('cutego.taptap.profiles'));
  profiles['new-player'] = { ...expectedProfile, nickname: '原昵称' };
  s.storage.set('cutego.taptap.profiles', JSON.stringify(profiles));
  s.render().setShowLoginModal(true);
  let commandCompleted = false;
  const events = [];
  t.after(platform.auth.onSessionChange(state => {
    events.push({ state, commandCompleted });
  }));

  await s.render().handleTapTapLogin();
  commandCompleted = true;

  const expectedSession = {
    user: { id: 'new-player', email: null }, provider: 'taptap', accessToken: 'taptap-local-session',
  };
  assert.deepEqual(events, [{
    state: { session: expectedSession, profile: expectedProfile }, commandCompleted: false,
  }]);
  const result = s.render();
  assert.deepEqual(result.session, expectedSession);
  assert.deepEqual(result.userProfile, expectedProfile);
  assert.equal(result.showLoginModal, false);
  assert.equal(s.storage.get('cutego.taptap.activeProfileId'), 'new-player');
  assert.deepEqual(await platform.profile.getByUserId('new-player'), expectedProfile);
  assert.equal(s.toasts.at(-1), 'TapTap 登录成功');
});

test('failed hook login keeps the restored profile and open login dialog', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const s = await setup(t, false);
  const before = s.render();
  before.setShowLoginModal(true);
  const events = [];
  t.after(platform.auth.onSessionChange(state => { events.push(state); }));

  await s.render().handleTapTapLogin();

  const result = s.render();
  assert.deepEqual(result.session, before.session);
  assert.deepEqual(result.userProfile, before.userProfile);
  assert.equal(result.showLoginModal, true);
  assert.deepEqual(events, []);
  assert.equal(s.storage.get('cutego.taptap.activeProfileId'), 'old-player');
  assert.equal(s.toasts.at(-1), '当前环境不支持 TapTap 登录，请在 TapTap 小游戏内使用。');
  t.mock.timers.tick(8000);
  assert.equal(s.toasts.at(-1), null);
});

test('explicit profile refresh clears missing data even when the provider emits no auth event', async t => {
  const s = await setup(t);
  const session = s.render().session;
  const events = [];
  t.after(platform.auth.onSessionChange(state => { events.push(state); }));
  s.storage.delete('cutego.taptap.profiles');

  await s.render().fetchProfile('old-player');

  assert.equal(s.render().userProfile, null);
  assert.deepEqual(s.render().session, session);
  assert.deepEqual(events, []);
});

test('auth hook clears session/profile after a normal provider logout', async t => {
  const s = await setup(t);
  const logout = s.render().handleSignOut();
  await s.waitForDisconnect();
  s.finishDisconnect();
  await logout;
  assert.equal(s.render().session, null);
  assert.equal(s.render().userProfile, null);
  assert.equal(s.storage.has('cutego.taptap.activeProfileId'), false);
});

test('auth hook ignores duplicate logout clicks while disconnect is pending', async t => {
  const s = await setup(t);
  const logout = s.render().handleSignOut();
  await s.waitForDisconnect();
  await s.render().handleSignOut();
  assert.equal(s.disconnectCount, 1);
  s.finishDisconnect();
  await logout;
  assert.equal(s.render().session, null);
});

test('auth hook clears a restored local session when the native SDK is unavailable', async t => {
  const s = await setup(t, false);
  await s.render().handleSignOut();
  assert.equal(s.render().session, null);
  assert.equal(s.render().userProfile, null);
  assert.equal(s.storage.has('cutego.taptap.activeProfileId'), false);
});

test('auth hook keeps a newer login when an older logout completes later', async t => {
  const s = await setup(t);
  const logout = s.render().handleSignOut();
  await s.waitForDisconnect();
  await s.render().handleTapTapLogin();
  assert.equal(s.render().session?.user.id, 'new-player');
  s.finishDisconnect();
  await logout;
  assert.equal(s.render().session?.user.id, 'new-player');
  assert.equal(s.render().userProfile?.id, 'new-player');
  assert.equal(s.render().userProfile?.nickname, '新棋手');
  assert.equal(s.storage.get('cutego.taptap.activeProfileId'), 'new-player');
});
