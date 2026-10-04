import type { BoardState, Player, Point } from '../../types';
import { getGomokuSearchProfile } from './profiles';
import { searchGomoku } from './search';

export {
  GOMOKU_SCORES,
  analyzeLineBuffer,
  getGomokuShapeScore,
  calculateGomokuWinRate,
  getGomokuScore,
} from './evaluation';

// Compatibility entry point for the synchronous caller; search lives in search.ts.
export const getGomokuAIMove = (
  board: BoardState,
  player: Player,
  difficulty: string,
): Point | null => searchGomoku(board, player, getGomokuSearchProfile('synchronous', difficulty)).move;
