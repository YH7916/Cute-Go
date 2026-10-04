import type { BoardState, Player } from '../../types';

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
  // An open four must rank below blocking an opponent's immediate five.
  if (attackScore >= GOMOKU_SCORES.OPEN_4) return GOMOKU_SCORES.OPEN_4 * 2;
  if (defendScore >= GOMOKU_SCORES.OPEN_4) return GOMOKU_SCORES.OPEN_4;

  if (strict && attackScore + defendScore < GOMOKU_SCORES.CLOSED_2) return 0;

  return attackScore + defendScore * 0.9;
};

