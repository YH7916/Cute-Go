import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  createTapTapNativeRoom, disconnectTap, getTapPlayerId, getTapTapRoomMessagePayload,
  getTapTapRoomPlayerInfo, joinTapTapNativeRoom, leaveTapTapRoom, sendTapTapRoomMessage,
  startTapTapNativeMatch,
} from '../services/platform/taptap/battle';
import type {
  TapBattleManager, TapBattleMessageOptions, TapBattleRoomOptions, TapBattleSdkListeners,
} from '../services/platform/taptap/sdk';
import { readBattlePlayerId, readBattleRoomInfo } from '../services/platform/taptap/battlePayloads';

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
function installManager(manager: unknown) {
  Object.defineProperty(globalThis, 'window', {
    configurable: true, value: { tap: { getOnlineBattleManager: () => manager } },
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const room = (id = 'room') => ({ roomInfo: { id, ownerId: 'self', players: [{ id: 'self' }, { id: 'peer' }] } });
function fakeManager() {
  const listeners: TapBattleSdkListeners[] = [];
  const removed: TapBattleSdkListeners[] = [];
  const sent: TapBattleMessageOptions[] = [];
  const calls = { connect: 0, leave: 0, disconnect: 0 };
  const manager: TapBattleManager = {
    async connect() { assert.equal(this, manager); calls.connect++; return { playerId: 'self' }; },
    async matchRoom() { assert.equal(this, manager); return room(); },
    async createRoom() { assert.equal(this, manager); return room(); },
    async joinRoom() { assert.equal(this, manager); return room(); },
    registerListener(value) { assert.equal(this, manager); listeners.push(value); },
    unregisterListener(value) { assert.equal(this, manager); removed.push(value); },
    async sendCustomMessage(value) { assert.equal(this, manager); sent.push(value); },
    async leaveRoom() { assert.equal(this, manager); calls.leave++; },
    async disconnect() { assert.equal(this, manager); calls.disconnect++; },
  };
  return { manager, listeners, removed, sent, calls };
}
afterEach(async () => {
  await disconnectTap();
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
});

test('battle rejects malformed player identities', () => {
  assert.equal(getTapTapRoomPlayerInfo({ playerInfo: { id: 42 } }), null);
});

test('battle rejects non-array room players', async () => {
  installManager({
    connect: async () => ({ playerId: 'self' }),
    matchRoom: async () => ({ roomInfo: { id: 'room', players: { bad: true } } }),
  });
  assert.equal(await startTapTapNativeMatch('Go', {}), null);
});

test('late connect cannot restore a disconnected connection', async () => {
  const first = deferred<unknown>();
  let connects = 0;
  installManager({
    connect: () => ++connects === 1 ? first.promise : Promise.resolve({ playerId: 'new' }),
    disconnect: async () => {},
  });
  const old = getTapPlayerId();
  await Promise.resolve();
  const disconnecting = disconnectTap();
  first.resolve({ playerId: 'old' });
  await disconnecting;
  assert.equal(await old, null);
  assert.equal(await getTapPlayerId(), 'new');
  assert.equal(connects, 2);
});

test('player and room aliases normalize valid SDK variants without trusting fields', () => {
  for (const value of [{ playerId: 'p' }, { id: 'p' }, { playerInfo: { id: 'p' } }]) {
    assert.equal(readBattlePlayerId(value), 'p');
  }
  for (const value of [null, [], 1, {}, { playerId: {} }, { id: ' ' }]) {
    assert.equal(readBattlePlayerId(value), null);
  }
  const player = { id: 'p', customProperties: '{"elo":1200}' };
  for (const value of [
    { playerInfo: player }, { data: { playerInfo: player } }, { player }, { data: { player } },
    { playerId: 'p', customProperties: player.customProperties },
    { id: 'p', customProperties: player.customProperties },
    { userId: 'p', customProperties: player.customProperties },
    { fromPlayerId: 'p', customProperties: player.customProperties },
  ]) assert.deepEqual(getTapTapRoomPlayerInfo(value), player);
  for (const value of [null, [], { playerInfo: {} }, { playerId: ' ' }, { id: 'p', customProperties: {} }]) {
    assert.equal(getTapTapRoomPlayerInfo(value), null);
  }
  const variants = [
    { id: 'r', ownerId: 'p', players: [player] }, { roomId: 'r', ownerID: 'p', playerList: [player] },
    { roomID: 'r', masterId: 'p', players: [player] }, { id: 'r', masterID: 'p', players: [player] },
  ];
  for (const variant of variants) {
    for (const value of [{ roomInfo: variant }, { data: { roomInfo: variant } }, { room: variant }, { data: variant }]) {
      assert.deepEqual(readBattleRoomInfo(value), { id: 'r', ownerId: 'p', players: [player] });
    }
  }
  assert.deepEqual(readBattleRoomInfo({ roomInfo: { id: 'r' } }), { id: 'r', players: [] });
  for (const value of [{ id: 42 }, { id: 'r', ownerId: {} }, { id: 'r', players: {} }, { id: 'r', players: [{ id: 1 }] }]) {
    assert.equal(readBattleRoomInfo({ roomInfo: value }), null);
  }
});

test('message extraction accepts documented objects and existing string aliases', () => {
  for (const key of ['msg', 'message', 'content']) {
    assert.equal(getTapTapRoomMessagePayload({ [key]: 'message' }), 'message');
    assert.equal(getTapTapRoomMessagePayload({ data: { [key]: 'message' } }), 'message');
  }
  const message = { type: 'MOVE', x: 1, y: 2 };
  assert.equal(getTapTapRoomMessagePayload({ message }), message);
  assert.equal(getTapTapRoomMessagePayload(null), undefined);
});

test('concurrent player requests share one connection and preserve native receiver', async () => {
  const sdk = fakeManager();
  installManager(sdk.manager);
  assert.deepEqual(await Promise.all([getTapPlayerId(), getTapPlayerId()]), ['self', 'self']);
  assert.equal(sdk.calls.connect, 1);
  assert.equal(sdk.listeners.length, 1);
});

test('new manager wins over late old connect and old disconnect callbacks', async () => {
  const oldSdk = fakeManager(), newSdk = fakeManager();
  const oldConnect = deferred<unknown>();
  oldSdk.manager.connect = () => oldConnect.promise;
  installManager(oldSdk.manager);
  const old = getTapPlayerId();
  installManager(newSdk.manager);
  assert.equal(await getTapPlayerId(), 'self');
  oldConnect.resolve({ playerId: 'obsolete' });
  assert.equal(await old, null);
  oldSdk.listeners[0].onDisconnected?.({ reason: 'late' });
  assert.equal(await getTapPlayerId(), 'self');
  assert.equal(newSdk.calls.connect, 1);
});

test('reconnect waits for prior disconnect and ignores callbacks captured by the old connection', async () => {
  const sdk = fakeManager();
  const closing = deferred<void>();
  sdk.manager.disconnect = () => closing.promise;
  installManager(sdk.manager);
  await getTapPlayerId();
  const oldListeners = sdk.listeners[0];
  const disconnecting = disconnectTap();
  const reconnecting = getTapPlayerId();
  await Promise.resolve();
  assert.equal(sdk.calls.connect, 1);
  closing.resolve();
  await disconnecting;
  assert.equal(await reconnecting, 'self');
  oldListeners.onDisconnected?.({ reason: 'late' });
  assert.equal(await getTapPlayerId(), 'self');
  assert.equal(sdk.calls.connect, 2);
  assert.equal(sdk.removed[0], oldListeners);
});

test('failed listener registration is retried rather than cached as successful', async () => {
  const sdk = fakeManager();
  let registrations = 0;
  sdk.manager.registerListener = () => { if (++registrations === 1) throw new Error('temporary SDK failure'); };
  installManager(sdk.manager);
  assert.equal(await getTapPlayerId(), null);
  assert.equal(await getTapPlayerId(), 'self');
  assert.equal(registrations, 2);
});

test('create, join and match preserve SDK options and expose validated host/peers', async () => {
  const sdk = fakeManager();
  const roomCalls: TapBattleRoomOptions[] = [];
  sdk.manager.createRoom = async value => { roomCalls.push(value); return room('created'); };
  sdk.manager.matchRoom = async value => { roomCalls.push(value); return room('matched'); };
  sdk.manager.joinRoom = async value => {
    assert.deepEqual(value, { data: { roomId: 'invite', playerCfg: { customProperties: '{"elo":1200}' } } });
    return { roomInfo: { id: 'invite', ownerId: 'peer', players: [{ id: 'peer' }] } };
  };
  installManager(sdk.manager);
  const created = await createTapTapNativeRoom('Go-9', { elo: 1200 });
  assert.equal(created?.isHost, true);
  assert.deepEqual(created?.roomInfo.players, [{ id: 'self' }, { id: 'peer' }]);
  assert.equal((await startTapTapNativeMatch('Go-9', { elo: 1200 }))?.roomInfo.id, 'matched');
  assert.equal((await joinTapTapNativeRoom('invite', { elo: 1200 }))?.isHost, false);
  const expected = { maxPlayerCount: 2, type: 'Go-9', matchParams: { level: 'Go-9', score: '0' } };
  assert.deepEqual(roomCalls, [
    { data: { roomCfg: { ...expected, name: 'Cute-Go Go-9' }, playerCfg: { customProperties: '{"elo":1200}' } } },
    { data: { roomCfg: expected, playerCfg: { customProperties: '{"elo":1200}' } } },
  ]);
  assert.equal(sdk.calls.connect, 1);
  assert.equal(sdk.listeners.length, 1);
});

test('stale session send and leave cannot operate a newer room on the same manager', async () => {
  const sdk = fakeManager();
  installManager(sdk.manager);
  const old = await createTapTapNativeRoom('Go', {});
  const current = await joinTapTapNativeRoom('next', {});
  assert.ok(old && current);
  const leavesBeforeStaleCall = sdk.calls.leave;
  assert.equal(await old.send({ type: 'OLD' }), false);
  await old.leave();
  assert.equal(sdk.sent.length, 0);
  assert.equal(sdk.calls.leave, leavesBeforeStaleCall);
  assert.equal(await current.send({ type: 'MOVE' }), true);
  assert.deepEqual(sdk.sent, [{ data: { msg: '{"type":"MOVE"}', type: 0 } }]);
  await current.leave();
  assert.equal(sdk.calls.leave, leavesBeforeStaleCall + 1);
  assert.equal(await sendTapTapRoomMessage({}), false);
});

test('old room result is discarded and subsequent room entry waits for it to settle', async () => {
  const sdk = fakeManager();
  const firstRoom = deferred<unknown>(), firstStarted = deferred<void>();
  const events: string[] = [];
  sdk.manager.matchRoom = () => { events.push('match'); firstStarted.resolve(); return firstRoom.promise; };
  sdk.manager.joinRoom = async () => { events.push('join'); return room('second'); };
  sdk.manager.leaveRoom = async () => { events.push('leave'); };
  installManager(sdk.manager);
  const first = startTapTapNativeMatch('Go', {});
  await firstStarted.promise;
  const second = joinTapTapNativeRoom('second', {});
  await Promise.resolve();
  assert.deepEqual(events, ['match']);
  firstRoom.resolve(room('first'));
  assert.equal(await first, null);
  assert.equal((await second)?.roomInfo.id, 'second');
  assert.deepEqual(events, ['match', 'leave', 'join']);
});

test('disconnect and reconnect cannot overtake old native room entry on the same manager', async () => {
  const sdk = fakeManager();
  const firstRoom = deferred<unknown>(), started = deferred<void>();
  const events: string[] = [];
  sdk.manager.connect = async () => { events.push('connect'); return { id: 'self' }; };
  sdk.manager.matchRoom = () => { events.push('match'); started.resolve(); return firstRoom.promise; };
  sdk.manager.leaveRoom = async () => { events.push('leave'); };
  sdk.manager.disconnect = async () => { events.push('disconnect'); };
  sdk.manager.joinRoom = async () => { events.push('join'); return room('new'); };
  installManager(sdk.manager);
  const oldRoom = startTapTapNativeMatch('Go', {});
  await started.promise;
  const disconnecting = disconnectTap();
  const newRoom = joinTapTapNativeRoom('new', {});
  await Promise.resolve();
  assert.deepEqual(events, ['connect', 'match']);
  firstRoom.resolve(room('old'));
  assert.equal(await oldRoom, null);
  await disconnecting;
  assert.equal((await newRoom)?.roomInfo.id, 'new');
  assert.deepEqual(events, ['connect', 'match', 'leave', 'disconnect', 'connect', 'join']);
});

test('new room cannot overtake an in-flight leave operation', async () => {
  const sdk = fakeManager();
  const leaving = deferred<void>(), started = deferred<void>();
  let joins = 0;
  sdk.manager.leaveRoom = () => { started.resolve(); return leaving.promise; };
  sdk.manager.joinRoom = async () => { joins++; return room('new'); };
  installManager(sdk.manager);
  const current = await createTapTapNativeRoom('Go', {});
  assert.ok(current);
  const oldLeave = current.leave();
  await started.promise;
  const newRoom = joinTapTapNativeRoom('new', {});
  await Promise.resolve();
  assert.equal(joins, 0);
  leaving.resolve();
  await oldLeave;
  assert.equal((await newRoom)?.roomInfo.id, 'new');
});

test('a queued leave still cleans its claimed room when the next room is requested immediately', async () => {
  const sdk = fakeManager();
  const events: string[] = [];
  sdk.manager.leaveRoom = async () => { events.push('leave'); };
  sdk.manager.joinRoom = async () => { events.push('join'); return room('new'); };
  installManager(sdk.manager);
  const current = await createTapTapNativeRoom('Go', {});
  assert.ok(current);
  const leaving = current.leave();
  const joining = joinTapTapNativeRoom('new', {});
  await Promise.all([leaving, joining]);
  assert.deepEqual(events, ['leave', 'join']);
});

test('both listener naming conventions work; mismatched rooms and events after leave are ignored', async () => {
  const sdk = fakeManager();
  const events: unknown[] = [];
  installManager(sdk.manager);
  await startTapTapNativeMatch('Go', {}, {
    playerEnterRoom: value => events.push(value), playerLeaveRoom: value => events.push(value),
    playerOffline: value => events.push(value), onCustomMessage: value => events.push(value),
  });
  const callbacks = sdk.listeners[0];
  for (const callback of [callbacks.onPlayerEntered, callbacks.playerEnterRoom, callbacks.onPlayerLeft,
    callbacks.playerLeaveRoom, callbacks.onPlayerOffline, callbacks.playerOffline,
    callbacks.onCustomMessageReceived, callbacks.onCustomMessage]) callback?.({ roomId: 'room' });
  assert.equal(events.length, 8);
  callbacks.onCustomMessageReceived?.({ roomId: 'other' });
  assert.equal(events.length, 8);
  await leaveTapTapRoom();
  callbacks.playerEnterRoom?.({ roomId: 'room' });
  callbacks.onCustomMessageReceived?.({});
  assert.equal(events.length, 8);
});

test('disconnection invalidates room operations and reconnects on the next request', async () => {
  const sdk = fakeManager();
  let disconnects = 0;
  installManager(sdk.manager);
  const current = await startTapTapNativeMatch('Go', {}, { onDisconnected: () => { disconnects++; } });
  assert.ok(current);
  sdk.listeners[0].onDisconnected?.({ reason: 'network' });
  assert.equal(disconnects, 1);
  assert.equal(await current.send({}), false);
  await current.leave();
  assert.equal(sdk.calls.leave, 0);
  assert.equal(await getTapPlayerId(), 'self');
  assert.equal(sdk.calls.connect, 2);
});

test('malformed factories, connect output and unserializable messages are rejected', async () => {
  for (const manager of [null, [], 2, { connect: true }, { connect: async () => ({ playerId: {} }) }]) {
    installManager(manager);
    assert.equal(await getTapPlayerId(), null);
  }
  const sdk = fakeManager();
  installManager(sdk.manager);
  const current = await createTapTapNativeRoom('Go', {});
  assert.ok(current);
  const circular = { self: {} };
  circular.self = circular;
  assert.equal(await current.send(circular), false);
  assert.equal(await current.send(undefined), false);
  assert.equal(sdk.sent.length, 0);
});
