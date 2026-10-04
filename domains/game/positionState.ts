import { createBoard } from '../../core/board';
import type { BoardState, HistoryItem, Player, Point } from '../../types';

// The position and its undo history move together. Presentation/endgame state
// remains separate, but no action may mix these fields from different renders.
export interface GamePosition {
  board: BoardState;
  currentPlayer: Player;
  blackCaptures: number;
  whiteCaptures: number;
  lastMove: Point | null;
  consecutivePasses: number;
  history: HistoryItem[];
}

export interface PositionAccess {
  readPosition(): GamePosition;
  writePosition(next: GamePosition | ((current: GamePosition) => GamePosition)): void;
}

export function createInitialPosition(size: number): GamePosition {
  return {
    board: createBoard(size), currentPlayer: 'black',
    blackCaptures: 0, whiteCaptures: 0, lastMove: null,
    consecutivePasses: 0, history: [],
  };
}

function beforeAction(position: GamePosition, move: Point | null): HistoryItem {
  return {
    board: position.board, currentPlayer: position.currentPlayer,
    blackCaptures: position.blackCaptures, whiteCaptures: position.whiteCaptures,
    lastMove: position.lastMove, consecutivePasses: position.consecutivePasses, move,
  };
}

export function recordMove(
  position: GamePosition, board: BoardState, move: Point, captured: number, endsGame: boolean,
): GamePosition {
  const player = position.currentPlayer;
  return {
    board,
    currentPlayer: endsGame ? player : player === 'black' ? 'white' : 'black',
    blackCaptures: position.blackCaptures + (player === 'black' ? captured : 0),
    whiteCaptures: position.whiteCaptures + (player === 'white' ? captured : 0),
    lastMove: move, consecutivePasses: 0,
    history: [...position.history, beforeAction(position, move)],
  };
}

export function recordPass(position: GamePosition): GamePosition {
  const consecutivePasses = position.consecutivePasses + 1;
  const endsGame = consecutivePasses >= 2;
  return {
    ...position,
    currentPlayer: endsGame ? position.currentPlayer : position.currentPlayer === 'black' ? 'white' : 'black',
    lastMove: endsGame ? position.lastMove : null,
    consecutivePasses,
    history: [...position.history, beforeAction(position, null)],
  };
}

export function undoPosition(position: GamePosition, steps: number): GamePosition {
  const index = Math.max(0, position.history.length - steps);
  const previous = position.history[index];
  if (!previous) return position;
  return {
    board: previous.board, currentPlayer: previous.currentPlayer,
    blackCaptures: previous.blackCaptures, whiteCaptures: previous.whiteCaptures,
    lastMove: previous.lastMove, consecutivePasses: previous.consecutivePasses,
    history: position.history.slice(0, index),
  };
}
