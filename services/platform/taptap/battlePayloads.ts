import { asTapRecord } from './runtime';

export interface TapBattleRoomPlayer {
  id: string;
  customProperties?: string;
}

export interface TapBattleRoomInfo {
  id: string;
  ownerId?: string;
  players: TapBattleRoomPlayer[];
}

const identity = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export function readBattlePlayerId(value: unknown): string | null {
  const record = asTapRecord(value);
  if (!record) return null;
  const id = record.playerId ?? record.id ?? asTapRecord(record.playerInfo)?.id;
  return identity(id) ? id : null;
}

function readRoomPlayer(value: unknown): TapBattleRoomPlayer | null {
  const record = asTapRecord(value);
  if (!record || !identity(record.id)) return null;
  if (record.customProperties !== undefined && typeof record.customProperties !== 'string') return null;
  return {
    id: record.id,
    ...(record.customProperties === undefined ? {} : { customProperties: record.customProperties }),
  };
}

export function getTapTapRoomPlayerInfo(value: unknown): TapBattleRoomPlayer | null {
  const record = asTapRecord(value);
  if (!record) return null;
  const data = asTapRecord(record.data);
  const nested = record.playerInfo ?? data?.playerInfo ?? record.player ?? data?.player;
  if (nested !== undefined && nested !== null) return readRoomPlayer(nested);
  return readRoomPlayer({
    ...record,
    id: record.playerId ?? record.id ?? record.userId ?? record.fromPlayerId,
  });
}

export function getTapTapRoomMessagePayload(value: unknown): unknown {
  const record = asTapRecord(value);
  const data = asTapRecord(record?.data);
  return record?.msg ?? record?.message ?? record?.content ?? data?.msg ?? data?.message ?? data?.content;
}

export function readBattleRoomInfo(value: unknown): TapBattleRoomInfo | null {
  const response = asTapRecord(value);
  if (!response) return null;
  const data = asTapRecord(response.data);
  const room = asTapRecord(response.roomInfo ?? data?.roomInfo ?? response.room ?? response.data);
  if (!room) return null;
  const id = room.id ?? room.roomId ?? room.roomID;
  const ownerId = room.ownerId ?? room.ownerID ?? room.masterId ?? room.masterID;
  const rawPlayers = room.players ?? room.playerList ?? [];
  if (!identity(id) || (ownerId !== undefined && !identity(ownerId)) || !Array.isArray(rawPlayers)) return null;
  const players: TapBattleRoomPlayer[] = [];
  for (const rawPlayer of rawPlayers) {
    const player = readRoomPlayer(rawPlayer);
    if (!player) return null;
    players.push(player);
  }
  return { id, ...(ownerId === undefined ? {} : { ownerId }), players };
}

export function eventMatchesRoom(value: unknown, roomId: string | null): boolean {
  const record = asTapRecord(value);
  const id = record?.roomId ?? asTapRecord(record?.data)?.roomId;
  return id === undefined || (identity(id) && (roomId === null || id === roomId));
}
