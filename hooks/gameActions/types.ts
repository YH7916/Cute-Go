import type { MutableRefObject } from 'react';
import type { GameType, HistoryItem, Player, Point } from '../../types';
import type { useAppSettings } from '../useAppSettings';
import type { useGameState } from '../useGameState';
import type { AppProfile, AppSession, PlatformOpponentSummary } from '../../services/platform';
import type { ScoringRequest } from '../../domains/game/scoringResult';
import type { GamePosition } from '../../domains/game/positionState';

export type AppSettingsReturn = ReturnType<typeof useAppSettings>;
export type GameStateReturn = ReturnType<typeof useGameState>;

export type OnlineMessage =
  | { type: 'MOVE'; x: number; y: number }
  | { type: 'PASS' }
  | { type: 'RESTART' };

export interface UseGameActionsOptions {
  aiTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  aiTurnLock: MutableRefObject<boolean>;
  boardSizeRef: MutableRefObject<number>;
  checkEndGameAchievements: (input: {
    winner: Player;
    myColor: Player;
    score: { black: number; white: number };
    captures: { black: number; white: number };
  }) => void;
  checkMoveAchievements: (input: {
    x: number;
    y: number;
    color: Player;
    moveNumber: number;
    boardSize: number;
  }) => void;
  cleanupOnline: (isManual?: boolean) => void;
  clearInitialStones: () => void;
  displayTerritory: Float32Array | null;
  fetchProfile: (userId: string) => Promise<void>;
  gameState: GameStateReturn;
  gameTypeRef: MutableRefObject<GameType>;
  isThinking: boolean;
  isWebThinking: boolean;
  isWorkerReady: boolean;
  myColor: Player | null;
  myColorRef: MutableRefObject<Player | null>;
  onlineStatus: 'disconnected' | 'connecting' | 'connected';
  onlineStatusRef: MutableRefObject<'disconnected' | 'connecting' | 'connected'>;
  onIllegalMove?: (point: Point, position: GamePosition) => void;
  opponentProfile: PlatformOpponentSummary | null;
  pendingEndGameRef: MutableRefObject<ScoringRequest | null>;
  playSfx: (type: 'move' | 'capture' | 'error' | 'win' | 'lose') => void;
  requestAnalysis: (
    board: GameStateReturn['board'],
    currentPlayer: Player,
    history: HistoryItem[],
    komi: number,
    gameType: GameType,
  ) => boolean;
  sendData: (message: OnlineMessage) => Promise<boolean>;
  session: AppSession | null;
  setEloDiffStyle: (style: 'gold' | 'normal' | 'negative' | null) => void;
  setEloDiffText: (text: string | null) => void;
  setIsThinking: (isThinking: boolean) => void;
  setMyColor: (color: Player | null) => void;
  setShowMenu: (show: boolean) => void;
  setShowPassModal: (show: boolean) => void;
  settings: AppSettingsReturn;
  stopWebThinking: () => void;
  userProfile: AppProfile | null;
  vibrate: (pattern: number | number[]) => void;
  webAiEngine: { resetAI: () => void };
}
