import { asTapRecord, getTap, getTapMethod } from './runtime';
import { readBattlePlayerId } from './battlePayloads';
import type {
  TapBattleJoinOptions, TapBattleManager, TapBattleMessageOptions,
  TapBattleRoomOptions, TapBattleSdkListeners,
} from './sdk';

export type BattleEvent = 'disconnected' | 'error' | 'entered' | 'left' | 'offline' | 'message';
export interface BattleConnection {
  manager: TapBattleManager;
  closed: boolean;
  playerId: string | null;
  pending: Promise<string> | null;
  listeners?: TapBattleSdkListeners;
  onEvent?: (event: BattleEvent, value: unknown) => void;
}

const adapters = new WeakMap<object, TapBattleManager>();
const disconnecting = new WeakMap<TapBattleManager, Promise<void>>();
const operations = new WeakMap<TapBattleManager, Promise<unknown>>();
let current: BattleConnection | null = null;

// The factory is an external boundary too. Cache by native object identity and
// bind every callable to its original receiver before exposing typed operations.
function getManager(): TapBattleManager | null {
  let raw: unknown;
  try { raw = getTap()?.getOnlineBattleManager?.(); } catch { return null; }
  const object = asTapRecord(raw);
  if (!object) return null;
  const cached = adapters.get(object);
  if (cached) return cached;
  const connect = getTapMethod<[]>(object, 'connect');
  const match = getTapMethod<[TapBattleRoomOptions]>(object, 'matchRoom');
  const create = getTapMethod<[TapBattleRoomOptions]>(object, 'createRoom');
  const join = getTapMethod<[TapBattleJoinOptions]>(object, 'joinRoom');
  const disconnect = getTapMethod<[]>(object, 'disconnect');
  const leave = getTapMethod<[]>(object, 'leaveRoom');
  const send = getTapMethod<[TapBattleMessageOptions]>(object, 'sendCustomMessage');
  const manager: TapBattleManager = {
    connect: connect && (() => Promise.resolve(connect())),
    matchRoom: match && (options => Promise.resolve(match(options))),
    createRoom: create && (options => Promise.resolve(create(options))),
    joinRoom: join && (options => Promise.resolve(join(options))),
    disconnect: disconnect && (() => Promise.resolve(disconnect())),
    leaveRoom: leave && (() => Promise.resolve(leave())),
    sendCustomMessage: send && (options => Promise.resolve(send(options))),
    registerListener: getTapMethod<[TapBattleSdkListeners]>(object, 'registerListener'),
    unregisterListener: getTapMethod<[TapBattleSdkListeners]>(object, 'unregisterListener'),
  };
  adapters.set(object, manager);
  return manager;
}

function closeConnection(connection: BattleConnection): void {
  connection.closed = true;
  connection.playerId = null;
  connection.onEvent = undefined;
  if (current === connection) current = null;
  if (connection.listeners) {
    try { connection.manager.unregisterListener?.(connection.listeners); }
    catch (error) { console.warn('[TapTapBattle] Listener cleanup failed:', error); }
    connection.listeners = undefined;
  }
}

export function getBattleConnection(): BattleConnection | null {
  const manager = getManager();
  if (current?.manager === manager && !current.closed) return current;
  if (current) closeConnection(current);
  if (!manager) return null;
  current = { manager, closed: false, playerId: null, pending: null };
  return current;
}

export function isCurrentConnection(connection: BattleConnection): boolean {
  return !connection.closed && getBattleConnection() === connection;
}

function registerEvents(connection: BattleConnection): void {
  if (connection.listeners || !connection.manager.registerListener) return;
  const forward = (event: BattleEvent) => (value: unknown) => {
    if (!isCurrentConnection(connection)) return;
    const handler = connection.onEvent;
    if (event === 'disconnected') closeConnection(connection);
    handler?.(event, value);
  };
  const entered = forward('entered'), left = forward('left');
  const offline = forward('offline'), message = forward('message');
  const listeners: TapBattleSdkListeners = {
    onDisconnected: forward('disconnected'), onBattleServiceError: forward('error'),
    onPlayerEntered: entered, playerEnterRoom: entered,
    onPlayerLeft: left, playerLeaveRoom: left,
    onPlayerOffline: offline, playerOffline: offline,
    onCustomMessageReceived: message, onCustomMessage: message,
  };
  connection.manager.registerListener(listeners);
  // Failed registration must remain retryable.
  connection.listeners = listeners;
}

export async function connectBattle(connection: BattleConnection): Promise<string> {
  if (!isCurrentConnection(connection)) throw new Error('TapTap connection was superseded');
  if (connection.playerId) return connection.playerId;
  if (connection.pending) return connection.pending;
  const connect = connection.manager.connect;
  if (!connect) throw new Error('TapTap OnlineBattleManager.connect is unavailable');
  const pending = (async () => {
    const closing = disconnecting.get(connection.manager);
    if (closing) await closing;
    if (!isCurrentConnection(connection)) throw new Error('TapTap connection was superseded');
    registerEvents(connection);
    if (!isCurrentConnection(connection)) throw new Error('TapTap connection was superseded');
    const result = await connect();
    if (!isCurrentConnection(connection)) throw new Error('TapTap connection was superseded');
    const id = readBattlePlayerId(result);
    if (!id) throw new Error('TapTap connect() returned no valid playerId');
    connection.playerId = id;
    return id;
  })();
  connection.pending = pending;
  try { return await pending; }
  finally { if (connection.pending === pending) connection.pending = null; }
}

export function enqueueBattleOperation<T>(connection: BattleConnection, run: () => Promise<T>): Promise<T> {
  const previous = operations.get(connection.manager) ?? Promise.resolve();
  const operation = previous.then(run, run);
  operations.set(connection.manager, operation.catch(() => {}));
  return operation;
}

export async function disconnectBattle(connection: BattleConnection): Promise<void> {
  closeConnection(connection);
  const existing = disconnecting.get(connection.manager);
  if (existing) return existing;
  // Publish the barrier before invoking the SDK. A reconnect on the same native
  // manager must wait until disconnect and its synchronous callbacks settle.
  const closing = enqueueBattleOperation(connection, async () => {
    // A pending native connect/room entry cannot be canceled by discarding its
    // Promise. Let it settle, then disconnect, before this manager is reused.
    await connection.pending?.catch(() => {});
    try { await connection.manager.disconnect?.(); }
    catch (error) { console.warn('[TapTapBattle] Disconnect failed:', error); }
  });
  disconnecting.set(connection.manager, closing);
  try { await closing; }
  finally {
    if (disconnecting.get(connection.manager) === closing) disconnecting.delete(connection.manager);
  }
}
