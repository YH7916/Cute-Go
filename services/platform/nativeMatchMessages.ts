import type { BoardSize, GameType, Player } from '../../types';
import type { PlatformOpponentSummary } from './types';

export type NativeMatchMessage =
  | { type: 'MOVE'; x: number; y: number }
  | { type: 'PASS' }
  | {
      type: 'SYNC';
      boardSize: BoardSize;
      gameType: GameType;
      startColor: Player;
      opponentInfo?: PlatformOpponentSummary;
    }
  | { type: 'SYNC_REPLY'; opponentInfo?: PlatformOpponentSummary }
  | { type: 'RESTART' };

const SUPPORTED_ONLINE_BOARD_SIZES = new Set([9, 13, 19]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseOpponentInfo = (value: unknown): PlatformOpponentSummary | null => {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id.trim() === '') return null;
  if (value.elo !== undefined && (typeof value.elo !== 'number' || !Number.isFinite(value.elo)))
    return null;
  return value.elo === undefined ? { id: value.id } : { id: value.id, elo: value.elo };
};

export const parseNativeMatchMessage = (
  payload: unknown,
  activeBoardSize: number
): NativeMatchMessage | null => {
  if (!isRecord(payload) || typeof payload.type !== 'string') return null;

  if (payload.type === 'MOVE') {
    if (
      !Number.isInteger(payload.x) ||
      !Number.isInteger(payload.y) ||
      (payload.x as number) < 0 ||
      (payload.y as number) < 0 ||
      (payload.x as number) >= activeBoardSize ||
      (payload.y as number) >= activeBoardSize
    )
      return null;
    return { type: 'MOVE', x: payload.x as number, y: payload.y as number };
  }

  if (payload.type === 'PASS' || payload.type === 'RESTART') return { type: payload.type };

  if (payload.type === 'SYNC') {
    if (
      typeof payload.boardSize !== 'number' ||
      !SUPPORTED_ONLINE_BOARD_SIZES.has(payload.boardSize) ||
      (payload.gameType !== 'Go' && payload.gameType !== 'Gomoku') ||
      (payload.startColor !== 'black' && payload.startColor !== 'white')
    )
      return null;

    const opponentInfo =
      payload.opponentInfo === undefined ? undefined : parseOpponentInfo(payload.opponentInfo);
    if (payload.opponentInfo !== undefined && !opponentInfo) return null;
    return {
      type: 'SYNC',
      boardSize: payload.boardSize,
      gameType: payload.gameType,
      startColor: payload.startColor,
      ...(opponentInfo ? { opponentInfo } : {}),
    };
  }

  if (payload.type === 'SYNC_REPLY') {
    const opponentInfo =
      payload.opponentInfo === undefined ? undefined : parseOpponentInfo(payload.opponentInfo);
    if (payload.opponentInfo !== undefined && !opponentInfo) return null;
    return { type: 'SYNC_REPLY', ...(opponentInfo ? { opponentInfo } : {}) };
  }

  return null;
};
