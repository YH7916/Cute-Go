import type { BoardState, HistoryItem, Player } from '../../types';

export interface PositionSnapshot {
  board: BoardState;
  history: HistoryItem[];
  player: Player;
}

export function isSamePosition(first: PositionSnapshot, second: PositionSnapshot): boolean {
  return first.board === second.board && first.history === second.history && first.player === second.player;
}
