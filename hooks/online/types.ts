import type { MutableRefObject } from 'react';
import type { BoardSize, GameMode, GameType, Player } from '../../types';
import type { AppProfile, AppSession } from '../../services/platform';

export interface OnlineSettings {
  boardSize: BoardSize;
  gameType: GameType;
  setBoardSize(size: BoardSize): void;
  setGameType(gameType: GameType): void;
  setGameMode(gameMode: GameMode): void;
}

export interface UseOnlineMatchOptions {
  settings: OnlineSettings;
  session: AppSession | null;
  userProfile: AppProfile | null;
  boardSizeRef: MutableRefObject<BoardSize>;
  gameTypeRef: MutableRefObject<GameType>;
  currentPlayerRef: MutableRefObject<Player>;
  myColorRef: MutableRefObject<Player | null>;
  resetGameRef: MutableRefObject<(keepOnline?: boolean, explicitSize?: number, shouldBroadcast?: boolean) => void>;
  executeMoveRef: MutableRefObject<(x: number, y: number, isRemote: boolean) => void>;
  handlePassRef: MutableRefObject<(isRemote?: boolean) => void>;
  setShowLoginModal(show: boolean): void;
  setShowMenu(show: boolean): void;
  setShowStartScreen(show: boolean): void;
  setToastMsg(message: string | null): void;
  vibrate(pattern: number | number[]): void;
}

export interface OnlineRoomConfig { boardSize: BoardSize; gameType: GameType }
export type OnlineRequestKind = 'match' | 'create' | 'join';

export function formatOnlineError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (!error || typeof error !== 'object') return '未知错误';
  const details = error as Record<string, unknown>;
  const rawCode = details.errno ?? details.errorCode ?? details.code;
  const rawMessage = details.errMsg ?? details.errorMessage ?? details.message;
  const code = typeof rawCode === 'string' || typeof rawCode === 'number' ? rawCode : undefined;
  const message = typeof rawMessage === 'string' ? rawMessage : undefined;
  if (code !== undefined && message) return `${message}（错误码 ${code}）`;
  return message || (code !== undefined ? `错误码 ${code}` : '未知错误');
}
