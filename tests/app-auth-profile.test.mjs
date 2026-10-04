import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTestModule } from './helpers/loadTestModule.mjs';

// Use the real auth hook/provider with a fake SDK and storage. The hook host
// exercises callback ordering; it does not emulate React concurrent rendering.
const { useAppAuthProfile, renderHook } = await loadTestModule({
  reactHost: true,
  contents: `
      export { useAppAuthProfile } from './hooks/useAppAuthProfile';
      export { renderHook } from './tests/helpers/reactHooks';
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
