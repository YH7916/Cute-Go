import { BoardState, Player, Point } from '../../types';
import { checkGomokuWin } from './rules';

export const GOMOKU_SCORES = {
  WIN: 100000000,
  OPEN_4: 10000000,
  CLOSED_4: 1000000,
  OPEN_3: 100000,
  CLOSED_3: 1000,
  OPEN_2: 100,
  CLOSED_2: 10,
};

export const analyzeLineBuffer = (line: number[]): number => {
  const str = line.map(v => (v === 1 ? 'X' : v === -1 || v === 2 ? 'O' : '_')).join('');

  if (str.includes('XXXXX')) return GOMOKU_SCORES.WIN;
  if (str.includes('_XXXX_')) return GOMOKU_SCORES.OPEN_4;
  if (str.includes('XXXX_') || str.includes('_XXXX')) return GOMOKU_SCORES.CLOSED_4;
  if (str.includes('X_XXX') || str.includes('XXX_X') || str.includes('XX_XX'))
    return GOMOKU_SCORES.CLOSED_4;
  if (str.includes('_XXX_')) return GOMOKU_SCORES.OPEN_3;
  if (str.includes('_X_XX_') || str.includes('_XX_X_')) return GOMOKU_SCORES.OPEN_3;
  if (str.includes('_XXX') || str.includes('XXX_')) return GOMOKU_SCORES.CLOSED_3;
  if (str.includes('_XX_') || str.includes('_X_X_')) return GOMOKU_SCORES.OPEN_2;
  return 0;
};

export const getGomokuShapeScore = (
  board: BoardState,
  x: number,
  y: number,
  player: Player
): number => {
  const directions = [[1, 0], [0, 1], [1, 1], [1, -1]] as const;
  let totalScore = 0;
  const size = board.length;

  for (const [dx, dy] of directions) {
    const line: number[] = [];
    for (let k = -4; k <= 4; k++) {
      const nx = x + k * dx, ny = y + k * dy;
      if (nx < 0 || nx >= size || ny < 0 || ny >= size) line.push(2);
      else {
        const s = board[ny][nx];
        if (s) line.push(s.color === player ? 1 : -1);
        else line.push(0);
      }
    }
    line[4] = 1;
    totalScore += analyzeLineBuffer(line);
  }
  return totalScore;
};

export const calculateGomokuWinRate = (board: BoardState): number => {
  const size = board.length;
  let maxBlackThreat = 0, maxWhiteThreat = 0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!board[y][x]) {
        const bVal = getGomokuShapeScore(board, x, y, 'black');
        if (bVal > maxBlackThreat) maxBlackThreat = bVal;
        const wVal = getGomokuShapeScore(board, x, y, 'white');
        if (wVal > maxWhiteThreat) maxWhiteThreat = wVal;
      }
    }
  }

  if (maxBlackThreat >= 100000000) return 100;
  if (maxWhiteThreat >= 100000000) return 0;
  if (maxBlackThreat >= 10000000) return 99;
  if (maxWhiteThreat >= 10000000) return 1;

  const diff = maxBlackThreat - maxWhiteThreat;
  const k = 0.00002;
  return (1 / (1 + Math.exp(-k * diff))) * 100;
};

export const getGomokuScore = (
  board: BoardState,
  x: number,
  y: number,
  player: Player,
  opponent: Player,
  strict: boolean
): number => {
  const attackScore = getGomokuShapeScore(board, x, y, player);
  const defendScore = getGomokuShapeScore(board, x, y, opponent);

  if (attackScore >= GOMOKU_SCORES.WIN) return GOMOKU_SCORES.WIN * 10;
  if (defendScore >= GOMOKU_SCORES.WIN) return GOMOKU_SCORES.WIN;
  if (attackScore >= GOMOKU_SCORES.OPEN_4) return GOMOKU_SCORES.OPEN_4 * 10;
  if (defendScore >= GOMOKU_SCORES.OPEN_4) return GOMOKU_SCORES.OPEN_4;

  if (strict && attackScore + defendScore < GOMOKU_SCORES.CLOSED_2) return 0;

  return attackScore + defendScore * 0.9;
};

const getCandidateMoves = (board: BoardState, size: number, range = 2): Point[] => {
  const candidates = new Set<number>();
  const hasStones = board.some(row => row.some(s => s !== null));

  if (!hasStones) {
    const center = Math.floor(size / 2);
    return [{ x: center, y: center }];
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (board[y][x] !== null) {
        for (let dy = -range; dy <= range; dy++) {
          for (let dx = -range; dx <= range; dx++) {
            const ny = y + dy, nx = x + dx;
            if (nx >= 0 && nx < size && ny >= 0 && ny < size && board[ny][nx] === null)
              candidates.add(ny * size + nx);
          }
        }
      }
    }
  }

  if (candidates.size === 0) {
    const all: Point[] = [];
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++)
        if (!board[y][x]) all.push({ x, y });
    return all;
  }
  return Array.from(candidates).map(idx => ({ x: idx % size, y: Math.floor(idx / size) }));
};

const minimaxGomoku = (
  board: BoardState,
  depth: number,
  alpha: number,
  beta: number,
  isMaximizing: boolean,
  player: Player,
  lastMove: Point | null
): number => {
  if (lastMove && checkGomokuWin(board, lastMove))
    return isMaximizing ? -100000000 : 100000000;
  if (depth === 0) return 0;

  const size = board.length;
  const candidates = getCandidateMoves(board, size, 2);
  if (candidates.length === 0) return 0;

  const opColor: Player = player === 'black' ? 'white' : 'black';
  const currentColor: Player = isMaximizing ? player : opColor;

  const scoredMoves = candidates
    .map(pt => ({
      pt,
      score: getGomokuScore(board, pt.x, pt.y, currentColor, isMaximizing ? opColor : player, false),
    }))
    .sort((a, b) => b.score - a.score);

  const branching = depth > 2 ? 8 : 12;
  const movesToSearch = scoredMoves.slice(0, branching);

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const { pt } of movesToSearch) {
      board[pt.y][pt.x] = { color: player, x: pt.x, y: pt.y, id: 'sim' };
      const evalScore = minimaxGomoku(board, depth - 1, alpha, beta, false, player, pt);
      board[pt.y][pt.x] = null;
      const total = evalScore + (pt.x === Math.floor(size / 2) && pt.y === Math.floor(size / 2) ? 0.1 : 0);
      maxEval = Math.max(maxEval, total);
      alpha = Math.max(alpha, total);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const { pt } of movesToSearch) {
      board[pt.y][pt.x] = { color: opColor, x: pt.x, y: pt.y, id: 'sim' };
      const evalScore = minimaxGomoku(board, depth - 1, alpha, beta, true, player, pt);
      board[pt.y][pt.x] = null;
      minEval = Math.min(minEval, evalScore);
      beta = Math.min(beta, evalScore);
      if (beta <= alpha) break;
    }
    return minEval;
  }
};

export const getGomokuAIMove = (
  board: BoardState,
  player: Player,
  difficulty: string
): Point | null => {
  const size = board.length;
  const candidates = getCandidateMoves(board, size, 2);
  if (candidates.length === 0) return { x: Math.floor(size / 2), y: Math.floor(size / 2) };

  let safeDifficulty = difficulty;
  if (!['Easy', 'Medium', 'Hard'].includes(difficulty)) {
    if (difficulty.includes('k')) safeDifficulty = 'Easy';
    else if (difficulty.includes('d')) safeDifficulty = 'Hard';
    else safeDifficulty = 'Medium';
  }

  const depth = safeDifficulty === 'Easy' ? 2 : safeDifficulty === 'Medium' ? 3 : 4;
  const opColor: Player = player === 'black' ? 'white' : 'black';

  for (const m of candidates)
    if (getGomokuShapeScore(board, m.x, m.y, player) >= GOMOKU_SCORES.WIN) return m;
  for (const m of candidates)
    if (getGomokuShapeScore(board, m.x, m.y, opColor) >= GOMOKU_SCORES.WIN) return m;

  const scoredCandidates = candidates
    .map(pt => ({ pt, score: getGomokuScore(board, pt.x, pt.y, player, opColor, true) }))
    .sort((a, b) => b.score - a.score);

  const searchCount = safeDifficulty === 'Hard' ? 8 : safeDifficulty === 'Medium' ? 6 : 4;
  const topMoves = scoredCandidates.slice(0, searchCount).map(s => s.pt);

  let bestMove: Point | null = null;
  let bestVal = -Infinity;

  for (const move of topMoves) {
    board[move.y][move.x] = { color: player, x: move.x, y: move.y, id: 'sim' };
    const val = minimaxGomoku(board, depth - 1, -Infinity, Infinity, false, player, move);
    board[move.y][move.x] = null;

    const bias = (10 - (Math.abs(move.x - size / 2) + Math.abs(move.y - size / 2))) * 10;
    const finalVal = val + bias;
    if (finalVal > bestVal) {
      bestVal = finalVal;
      bestMove = move;
    }
  }

  return bestMove || candidates[0];
};
