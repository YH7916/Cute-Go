import type { BoardState } from '../../types';
import type { QiSegment } from './types';

// Visual edges intentionally preserve a separate segment for each stone touching a liberty.
// They are not the deduplicated liberty-point set used by the rules engine.
export const calculateQiFlow = (board: BoardState, x: number, y: number): QiSegment[] => {
  const boardSize = board.length;

  const targetStone = board[y][x];
  if (!targetStone) return [];

  // 简单的泛洪算法找到整个棋块 (Group)
  const groupStones: { x: number; y: number }[] = [];
  const visited = new Set<string>();
  const stack = [{ x, y }];
  const color = targetStone.color;

  visited.add(`${x},${y}`);

  while (stack.length > 0) {
    const curr = stack.pop()!;
    groupStones.push(curr);

    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    dirs.forEach(([dx, dy]) => {
      const nx = curr.x + dx;
      const ny = curr.y + dy;
      if (nx >= 0 && nx < boardSize && ny >= 0 && ny < boardSize) {
        const key = `${nx},${ny}`;
        if (!visited.has(key)) {
          const neighbor = board[ny][nx];
          if (neighbor && neighbor.color === color) {
            visited.add(key);
            stack.push({ x: nx, y: ny });
          }
        }
      }
    });
  }

  // 计算该棋块所有的气（连接到空位的线段）
  const segments: QiSegment[] = [];
  groupStones.forEach((stone) => {
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    dirs.forEach(([dx, dy]) => {
      const nx = stone.x + dx;
      const ny = stone.y + dy;
      if (nx >= 0 && nx < boardSize && ny >= 0 && ny < boardSize) {
        // 如果邻居是空的，这就是一口气
        if (!board[ny][nx]) {
          segments.push({
            x1: stone.x,
            y1: stone.y,
            x2: nx,
            y2: ny,
            key: `qi-${stone.x},${stone.y}-${nx},${ny}`,
          });
        }
      }
    });
  });
  return segments;
};
