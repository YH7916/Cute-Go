// Re-exports from core/ — goLogic.ts is kept for backward compatibility.
// All implementations have moved to core/board/, core/go/, core/gomoku/.

import { BoardState, Player, Point, GameType, Difficulty } from '../types';
import { getGoAIMove } from '../core/go/ai';
import { getGomokuAIMove } from '../core/gomoku/ai';

export { createBoard, getNeighbors, getGroup, getAllGroups, getBoardHash } from '../core/board';
export { attemptMove, isSimpleEye, getCandidateMoves } from '../core/go/rules';
export {
  calculateScore,
  calculateModelScore,
  calculateHeuristicScore,
  calculateWinRate,
  cleanBoardWithTerritory,
  calculateTerritory,
} from '../core/go/scoring';
export { generateSGF, parseSGF, serializeGame, deserializeGame } from '../core/go/sgf';
export { evaluateShape, evaluatePositionStrength } from '../core/go/ai';
export { checkGomokuWin, attemptGomokuMove } from '../core/gomoku/rules';
export {
  getGomokuAIMove,
  getGomokuScore,
  getGomokuShapeScore,
  calculateGomokuWinRate,
  GOMOKU_SCORES,
  analyzeLineBuffer,
} from '../core/gomoku/ai';

// Unified AI entry point — routes to Go or Gomoku AI based on gameType
export const getAIMove = (
  board: BoardState,
  player: Player,
  gameType: GameType,
  difficulty: Difficulty | string,
  previousBoardHash: string | null = null
): Point | null | 'RESIGN' => {
  if (gameType === 'Gomoku') return getGomokuAIMove(board, player, difficulty);
  return getGoAIMove(board, player, difficulty, previousBoardHash);
};
