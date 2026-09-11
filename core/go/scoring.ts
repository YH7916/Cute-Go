import { getDefaultKomi } from './config';
import { BoardState, Point } from '../../types';
import { getNeighbors, getAllGroups } from '../board';

export const calculateScore = (
  board: BoardState,
  ownership?: Float32Array | null,
  komi = getDefaultKomi(board.length),
  captures: { black: number; white: number } = { black: 0, white: 0 }
): { black: number; white: number } => {
  const original = board;
  if (ownership && ownership.length === board.length * board.length) board = cleanBoardWithTerritory(board, ownership);
  const size = board.length;
  let blackScore = captures.black, whiteScore = captures.white;
  // Removed dead stones count as prisoners, and their empty intersections as territory.
  for (let y = 0; y < board.length; y++) for (let x = 0; x < board.length; x++) {
    if (original[y][x] && !board[y][x]) {
      if (original[y][x]!.color === 'black') whiteScore++;
      else blackScore++;
    }
  }
  const visited = new Set<number>();

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      if (visited.has(idx)) continue;

      const stone = board[y][x];
      if (stone) {
        visited.add(idx);
      } else {
        const region: Point[] = [];
        const regionQueue: Point[] = [{ x, y }];
        visited.add(idx);
        let touchesBlack = false, touchesWhite = false;

        while (regionQueue.length > 0) {
          const p = regionQueue.shift()!;
          region.push(p);
          const neighbors = getNeighbors(p, size);
          for (const n of neighbors) {
            const nIdx = n.y * size + n.x;
            const nStone = board[n.y][n.x];
            if (nStone) {
              if (nStone.color === 'black') touchesBlack = true;
              if (nStone.color === 'white') touchesWhite = true;
            } else if (!visited.has(nIdx)) {
              visited.add(nIdx);
              regionQueue.push(n);
            }
          }
        }
        if (touchesBlack && !touchesWhite) blackScore += region.length;
        if (touchesWhite && !touchesBlack) whiteScore += region.length;
      }
    }
  }
  whiteScore += komi;
  return { black: blackScore, white: whiteScore };
};

// Ownership is only used to identify dead groups. Final territory is flood-filled,
// never awarded by thresholding predictions at individual empty intersections.
export const calculateModelScore = (
  board: BoardState,
  ownership: Float32Array | null,
  komi = getDefaultKomi(board.length),
  captures: { black: number; white: number } = { black: 0, white: 0 }
): { black: number; white: number } => calculateScore(board, ownership, komi, captures);

export const cleanBoardWithTerritory = (board: BoardState, territory: Float32Array): BoardState => {
  if (territory.length !== board.length * board.length) return board;
  const newBoard = board.map(row => row.map(s => (s ? { ...s } : null)));
  for (const group of getAllGroups(board)) {
    const sign = group.stones[0].color === 'black' ? 1 : -1;
    // Require unanimous strong evidence: do not split a connected chain.
    const dead = group.stones.every(s => territory[s.y * board.length + s.x] * sign < -0.9);
    if (dead) for (const stone of group.stones) newBoard[stone.y][stone.x] = null;
  }
  return newBoard;
};

export const calculateTerritory = (
  board: BoardState
): { black: { x: number; y: number }[]; white: { x: number; y: number }[] } => {
  const size = board.length;
  const territory = {
    black: [] as { x: number; y: number }[],
    white: [] as { x: number; y: number }[],
  };
  const visited = new Set<string>();
  const getKey = (x: number, y: number) => `${x},${y}`;
  const isValid = (x: number, y: number) => x >= 0 && x < size && y >= 0 && y < size;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (board[y][x] || visited.has(getKey(x, y))) continue;

      const region: { x: number; y: number }[] = [];
      let touchingBlack = false, touchingWhite = false;
      const stack = [{ x, y }];
      visited.add(getKey(x, y));

      while (stack.length > 0) {
        const p = stack.pop()!;
        region.push(p);
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
        dirs.forEach(([dx, dy]) => {
          const nx = p.x + dx, ny = p.y + dy;
          if (isValid(nx, ny)) {
            const stone = board[ny][nx];
            if (stone) {
              if (stone.color === 'black') touchingBlack = true;
              if (stone.color === 'white') touchingWhite = true;
            } else {
              const key = getKey(nx, ny);
              if (!visited.has(key)) {
                visited.add(key);
                stack.push({ x: nx, y: ny });
              }
            }
          }
        });
      }

      if (touchingBlack && !touchingWhite) territory.black.push(...region);
      else if (touchingWhite && !touchingBlack) territory.white.push(...region);
    }
  }
  return territory;
};

export const calculateHeuristicScore = (board: BoardState): { black: number; white: number } => {
  const size = board.length;
  let blackScore = 0, whiteScore = 0;
  const allGroups = getAllGroups(board);

  const territoryScore = calculateScore(board);
  blackScore += territoryScore.black;
  whiteScore += territoryScore.white;

  allGroups.forEach(group => {
    const isBlack = group.stones[0].color === 'black';
    const numStones = group.stones.length;

    if (group.liberties === 1) {
      if (isBlack) blackScore -= numStones * 1.5; else whiteScore -= numStones * 1.5;
    } else if (group.liberties === 2) {
      if (isBlack) blackScore -= numStones * 0.5; else whiteScore -= numStones * 0.5;
    } else if (group.liberties >= 5) {
      if (isBlack) blackScore += 2; else whiteScore += 2;
    }

    group.stones.forEach(s => {
      const distToCenter = Math.abs(s.x - size / 2) + Math.abs(s.y - size / 2);
      const normalizedDist = distToCenter / (size / 2);
      if (normalizedDist < 0.6) {
        if (isBlack) blackScore += 0.2; else whiteScore += 0.2;
      }
    });
  });

  return { black: blackScore, white: whiteScore };
};

export const calculateWinRate = (board: BoardState): number => {
  let stoneCount = 0;
  const size = board.length;
  const totalPoints = size * size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (board[y][x]) stoneCount++;

  const fillRatio = stoneCount / totalPoints;
  const heuristic = calculateHeuristicScore(board);
  const diff = heuristic.black - heuristic.white;

  const baseK = 0.08, endK = 0.35;
  const k = baseK + (endK - baseK) * (fillRatio * fillRatio);
  return (1 / (1 + Math.exp(-k * diff))) * 100;
};
