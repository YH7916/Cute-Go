import { BoardState, Player, Point } from '../../types';
import { getNeighbors, getAllGroups } from '../board';

export const calculateScore = (
  board: BoardState,
  ownership?: Float32Array | null,
  komi = 7.5
): { black: number; white: number } => {
  if (ownership && ownership.length > 0) board = cleanBoardWithTerritory(board, ownership);
  const size = board.length;
  let blackScore = 0, whiteScore = 0;
  const visited = new Set<number>();

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      if (visited.has(idx)) continue;

      const stone = board[y][x];
      if (stone) {
        if (stone.color === 'black') blackScore++; else whiteScore++;
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

const MODEL_TERRITORY_THRESHOLD = 0.3;

export const calculateModelScore = (
  board: BoardState,
  ownership: Float32Array | null,
  komi = 7.5
): { black: number; white: number } => {
  if (!ownership || ownership.length === 0) return calculateScore(board, undefined, komi);

  const cleanedBoard = cleanBoardWithTerritory(board, ownership);
  const size = cleanedBoard.length;
  let blackScore = 0, whiteScore = 0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const stone = cleanedBoard[y][x];
      if (stone) {
        if (stone.color === 'black') blackScore++; else whiteScore++;
        continue;
      }
      const owner = ownership[y * size + x] ?? 0;
      if (owner > MODEL_TERRITORY_THRESHOLD) blackScore++;
      else if (owner < -MODEL_TERRITORY_THRESHOLD) whiteScore++;
    }
  }

  whiteScore += komi;
  return { black: blackScore, white: whiteScore };
};

export const cleanBoardWithTerritory = (board: BoardState, territory: Float32Array): BoardState => {
  const size = board.length;
  const newBoard = board.map(row => row.map(s => (s ? { ...s } : null)));

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const owner = territory[idx];
      const stone = newBoard[y][x];
      if (stone) {
        if (stone.color === 'black' && owner < -0.5) newBoard[y][x] = null;
        else if (stone.color === 'white' && owner > 0.5) newBoard[y][x] = null;
      }
    }
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
