import {
  connectBattle, disconnectBattle, enqueueBattleOperation, getBattleConnection, isCurrentConnection,
} from './battleConnection';
import type { BattleConnection, BattleEvent } from './battleConnection';
import { eventMatchesRoom, readBattleRoomInfo } from './battlePayloads';
import type { TapBattleRoomInfo } from './battlePayloads';
import type { TapBattleRoomConfig } from './sdk';

export { getTapTapRoomPlayerInfo, getTapTapRoomMessagePayload } from './battlePayloads';
export type { TapBattleRoomPlayer, TapBattleRoomInfo } from './battlePayloads';

export interface TapBattleMatchResult {
  playerId: string;
  roomInfo: TapBattleRoomInfo;
  isHost: boolean;
  send(payload: unknown): Promise<boolean>;
  leave(): Promise<void>;
}

export interface TapBattleListeners {
  onDisconnected?: (info: unknown) => void;
  onBattleServiceError?: (info: unknown) => void;
  playerEnterRoom?: (info: unknown) => void;
  playerLeaveRoom?: (info: unknown) => void;
  playerOffline?: (info: unknown) => void;
  onCustomMessage?: (info: unknown) => void;
}

interface RoomSession {
  connection: BattleConnection;
  roomId: string | null;
  phase: 'waiting' | 'entering' | 'joined';
  entered: boolean;
  listeners: TapBattleListeners;
}
let activeRoom: RoomSession | null = null;

const callbacks: Record<BattleEvent, keyof TapBattleListeners> = {
  disconnected: 'onDisconnected', error: 'onBattleServiceError', entered: 'playerEnterRoom',
  left: 'playerLeaveRoom', offline: 'playerOffline', message: 'onCustomMessage',
};

function isActive(session: RoomSession): boolean {
  return activeRoom === session && isCurrentConnection(session.connection);
}

function beginSession(connection: BattleConnection, listeners: TapBattleListeners): RoomSession {
  const session: RoomSession = { connection, roomId: null, phase: 'waiting', entered: false, listeners };
  activeRoom = session;
  connection.onEvent = (event, value) => {
    if (activeRoom !== session) return;
    if (event === 'disconnected') activeRoom = null;
    else if (session.phase === 'waiting' || !eventMatchesRoom(value, session.roomId)) return;
    session.listeners[callbacks[event]]?.(value);
  };
  return session;
}

export async function getTapPlayerId(): Promise<string | null> {
  try {
    const connection = getBattleConnection();
    return connection ? await connectBattle(connection) : null;
  } catch (error) {
    console.warn('[TapTapBattle] Unable to get playerId:', error);
    return null;
  }
}

export async function disconnectTap(): Promise<void> {
  const connection = getBattleConnection();
  activeRoom = null;
  if (connection) await disconnectBattle(connection);
}

function buildRoomConfig(roomType: string, named: boolean): TapBattleRoomConfig {
  return {
    maxPlayerCount: 2, type: roomType, matchParams: { level: roomType, score: '0' },
    ...(named ? { name: `Cute-Go ${roomType}` } : {}),
  };
}

async function enterRoom(
  kind: 'match' | 'create' | 'join', value: string,
  playerProperties: Record<string, unknown>, listeners: TapBattleListeners,
): Promise<TapBattleMatchResult | null> {
  const connection = getBattleConnection();
  const manager = connection?.manager;
  if (!connection || !manager?.connect || !(kind === 'join' ? manager.joinRoom :
      kind === 'create' ? manager.createRoom : manager.matchRoom)) return null;
  const previous = activeRoom;
  const session = beginSession(connection, listeners);
  return enqueueBattleOperation(connection, async () => {
    if (!isActive(session)) return null;
    try {
      if (previous?.connection.manager === manager) await leaveNativeRoom(previous);
      if (!isActive(session)) return null;
      const playerId = await connectBattle(connection);
      if (!isActive(session)) return null;
      session.phase = 'entering';
      const playerCfg = { customProperties: JSON.stringify(playerProperties) };
      const roomCfg = buildRoomConfig(value, kind === 'create');
      const raw = kind === 'join'
        ? await manager.joinRoom?.({ data: { roomId: value, playerCfg } })
        : kind === 'create' ? await manager.createRoom?.({ data: { roomCfg, playerCfg } })
          : await manager.matchRoom?.({ data: { roomCfg, playerCfg } });
      session.entered = true;
      if (!isActive(session)) {
        // The SDK may have entered the old room even though its caller was
        // superseded. We still own this manager's queue until cleanup finishes.
        await leaveNativeRoom(session);
        return null;
      }
      const roomInfo = readBattleRoomInfo(raw);
      if (!roomInfo) {
        activeRoom = null;
        await leaveNativeRoom(session);
        console.warn('[TapTapBattle] SDK returned invalid roomInfo');
        return null;
      }
      session.roomId = roomInfo.id;
      session.phase = 'joined';
      return {
        playerId, roomInfo, isHost: roomInfo.ownerId === playerId,
        send: payload => sendSessionMessage(session, payload), leave: () => leaveSession(session),
      };
    } catch (error) {
      if (activeRoom === session) activeRoom = null;
      if (!isCurrentConnection(connection)) return null;
      throw error;
    }
  });
}

export const startTapTapNativeMatch = (
  roomType: string, playerProperties: Record<string, unknown>, listeners: TapBattleListeners = {},
): Promise<TapBattleMatchResult | null> => enterRoom('match', roomType, playerProperties, listeners);

export const createTapTapNativeRoom = (
  roomType: string, playerProperties: Record<string, unknown>, listeners: TapBattleListeners = {},
): Promise<TapBattleMatchResult | null> => enterRoom('create', roomType, playerProperties, listeners);

export const joinTapTapNativeRoom = (
  roomId: string, playerProperties: Record<string, unknown>, listeners: TapBattleListeners = {},
): Promise<TapBattleMatchResult | null> => enterRoom('join', roomId, playerProperties, listeners);

async function sendSessionMessage(session: RoomSession, payload: unknown): Promise<boolean> {
  return enqueueBattleOperation(session.connection, async () => {
    const send = session.connection.manager.sendCustomMessage;
    if (!isActive(session) || session.phase !== 'joined' || !send) return false;
    try {
      const msg = JSON.stringify(payload);
      if (typeof msg !== 'string') return false;
      await send({ data: { msg, type: 0 } });
      return true;
    } catch (error) {
      console.warn('[TapTapBattle] Message failed:', error);
      return false;
    }
  });
}

async function leaveSession(session: RoomSession): Promise<void> {
  if (!isActive(session)) return;
  activeRoom = null;
  session.connection.onEvent = undefined;
  await enqueueBattleOperation(session.connection, async () => {
    // This task was claimed while the session was active and precedes the next
    // room operation in the manager queue, even when that request is now waiting.
    try { await leaveNativeRoom(session); }
    catch (error) { console.warn('[TapTapBattle] Leave failed:', error); }
  });
}

async function leaveNativeRoom(session: RoomSession): Promise<void> {
  if (!session.entered) return;
  await session.connection.manager.leaveRoom?.();
  session.entered = false;
}

// Compatibility exports target the active room; provider sessions use the
// generation-bound closures above so a stale hook cannot control a newer room.
export const sendTapTapRoomMessage = (payload: unknown): Promise<boolean> =>
  activeRoom ? sendSessionMessage(activeRoom, payload) : Promise.resolve(false);

export async function leaveTapTapRoom(): Promise<void> {
  if (activeRoom) await leaveSession(activeRoom);
}
