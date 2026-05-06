import { BoardState, Point, Stone, Group } from '../../types';

export const createBoard = (size: number): BoardState =>
  Array(size).fill(null).map(() => Array(size).fill(null));

export const getNeighbors = (point: Point, size: number): Point[] => {
  const neighbors: Point[] = [];
  if (point.x > 0) neighbors.push({ x: point.x - 1, y: point.y });
  if (point.x < size - 1) neighbors.push({ x: point.x + 1, y: point.y });
  if (point.y > 0) neighbors.push({ x: point.x, y: point.y - 1 });
  if (point.y < size - 1) neighbors.push({ x: point.x, y: point.y + 1 });
  return neighbors;
};

export const getGroup = (board: BoardState, start: Point): Group | null => {
  const size = board.length;
  const stone = board[start.y][start.x];
  if (!stone) return null;

  const color = stone.color;
  const group: Stone[] = [];
  const visited = new Set<number>();
  const queue: Point[] = [start];
  let head = 0;
  const liberties = new Set<number>();

  visited.add(start.y * size + start.x);

  while (head < queue.length) {
    const current = queue[head++];
    const currentStone = board[current.y][current.x];
    if (currentStone) group.push(currentStone);

    const neighbors = getNeighbors(current, size);
    for (const n of neighbors) {
      const idx = n.y * size + n.x;
      const neighborStone = board[n.y][n.x];
      if (!neighborStone) {
        liberties.add(idx);
      } else if (neighborStone.color === color && !visited.has(idx)) {
        visited.add(idx);
        queue.push(n);
      }
    }
  }

  return {
    stones: group,
    liberties: liberties.size,
    libertyPoints: Array.from(liberties).map(idx => ({
      x: idx % size,
      y: Math.floor(idx / size),
    })),
  };
};

export const getAllGroups = (board: BoardState): Group[] => {
  const size = board.length;
  const visited = new Set<number>();
  const groups: Group[] = [];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      if (board[y][x] && !visited.has(idx)) {
        const group = getGroup(board, { x, y });
        if (group) {
          group.stones.forEach(s => visited.add(s.y * size + s.x));
          groups.push(group);
        }
      }
    }
  }
  return groups;
};

export const getBoardHash = (board: BoardState): string => {
  let str = '';
  for (let y = 0; y < board.length; y++) {
    for (let x = 0; x < board.length; x++) {
      const s = board[y][x];
      str += s ? (s.color === 'black' ? 'B' : 'W') : '.';
    }
  }
  return str;
};
