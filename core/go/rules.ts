import { BoardState, Player, Point } from '../../types';
import { getNeighbors, getGroup, getBoardHash } from '../board';

export const attemptMove = (
  board: BoardState,
  x: number,
  y: number,
  player: Player,
  gameType: 'Go' | 'Gomoku' = 'Go',
  previousBoardStateHash: string | null = null
): { newBoard: BoardState; captured: number } | null => {
  const size = board.length;
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 0 ||
    y < 0 ||
    y >= size ||
    x >= (board[y]?.length ?? 0)
  ) return null;
  if (board[y][x] !== null) return null;

  const safeBoard = board.map(row => [...row]);
  safeBoard[y][x] = { color: player, id: `${player}-${Date.now()}-${x}-${y}`, x, y };

  if (gameType === 'Gomoku') return { newBoard: safeBoard, captured: 0 };

  let capturedCount = 0;
  const opponent = player === 'black' ? 'white' : 'black';
  const neighbors = getNeighbors({ x, y }, size);

  for (let i = 0; i < neighbors.length; i++) {
    const n = neighbors[i];
    const stone = safeBoard[n.y][n.x];
    if (stone && stone.color === opponent) {
      const group = getGroup(safeBoard, n);
      if (group && group.liberties === 0) {
        for (let j = 0; j < group.stones.length; j++) {
          const s = group.stones[j];
          safeBoard[s.y][s.x] = null;
          capturedCount++;
        }
      }
    }
  }

  const myGroup = getGroup(safeBoard, { x, y });
  if (myGroup && myGroup.liberties === 0 && capturedCount === 0) return null;

  if (previousBoardStateHash) {
    if (getBoardHash(safeBoard) === previousBoardStateHash) return null;
  }

  return { newBoard: safeBoard, captured: capturedCount };
};

export const isSimpleEye = (board: BoardState, x: number, y: number, color: Player): boolean => {
  const size = board.length;
  const neighbors = getNeighbors({ x, y }, size);
  for (const n of neighbors) {
    const s = board[n.y][n.x];
    if (!s || s.color !== color) return false;
  }

  let badDiagonals = 0;
  const diags = [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const;
  for (const [dx, dy] of diags) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
      const s = board[ny][nx];
      if (!s || s.color !== color) badDiagonals++;
    }
  }

  return badDiagonals <= 1;
};

export const getCandidateMoves = (board: BoardState, size: number, range = 2): Point[] => {
  const candidates = new Set<number>();
  const hasStones = board.some(row => row.some(s => s !== null));

  if (size >= 9) {
    const margin = size >= 13 ? 3 : 2;
    const points = [
      { x: margin, y: margin },
      { x: size - 1 - margin, y: margin },
      { x: margin, y: size - 1 - margin },
      { x: size - 1 - margin, y: size - 1 - margin },
      { x: Math.floor(size / 2), y: Math.floor(size / 2) },
    ];
    points.forEach(p => {
      if (!board[p.y][p.x]) candidates.add(p.y * size + p.x);
    });
  }

  if (!hasStones) {
    if (candidates.size > 0)
      return Array.from(candidates).map(idx => ({ x: idx % size, y: Math.floor(idx / size) }));
    const center = Math.floor(size / 2);
    return [{ x: center, y: center }];
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (board[y][x] !== null) {
        for (let dy = -range; dy <= range; dy++) {
          for (let dx = -range; dx <= range; dx++) {
            const ny = y + dy, nx = x + dx;
            if (nx >= 0 && nx < size && ny >= 0 && ny < size && board[ny][nx] === null) {
              candidates.add(ny * size + nx);
            }
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
