import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTestModule } from './helpers/loadTestModule.mjs';

const { useOnlineMatch, renderHook } = await loadTestModule({
  reactHost: true,
  contents: "export {useOnlineMatch} from './hooks/useOnlineMatch'; export {renderHook} from './tests/helpers/reactHooks';",
  plugins: [{ name: 'fake-platform', setup(builder) {
    builder.onResolve({ filter: /services\/platform$/ }, () => ({ path: 'platform', namespace: 'online-test' }));
    builder.onLoad({ filter: /.*/, namespace: 'online-test' }, () => ({ contents: 'export const platform = new Proxy({}, {get: (_, key) => globalThis.__onlinePlatform[key]});', loader: 'js' }));
  } }],
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = async () => { for (let step = 0; step < 15; step++) await Promise.resolve(); };
function room(id, { isHost = true, peers = [] } = {}) {
  const sent = [];
  const result = {
    roomId: id, playerId: 'self', isHost, peers, sent, leaves: 0,
    send: async message => { sent.push(message); return true; },
    leave: async () => { result.leaves++; },
  };
  return result;
}
function setup(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const requests = [], resets = [], moves = [], passes = [], toasts = [], alerts = [];
  const enqueue = kind => input => {
    const pending = deferred(); requests.push({ kind, ...input, ...pending }); return pending.promise;
  };
  const globals = {
    __onlinePlatform: { isNative: true, multiplayer: { usesNativeMatchmaking: true,
      startNativeMatch: enqueue('match'), createNativeRoom: enqueue('create'), joinNativeRoom: enqueue('join') } },
    window: { setTimeout: (...args) => setTimeout(...args), clearTimeout: value => clearTimeout(value),
      setInterval: (...args) => setInterval(...args) },
    alert: message => alerts.push(message),
  };
  const old = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const refs = { boardSizeRef: { current: 9 }, gameTypeRef: { current: 'Go' },
    currentPlayerRef: { current: 'black' }, myColorRef: { current: null } };
  const options = {
    ...refs,
    settings: { boardSize: 9, gameType: 'Go', setBoardSize() {}, setGameType() {}, setGameMode() {} },
    session: { user: { id: 'account' }, provider: 'taptap' }, userProfile: { id: 'account', nickname: 'test', elo: 1200 },
    resetGameRef: { current: (...args) => resets.push(args) },
    executeMoveRef: { current: (...args) => { moves.push(args); refs.currentPlayerRef.current = 'white'; } },
    handlePassRef: { current: (...args) => { passes.push(args); refs.currentPlayerRef.current = 'white'; } },
    setShowLoginModal() {}, setShowMenu() {}, setShowStartScreen() {},
    setToastMsg: message => toasts.push(message), vibrate() {},
  };
  const host = renderHook(() => useOnlineMatch(options));
  let api = host.render();
  t.after(async () => {
    host.unmount(); await flush();
    for (const [key, value] of old) { if (value) Object.defineProperty(globalThis, key, value); else delete globalThis[key]; }
  });
  return { requests, resets, moves, passes, toasts, alerts, refs, options,
    get api() { return api; }, render: () => (api = host.render()), unmount: () => host.unmount() };
}

test('online timeout leaves a late SDK session instead of abandoning it', async t => {
  const s = setup(t);
  const pending = s.api.startMatchmaking();
  await flush();
  t.mock.timers.tick(15000);
  await pending;
  const late = room('late');
  s.requests[0].resolve(late);
  await flush();
  assert.equal(late.leaves, 1);
  assert.equal(s.render().onlineStatus, 'disconnected');
});

test('online cancellation applies to create and join requests', async t => {
  const s = setup(t);
  for (const operation of [() => s.api.createRoom(), () => s.api.joinRoom('invite')]) {
    const pending = operation();
    await flush();
    const request = s.requests.at(-1);
    await s.api.cancelMatchmaking();
    const late = room('cancelled');
    request.resolve(late);
    await pending;
    await flush();
    assert.equal(late.leaves, 1);
    assert.equal(s.render().roomId, null);
    assert.equal(s.api.onlineStatus, 'disconnected');
  }
});

test('callbacks from the old room cannot reset or disconnect the new room', async t => {
  const s = setup(t);
  const first = s.api.createRoom(); await flush();
  s.requests[0].resolve(room('old')); await first;
  await s.api.cleanupOnline(true);
  const second = s.api.joinRoom('new'); await flush();
  s.requests[1].resolve(room('new', { isHost: false })); await second;
  s.requests[0].handlers.onMessage({ type: 'RESTART' });
  s.requests[0].handlers.onDisconnect();
  assert.equal(s.resets.length, 0);
  assert.equal(s.render().onlineStatus, 'connected');
  assert.deepEqual(s.alerts, []);
});

test('duplicate host peer notifications start a game only once', async t => {
  const s = setup(t);
  const pending = s.api.createRoom(); await flush();
  const current = room('host'); s.requests[0].resolve(current); await pending;
  s.requests[0].handlers.onPeerJoin({ id: 'peer' });
  s.requests[0].handlers.onPeerJoin({ id: 'peer' });
  await flush();
  assert.equal(s.resets.length, 1);
  assert.equal(current.sent.filter(message => message.type === 'SYNC').length, 1);
});

test('late create cannot replace a newer joined room or deliver its events', async t => {
  const s = setup(t);
  const first = s.api.createRoom(); await flush();
  const second = s.api.joinRoom('new'); await flush();
  const current = room('new', { isHost: false });
  s.requests[1].resolve(current); await second;
  const obsolete = room('old');
  s.requests[0].resolve(obsolete); await first; await flush();
  s.requests[0].handlers.onError(new Error('late'));
  assert.equal(obsolete.leaves, 1);
  assert.equal(current.leaves, 0);
  assert.equal(s.render().roomId, 'new');
  assert.deepEqual(s.toasts, []);
});

test('cancelling while a previous leave is pending never starts the queued SDK request', async t => {
  const s = setup(t);
  const first = s.api.createRoom(); await flush();
  const current = room('old'), leaving = deferred();
  current.leave = () => leaving.promise;
  s.requests[0].resolve(current); await first;
  const second = s.api.createRoom(); await flush();
  const cancellation = s.api.cancelMatchmaking();
  leaving.resolve(); await Promise.all([second, cancellation]); await flush();
  assert.equal(s.requests.length, 1);
  assert.equal(s.render().onlineStatus, 'disconnected');
});

test('unmount invalidates pending callbacks and leaves a room returned afterwards', async t => {
  const s = setup(t);
  const pending = s.api.startMatchmaking(); await flush();
  s.unmount();
  const late = room('unmounted'); s.requests[0].resolve(late);
  await pending; await flush();
  s.requests[0].handlers.onDisconnect();
  s.requests[0].handlers.onMessage({ type: 'RESTART' });
  assert.equal(late.leaves, 1);
  assert.deepEqual(s.resets, []);
  assert.deepEqual(s.alerts, []);
});

test('guest buffers pre-session SYNC and repeated legacy SYNC cannot reset the board again', async t => {
  const s = setup(t);
  const pending = s.api.joinRoom('guest'); await flush();
  const sync = { type: 'SYNC', boardSize: 13, gameType: 'Go', startColor: 'black', opponentInfo: { id: 'host' } };
  s.requests[0].handlers.onMessage(sync);
  assert.equal(s.resets.length, 0);
  const current = room('guest', { isHost: false }); s.requests[0].resolve(current);
  await pending; await flush();
  s.requests[0].handlers.onMessage(sync); await flush();
  assert.deepEqual(s.resets, [[true, 13, false]]);
  assert.equal(s.refs.boardSizeRef.current, 13);
  assert.equal(s.refs.myColorRef.current, 'black');
  assert.equal(s.render().onlineStatus, 'connected');
  assert.equal(current.sent.filter(message => message.type === 'SYNC_REPLY').length, 2);
});

test('message identities reject replays across turns, repeated restart and outgoing echoes', async t => {
  const s = setup(t);
  const pending = s.api.createRoom(); await flush();
  const current = room('host', { peers: [{ id: 'peer' }] });
  s.requests[0].resolve(current); await pending;
  const handler = s.requests[0].handlers.onMessage;
  const move = { type: 'MOVE', x: 3, y: 4, __cuteGoMessageId: 'peer:1' };
  handler(move);
  s.refs.currentPlayerRef.current = 'black';
  handler(move);
  assert.deepEqual(s.moves, [[3, 4, true]]);
  handler({ type: 'PASS', __cuteGoMessageId: 'peer:2' });
  s.refs.currentPlayerRef.current = 'black';
  handler({ type: 'PASS', __cuteGoMessageId: 'peer:2' });
  assert.deepEqual(s.passes, [[true]]);
  const beforeRestart = s.resets.length;
  handler({ type: 'RESTART', __cuteGoMessageId: 'peer:3' });
  handler({ type: 'RESTART', __cuteGoMessageId: 'peer:3' });
  assert.equal(s.resets.length, beforeRestart + 1);
  await s.api.sendData({ type: 'RESTART' });
  handler(current.sent.at(-1));
  assert.equal(s.resets.length, beforeRestart + 1);
});

test('a stale host SYNC failure cannot disconnect or show errors in the replacement room', async t => {
  const s = setup(t);
  const sending = deferred();
  const old = room('host'); old.send = () => sending.promise;
  const first = s.api.createRoom(); await flush(); s.requests[0].resolve(old); await first;
  s.requests[0].handlers.onPeerJoin({ id: 'peer' }); await flush();
  const second = s.api.joinRoom('replacement'); await flush();
  const current = room('replacement', { isHost: false }); s.requests[1].resolve(current); await second;
  sending.resolve(false); await flush();
  assert.equal(s.render().roomId, 'replacement');
  assert.equal(s.api.onlineStatus, 'connected');
  assert.equal(current.leaves, 0);
  assert.deepEqual(s.toasts, []);
});

test('matching has one timer, changing size supersedes the old request and cleanup stops it', async t => {
  const s = setup(t);
  const first = s.api.startMatchmaking(9);
  await s.api.startMatchmaking(9); await flush();
  assert.equal(s.requests.length, 1);
  t.mock.timers.tick(2000);
  assert.equal(s.render().matchTime, 2);
  const second = s.api.startMatchmaking(13); await flush();
  assert.equal(s.requests.length, 2);
  assert.equal(s.requests[1].roomType, 'go_13');
  assert.equal(s.requests[1].playerProfile.boardSize, 13);
  t.mock.timers.tick(1000);
  assert.equal(s.render().matchTime, 1);
  await s.api.cancelMatchmaking(); await Promise.all([first, second]);
  t.mock.timers.tick(5000);
  assert.equal(s.render().matchTime, 0);
  assert.equal(s.api.isMatching, false);
});

test('disconnect and account changes release ownership once and suppress further callbacks', async t => {
  const s = setup(t);
  const first = s.api.joinRoom('first'); await flush();
  const current = room('first', { isHost: false }); s.requests[0].resolve(current); await first;
  s.requests[0].handlers.onDisconnect(); s.requests[0].handlers.onDisconnect(); await flush();
  assert.equal(current.leaves, 1);
  assert.deepEqual(s.alerts, ['联机已断开']);
  assert.equal(s.render().onlineStatus, 'disconnected');
  const second = s.api.createRoom(); await flush();
  s.options.session = null; s.render();
  const late = room('signed-out'); s.requests[1].resolve(late); await second; await flush();
  assert.equal(late.leaves, 1);
  assert.equal(s.render().roomId, null);
});

test('SDK rejection and leave rejection never poison a later request', async t => {
  const s = setup(t);
  const failed = s.api.createRoom(); await flush();
  s.requests[0].reject({ errno: 42, errMsg: 'denied' }); await failed;
  assert.match(s.toasts.at(-1), /denied（错误码 42）/);
  const second = s.api.createRoom(); await flush();
  const current = room('rejecting-leave');
  current.leave = async () => { throw new Error('network'); };
  s.requests[1].resolve(current); await second;
  await s.api.cleanupOnline(true);
  const third = s.api.joinRoom('third'); await flush();
  s.requests[2].resolve(room('third', { isHost: false })); await third;
  assert.equal(s.render().roomId, 'third');
});

test('peer offline keeps the room and rejoining sends a fresh SYNC exactly once', async t => {
  const s = setup(t);
  const pending = s.api.createRoom(); await flush();
  const current = room('retained', { peers: [{ id: 'peer' }] });
  s.requests[0].resolve(current); await pending;
  const handlers = s.requests[0].handlers;
  handlers.onPeerOffline({ id: 'peer' }); handlers.onPeerOffline({ id: 'peer' });
  handlers.onMessage({ type: 'MOVE', x: 1, y: 1 });
  assert.equal(current.leaves, 0);
  assert.equal(s.render().roomId, 'retained');
  assert.equal(s.api.onlineStatus, 'disconnected');
  assert.equal(s.moves.length, 0);
  assert.deepEqual(s.alerts, ['对方已离线']);
  handlers.onPeerJoin({ id: 'peer' }); handlers.onPeerJoin({ id: 'peer' }); await flush();
  assert.equal(current.sent.filter(message => message.type === 'SYNC').length, 2);
  assert.equal(s.resets.length, 2);
  assert.equal(s.render().onlineStatus, 'connected');
  assert.equal(current.leaves, 0);
});

test('guest accepts a fresh handshake after peer re-entry, then ignores its duplicate', async t => {
  const s = setup(t);
  const pending = s.api.joinRoom('retained'); await flush();
  const current = room('retained', { isHost: false }); s.requests[0].resolve(current); await pending;
  const handlers = s.requests[0].handlers;
  const sync = { type: 'SYNC', boardSize: 9, gameType: 'Go', startColor: 'black' };
  handlers.onMessage(sync);
  handlers.onPeerLeave({ id: 'host' });
  handlers.onPeerJoin({ id: 'host' });
  handlers.onMessage(sync); handlers.onMessage(sync); await flush();
  assert.equal(s.resets.length, 2);
  assert.equal(current.leaves, 0);
  assert.equal(s.render().onlineStatus, 'connected');
});

test('a new request waits for cleanup even when cleanup was started by a separate public call', async t => {
  const s = setup(t);
  const first = s.api.createRoom(); await flush();
  const leaving = deferred(), current = room('old'); current.leave = () => leaving.promise;
  s.requests[0].resolve(current); await first;
  const cleaning = s.api.cleanupOnline(true);
  const second = s.api.joinRoom('new'); await flush();
  assert.equal(s.requests.length, 1);
  leaving.resolve(); await cleaning; await flush();
  assert.equal(s.requests.length, 2);
  s.requests[1].resolve(room('new', { isHost: false })); await second;
  assert.equal(s.render().roomId, 'new');
});

test('the previous handshake cannot fail a successful reconnection in the same room', async t => {
  const s = setup(t);
  const pending = s.api.createRoom(); await flush();
  const current = room('retained'), firstSend = deferred();
  let sends = 0;
  current.send = () => ++sends === 1 ? firstSend.promise : Promise.resolve(true);
  s.requests[0].resolve(current); await pending;
  const handlers = s.requests[0].handlers;
  handlers.onPeerJoin({ id: 'peer' }); await flush();
  handlers.onPeerOffline({ id: 'peer' });
  handlers.onPeerJoin({ id: 'peer' }); await flush();
  firstSend.resolve(false); await flush();
  assert.equal(s.render().onlineStatus, 'connected');
  assert.equal(current.leaves, 0);
  assert.equal(s.resets.length, 2);
  assert.deepEqual(s.toasts, []);
});
