import type { BoardState, Player, Point } from '../../types';
import { GOMOKU_SCORES, getGomokuScore, getGomokuShapeScore } from './evaluation';
import type { GomokuSearchProfile } from './profiles';
import { checkGomokuWin } from './rules';

export interface GomokuSearchResult {
  move: Point | null;
  reason: 'opening' | 'win' | 'block' | 'search' | 'no-moves';
}

export function getGomokuCandidates(board: BoardState, profile: GomokuSearchProfile): Point[] {
  const size = board.length;
  const candidates = new Set<number>();
  const hasStones = board.some(row => row.some(stone => stone !== null));
  // The former Worker used Go candidates. Keep those early entries, including
  // their insertion order, because stable score ties affect the selected move.
  if (profile.seedLandmarks && size >= 9) {
    const margin = size >= 13 ? 3 : 2;
    for (const point of [
      { x: margin, y: margin },
      { x: size - 1 - margin, y: margin },
      { x: margin, y: size - 1 - margin },
      { x: size - 1 - margin, y: size - 1 - margin },
      { x: Math.floor(size / 2), y: Math.floor(size / 2) },
    ]) {
      if (!board[point.y][point.x]) candidates.add(point.y * size + point.x);
    }
  }
  if (!hasStones) {
    if (candidates.size === 0) candidates.add(Math.floor(size / 2) * size + Math.floor(size / 2));
  } else {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (board[y][x] === null) continue;
      for (let dy = -profile.candidateRange; dy <= profile.candidateRange; dy++) {
        for (let dx = -profile.candidateRange; dx <= profile.candidateRange; dx++) {
          const ny = y + dy, nx = x + dx;
          if (nx >= 0 && nx < size && ny >= 0 && ny < size && board[ny][nx] === null) {
            candidates.add(ny * size + nx);
          }
        }
      }
    }
  }
  if (candidates.size === 0) {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (!board[y][x]) candidates.add(y * size + x);
    }
  }
  return Array.from(candidates, index => ({ x: index % size, y: Math.floor(index / size) }));
}

function minimax(
  board: BoardState, depth: number, alpha: number, beta: number,
  isMaximizing: boolean, player: Player, lastMove: Point,
  profile: GomokuSearchProfile,
): number {
  if (checkGomokuWin(board, lastMove)) return isMaximizing ? -GOMOKU_SCORES.WIN : GOMOKU_SCORES.WIN;
  if (depth === 0) return 0;
  const candidates = getGomokuCandidates(board, profile);
  if (candidates.length === 0) return 0;
  const opponent = player === 'black' ? 'white' : 'black';
  const currentColor = isMaximizing ? player : opponent;
  const otherColor = isMaximizing ? opponent : player;
  const width = depth > 2 ? profile.deepBranchWidth : profile.shallowBranchWidth;
  const moves = candidates.map(point => ({
    point, score: getGomokuScore(board, point.x, point.y, currentColor, otherColor, false),
  })).sort((a, b) => b.score - a.score).slice(0, width);
  let best = isMaximizing ? -Infinity : Infinity;
  for (const { point } of moves) {
    if (profile.immediateWinCutoff && getGomokuShapeScore(board, point.x, point.y, currentColor) >= GOMOKU_SCORES.WIN) {
      return isMaximizing ? GOMOKU_SCORES.WIN : -GOMOKU_SCORES.WIN;
    }
    board[point.y][point.x] = { ...point, color: currentColor, id: 'sim' };
    let score: number;
    try {
      score = minimax(board, depth - 1, alpha, beta, !isMaximizing, player, point, profile);
    } finally {
      board[point.y][point.x] = null;
    }
    if (isMaximizing) {
      if (point.x === Math.floor(board.length / 2) && point.y === Math.floor(board.length / 2)) score += 0.1;
      best = Math.max(best, score);
      alpha = Math.max(alpha, score);
    } else {
      best = Math.min(best, score);
      beta = Math.min(beta, score);
    }
    if (beta <= alpha) break;
  }
  return best;
}

export function searchGomoku(
  board: BoardState,
  player: Player,
  profile: GomokuSearchProfile,
  now: () => number = () => performance.now(),
): GomokuSearchResult {
  const size = board.length;
  const center = { x: Math.floor(size / 2), y: Math.floor(size / 2) };
  if (profile.mode === 'worker' && !board.some(row => row.some(Boolean))) {
    return { move: center, reason: 'opening' };
  }
  const startedAt = profile.timeLimitMs === null ? 0 : now();
  const candidates = getGomokuCandidates(board, profile);
  if (candidates.length === 0) {
    return { move: profile.mode === 'synchronous' ? center : null, reason: 'no-moves' };
  }
  const opponent = player === 'black' ? 'white' : 'black';
  // Winning and blocking are based on each side's shape, never the blended score.
  for (const move of candidates) {
    if (getGomokuShapeScore(board, move.x, move.y, player) >= GOMOKU_SCORES.WIN) return { move, reason: 'win' };
  }
  for (const move of candidates) {
    if (getGomokuShapeScore(board, move.x, move.y, opponent) >= GOMOKU_SCORES.WIN) return { move, reason: 'block' };
  }
  const moves = candidates.map(point => ({
    point, score: getGomokuScore(board, point.x, point.y, player, opponent, profile.strictRootOrdering),
  })).sort((a, b) => b.score - a.score).slice(0, profile.rootWidth).map(item => item.point);
  const expired = () => profile.timeLimitMs !== null && now() - startedAt > profile.timeLimitMs;
  const iterative = profile.mode === 'worker';
  let bestMove: Point | null = iterative ? moves[0] : null;
  for (let depth = iterative ? 2 : profile.maxDepth; depth <= profile.maxDepth; depth += 2) {
    let alpha = -Infinity;
    let iterationMove = bestMove;
    let iterationScore = -Infinity;
    for (const move of moves) {
      // Preserve the old root-only time checks; recursive timeout behavior is a
      // separate strength/latency change, not part of this extraction.
      if (expired()) break;
      board[move.y][move.x] = { ...move, color: player, id: 'sim' };
      let score: number;
      try {
        score = minimax(board, depth - 1, profile.reuseRootAlpha ? alpha : -Infinity, Infinity, false, player, move, profile);
      } finally {
        board[move.y][move.x] = null;
      }
      if (profile.rootCenterBias) score += (10 - (Math.abs(move.x - size / 2) + Math.abs(move.y - size / 2))) * 10;
      if (score > iterationScore) { iterationScore = score; iterationMove = move; }
      alpha = Math.max(alpha, score);
    }
    if (iterative && iterationScore >= GOMOKU_SCORES.WIN * 0.9) {
      bestMove = iterationMove;
      break;
    }
    if (expired()) break;
    bestMove = iterationMove;
  }
  return { move: bestMove ?? candidates[0], reason: 'search' };
}
