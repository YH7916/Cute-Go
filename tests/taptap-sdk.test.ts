import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import {
  getAccountInfo, getTapUserInfo, tapAuthorizeUserInfo, tapGetPrivacySetting,
  tapGetSetting, tapLogin, tapRequirePrivacyAuthorize,
} from '../services/platform/taptap/auth';
import {
  openTapTapLeaderboard, submitTapTapElo, tapCreateUserInfoButton, tapOpenPrivacyContract,
  tapVibrateLong, tapVibrateShort, unlockTapTapAchievement,
} from '../services/platform/taptap/capabilities';
import {
  callTapAsync, getTap, isTapTapEnv, TAP_CALLBACK_TIMEOUT_MS,
} from '../services/platform/taptap/runtime';
import type {
  TapAchievementOptions, TapAuthorizeOptions, TapCallbacks, TapLeaderboardOpen,
  TapLeaderboardScores, TapLoginOptions, TapUserInfoButtonOptions, TapUserInfoOptions,
  TapVibrateOptions,
} from '../services/platform/taptap/sdk';

// Fakes exercise the SDK boundary, not a real TapTap client or network service.
function installTap(t: TestContext, tap: unknown) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const windowValue = { tap };
  Object.defineProperty(globalThis, 'window', { value: windowValue, configurable: true });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'window', original);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  return windowValue;
}

test('TapTap environment requires an SDK object and filters missing or malformed methods', async t => {
  const environment = installTap(t, undefined);
  for (const invalid of [undefined, null, 'tap', 1, [], () => {}]) {
    environment.tap = invalid;
    assert.equal(isTapTapEnv(), false);
    assert.equal(getTap(), null);
    assert.equal(await tapLogin(), null);
  }
  environment.tap = { login: true, getUserInfo: 'wrong' };
  assert.equal(isTapTapEnv(), true);
  assert.equal(getTap()?.login, undefined);
  assert.equal(await getTapUserInfo(), null);
  assert.equal(await tapRequirePrivacyAuthorize(), false);
  assert.equal(getAccountInfo(), null);
  assert.equal(tapVibrateShort(), false);
  assert.equal(tapVibrateLong(), false);
  assert.equal(await tapOpenPrivacyContract(), false);
  assert.equal(await tapCreateUserInfoButton({ type: 'text', style: { left: 0, top: 0, width: 1, height: 1 } }), null);
});

test('callback-only login waits for success even when SDK returns a task handle', async t => {
  const callbacks: TapCallbacks = {};
  installTap(t, { login(options: TapLoginOptions) { Object.assign(callbacks, options); return { cancel() {} }; } });
  let settled = false;
  const login = tapLogin().then(result => { settled = true; return result; });
  await Promise.resolve();
  assert.equal(settled, false);
  callbacks.success?.({ code: 'temporary-code' });
  assert.deepEqual(await login, { code: 'temporary-code' });
});

test('legacy Promise login remains supported and keeps the native SDK receiver', async t => {
  const sdk = { login: async function () { assert.equal(this, sdk); return { openid: 'stable-player' }; } };
  const environment = installTap(t, sdk);
  assert.deepEqual(await tapLogin(), { openid: 'stable-player' });
  environment.tap = { login: () => Promise.resolve('legacy-player') };
  assert.equal(await tapLogin(), 'legacy-player');
});

test('the async adapter settles once and consumes a returned Promise rejection after callback success', async () => {
  const result = await callTapAsync(callbacks => {
    callbacks.success?.({ code: 'first' });
    callbacks.fail?.({ errno: 6 });
    return Promise.reject(new Error('late promise failure'));
  });
  assert.deepEqual(result, { code: 'first' });
  await assert.rejects(callTapAsync(callbacks => {
    callbacks.fail?.(new Error('first failure'));
    return Promise.resolve({ code: 'late' });
  }), /first failure/);
});

test('SDK throws, malformed login results, and unavailable callbacks degrade safely', async t => {
  const environment = installTap(t, { login() { throw new Error('unavailable'); } });
  assert.equal(await tapLogin(), null);
  for (const result of [null, undefined, [], 7, true, '  ']) {
    environment.tap = { login: () => Promise.resolve(result) };
    assert.equal(await tapLogin(), null);
  }
  t.mock.timers.enable({ apis: ['setTimeout'] });
  environment.tap = { login: () => undefined };
  const pending = tapLogin();
  t.mock.timers.tick(TAP_CALLBACK_TIMEOUT_MS);
  assert.equal(await pending, null);
  await assert.rejects(callTapAsync(() => ({ get then() { throw new Error('bad thenable'); } })), /bad thenable/);
});

test('callback user info unwraps the official envelope and Promise wrappers keep legacy profiles', async t => {
  const profile = { nickName: '棋友', avatarUrl: 'avatar.png' };
  const environment = installTap(t, {
    getUserInfo(options: TapUserInfoOptions) { queueMicrotask(() => options.success?.({ userInfo: profile })); },
  });
  assert.deepEqual(await getTapUserInfo(), profile);
  environment.tap = { getUserInfo: () => Promise.resolve(profile) };
  assert.deepEqual(await getTapUserInfo(), profile);
  for (const malformed of [null, 3, [], { userInfo: null }, { userInfo: 'bad' }, { userInfo: [] }]) {
    environment.tap = { getUserInfo: () => Promise.resolve(malformed) };
    assert.equal(await getTapUserInfo(), null);
  }
});

test('unauthorized user info authorizes the exact scope and retries once', async t => {
  let requests = 0;
  let authorizations = 0;
  const environment = installTap(t, {
    getUserInfo(options: TapUserInfoOptions) {
      requests++;
      if (requests === 1) options.fail?.({ errno: 6 });
      else options.success?.({ userInfo: { nickName: 'Allowed' } });
    },
    authorize(options: TapAuthorizeOptions) {
      authorizations++;
      assert.equal(options.scope, 'scope.userInfo');
      options.success?.({});
    },
  });
  assert.deepEqual(await getTapUserInfo(), { nickName: 'Allowed' });
  assert.equal(requests, 2);
  assert.equal(authorizations, 1);
  requests = 0;
  authorizations = 0;
  environment.tap = {
    getUserInfo: () => { requests++; return Promise.reject({ errMsg: 'getUserInfo:fail unauthorized' }); },
    authorize: () => { authorizations++; return Promise.resolve(); },
  };
  assert.equal(await getTapUserInfo(), null);
  assert.equal(requests, 2);
  assert.equal(authorizations, 1);
});

test('privacy configuration failure keeps its explicit marker and does not request authorization', async t => {
  const privacyFailure = { errno: 1027, errMsg: 'API missing' };
  let authorizations = 0;
  installTap(t, {
    getUserInfo: () => Promise.reject(privacyFailure),
    authorize: () => { authorizations++; return Promise.resolve(); },
  });
  assert.deepEqual(await getTapUserInfo(), { _error: 'PRIVACY_MISSING', original: privacyFailure });
  assert.equal(authorizations, 0);
});

test('denied authorization and disabled retries stop without looping', async t => {
  let requests = 0;
  let authorizations = 0;
  installTap(t, {
    getUserInfo: () => { requests++; return Promise.reject({ errno: 6 }); },
    authorize: () => { authorizations++; return Promise.reject(new Error('denied')); },
  });
  assert.equal(await getTapUserInfo(), null);
  assert.equal(requests, 1);
  assert.equal(authorizations, 1);
  assert.equal(await getTapUserInfo(false), null);
  assert.equal(requests, 2);
  assert.equal(authorizations, 1);
});

test('permission, settings, and account wrappers support callback/Promise SDKs and validate objects', async t => {
  const environment = installTap(t, {
    requirePrivacyAuthorize: (options: TapCallbacks) => options.success?.({}),
    authorize: () => Promise.resolve(),
    getPrivacySetting: (options: TapCallbacks) => options.success?.({ needAuthorization: true }),
    getSetting: () => Promise.resolve({ authSetting: { 'scope.userInfo': true } }),
    getAccountInfoSync: () => ({ miniProgram: { appId: 'game' } }),
    openPrivacyContract: (options: TapCallbacks) => options.success?.({}),
  });
  assert.equal(await tapRequirePrivacyAuthorize(), true);
  assert.equal(await tapAuthorizeUserInfo(), true);
  assert.deepEqual(await tapGetPrivacySetting(), { needAuthorization: true });
  assert.deepEqual(await tapGetSetting(), { authSetting: { 'scope.userInfo': true } });
  assert.deepEqual(getAccountInfo(), { miniProgram: { appId: 'game' } });
  assert.equal(await tapOpenPrivacyContract(), true);
  environment.tap = {
    requirePrivacyAuthorize: () => Promise.reject(new Error('denied')),
    getPrivacySetting: () => Promise.resolve([]), getSetting: () => Promise.resolve('invalid'),
    getAccountInfoSync() { throw new Error('unavailable'); },
    openPrivacyContract: () => Promise.reject(new Error('denied')),
  };
  assert.equal(await tapRequirePrivacyAuthorize(), false);
  assert.equal(await tapAuthorizeUserInfo(), false);
  assert.equal(await tapGetPrivacySetting(), null);
  assert.equal(await tapGetSetting(), null);
  assert.equal(getAccountInfo(), null);
  assert.equal(await tapOpenPrivacyContract(), false);
});

test('privacy and authorization dialogs allow the player to decide without a request timeout', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const callbacks: TapCallbacks[] = [];
  installTap(t, {
    requirePrivacyAuthorize: (options: TapCallbacks) => { callbacks.push(options); },
    authorize: (options: TapAuthorizeOptions) => { callbacks.push(options); },
    openPrivacyContract: (options: TapCallbacks) => { callbacks.push(options); },
  });
  let finished = 0;
  const pending = [tapRequirePrivacyAuthorize(), tapAuthorizeUserInfo(), tapOpenPrivacyContract()]
    .map(request => request.then(value => { finished++; return value; }));
  t.mock.timers.tick(TAP_CALLBACK_TIMEOUT_MS * 4);
  await Promise.resolve();
  assert.equal(finished, 0);
  for (const callback of callbacks) callback.success?.({});
  assert.deepEqual(await Promise.all(pending), [true, true, true]);
});

test('leaderboard and achievement methods preserve native receiver and configured payloads', async t => {
  const scoreCalls: unknown[] = [];
  const achievementCalls: unknown[] = [];
  const openCalls: unknown[] = [];
  const leaderboard = {
    async submitScores(options: TapLeaderboardScores) { assert.equal(this, leaderboard); scoreCalls.push(options.scores); },
    openLeaderboard(options: TapLeaderboardOpen) { assert.equal(this, leaderboard); openCalls.push(options.leaderboardId); },
  };
  const achievements = {
    async reach(options: TapAchievementOptions) { assert.equal(this, achievements); achievementCalls.push(options.displayId); },
  };
  installTap(t, { getLeaderboardManager: () => leaderboard, createAchievementManager: () => achievements });
  await submitTapTapElo(1234);
  await submitTapTapElo(Number.NaN);
  await unlockTapTapAchievement('first-win');
  await unlockTapTapAchievement('');
  openTapTapLeaderboard();
  assert.deepEqual(scoreCalls, [[{ leaderboardId: 'bl6pglf32l46qbfwo5', score: 1234 }]]);
  assert.deepEqual(achievementCalls, ['first-win']);
  assert.deepEqual(openCalls, ['bl6pglf32l46qbfwo5']);
});

test('missing, malformed, and rejecting optional managers are safe local fallbacks', async t => {
  const environment = installTap(t, {});
  for (const manager of [undefined, null, [], { submitScores: 'invalid', reach: false }, {
    submitScores: () => Promise.reject(new Error('offline')),
    reach: () => Promise.reject(new Error('offline')),
    openLeaderboard: () => Promise.reject(new Error('offline')),
  }]) {
    environment.tap = { getLeaderboardManager: () => manager, createAchievementManager: () => manager };
    await submitTapTapElo(1200);
    await unlockTapTapAchievement('win');
    assert.doesNotThrow(openTapTapLeaderboard);
  }
});

test('user info buttons enforce scope and bind only validated callable controls', async t => {
  const creations: unknown[] = [];
  const events: unknown[] = [];
  let shows = 0;
  const nativeButton = {
    onTap(listener: (event: unknown) => void) { assert.equal(this, nativeButton); listener({ userInfo: { nickName: 'Player' } }); },
    show() { assert.equal(this, nativeButton); shows++; }, hide: false,
  };
  const environment = installTap(t, {
    createUserInfoButton(options: TapUserInfoButtonOptions) { creations.push(options); return nativeButton; },
  });
  const options: TapUserInfoButtonOptions = { type: 'text', text: 'Login', style: { left: 0, top: 0, width: 100, height: 40 } };
  const button = await tapCreateUserInfoButton(options);
  assert.ok(button);
  button.onTap(event => events.push(event));
  button.show?.();
  assert.equal(button.hide, undefined);
  assert.equal(shows, 1);
  assert.deepEqual(events, [{ userInfo: { nickName: 'Player' } }]);
  assert.deepEqual(creations, [{ ...options, withScope: true }]);
  for (const invalid of [null, [], {}, { onTap: 'invalid' }]) {
    environment.tap = { createUserInfoButton: () => invalid };
    assert.equal(await tapCreateUserInfoButton(options), null);
  }
});

test('vibration reports invocation availability and consumes callback or Promise failures', async t => {
  const strengths: string[] = [];
  let longCalls = 0;
  const environment = installTap(t, {
    vibrateShort(options: TapVibrateOptions) { strengths.push(options.type); options.fail?.({ errMsg: 'muted' }); },
    vibrateLong() { longCalls++; return Promise.reject(new Error('muted')); },
  });
  assert.equal(tapVibrateShort(), true);
  assert.equal(tapVibrateShort('heavy'), true);
  assert.equal(tapVibrateLong(), true);
  assert.deepEqual(strengths, ['medium', 'heavy']);
  assert.equal(longCalls, 1);
  environment.tap = { vibrateShort() { throw new Error('unavailable'); }, vibrateLong: false };
  assert.equal(tapVibrateShort(), false);
  assert.equal(tapVibrateLong(), false);
});

test('authentication and capability boundaries do not log SDK credentials or user payloads', async t => {
  const logs = ['log', 'warn', 'error', 'debug'] as const;
  const spies = logs.map(name => t.mock.method(console, name, () => {}));
  installTap(t, {
    login: () => Promise.resolve({ code: 'secret-code', token: 'secret-token' }),
    getUserInfo: () => Promise.resolve({ userInfo: { nickName: 'private-user', avatarUrl: 'private-avatar' } }),
    getAccountInfoSync: () => ({ openid: 'private-id' }),
    createAchievementManager: () => ({ reach: () => Promise.reject({ token: 'secret-token' }) }),
  });
  await tapLogin();
  await getTapUserInfo();
  getAccountInfo();
  await unlockTapTapAchievement('first');
  for (const spy of spies) assert.equal(spy.mock.callCount(), 0);
});
