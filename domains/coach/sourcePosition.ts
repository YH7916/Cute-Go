import { createInitialPosition, recordMove, type GamePosition } from '../game/positionState';
import { getBoardHash } from '../../core/board';
import { inspectMove } from '../../core/go/rules';
import type { Player, Point } from '../../types';

// Both imported curricula provide setup stones, never a partial React state.
export function sourcePlayer(value: string): Player {
  if (value !== 'black' && value !== 'white') throw new Error(`Invalid source player: ${value}`);
  return value;
}

export function sourcePosition(size: number, player: string, stones: readonly (Point & { color: string })[]) {
  if (![9, 13, 19].includes(size)) throw new Error(`Unsupported source board: ${size}`);
  const position = createInitialPosition(size);
  position.currentPlayer = sourcePlayer(player);
  for (const point of stones) {
    if (!Number.isInteger(point.x) || !Number.isInteger(point.y) || point.x < 0 || point.y < 0 ||
        point.x >= size || point.y >= size || position.board[point.y][point.x]) {
      throw new Error('Invalid or duplicate source setup point');
    }
    position.board[point.y][point.x] = { ...point, color: sourcePlayer(point.color), id: `source-${point.x}-${point.y}` };
  }
  return position;
}

/** Restore one explicitly documented capture; never infer missing history from a shape. */
export function restoreSourceCapture(position: GamePosition, lastMove: Point, capturedPoint: Point): GamePosition {
  const onBoard = (point: Point) => Number.isInteger(point.x) && Number.isInteger(point.y) &&
    point.x >= 0 && point.y >= 0 && point.y < position.board.length && point.x < position.board[point.y].length;
  if (!onBoard(lastMove) || !onBoard(capturedPoint)) throw new Error('Source capture point is outside the board');
  if (position.history.length || position.lastMove || position.consecutivePasses) {
    throw new Error('Source capture restoration requires a setup without existing history');
  }
  const lastStone = position.board[lastMove.y][lastMove.x];
  if (!lastStone || lastStone.color === position.currentPlayer || position.board[capturedPoint.y][capturedPoint.x]) {
    throw new Error('Source capture does not match the declared last move and captured point');
  }
  const board = position.board.map((row) => [...row]);
  board[lastMove.y][lastMove.x] = null;
  board[capturedPoint.y][capturedPoint.x] = { ...capturedPoint, color: position.currentPlayer,
    id: `source-captured-${capturedPoint.x}-${capturedPoint.y}` };
  const previous = { ...position, board, currentPlayer: lastStone.color };
  const replay = inspectMove(board, lastMove.x, lastMove.y, lastStone.color);
  if (!replay.legal || replay.result.captured !== 1 || getBoardHash(replay.result.newBoard) !== getBoardHash(position.board)) {
    throw new Error('Source capture cannot be verified by a legal one-stone capture');
  }
  return recordMove(previous, replay.result.newBoard, lastMove, replay.result.captured, false);
}
