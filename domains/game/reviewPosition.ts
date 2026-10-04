import type { GamePosition } from './positionState';

// History stores BEFORE-action positions. Index n displays exactly n actions.
export function selectReviewPosition(position: GamePosition, index: number): GamePosition {
  const cursor = Number.isFinite(index) ? Math.max(0, Math.trunc(index)) : 0;
  const previous = position.history[cursor];
  if (!previous) return position;
  return {
    board: previous.board, currentPlayer: previous.currentPlayer,
    blackCaptures: previous.blackCaptures, whiteCaptures: previous.whiteCaptures,
    lastMove: previous.lastMove, consecutivePasses: previous.consecutivePasses,
    history: position.history.slice(0, cursor),
  };
}
