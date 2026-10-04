import type { BoardState, GameType } from '../../types';
import type { Connection } from './types';

export const getBoardConnections = (board: BoardState, gameType: GameType): Connection[] => {
  const boardSize = board.length;

  const lines: Connection[] = [];
  const isValid = (cx: number, cy: number) =>
    cx >= 0 && cx < boardSize && cy >= 0 && cy < boardSize;

  if (gameType === 'Gomoku') {
    const addGomokuLink = (x: number, y: number, dx: number, dy: number) => {
      const tx = x + dx;
      const ty = y + dy;
      if (!isValid(tx, ty)) return;

      const stone = board[y][x];
      const target = board[ty][tx];
      if (!stone || !target || target.color !== stone.color) return;

      lines.push({ x1: x, y1: y, x2: tx, y2: ty, color: stone.color, type: 'loose' });
    };

    for (let y = 0; y < boardSize; y++) {
      for (let x = 0; x < boardSize; x++) {
        const stone = board[y][x];
        if (!stone) continue;

        // 上下左右 + 斜对角，使用围棋同款牵丝效果
        addGomokuLink(x, y, 1, 0);
        addGomokuLink(x, y, 0, 1);
        addGomokuLink(x, y, 1, 1);
        addGomokuLink(x, y, -1, 1);
      }
    }
  } else {
    for (let y = 0; y < boardSize; y++) {
      for (let x = 0; x < boardSize; x++) {
        const stone = board[y][x];
        if (!stone) continue;
        const opColor = stone.color === 'black' ? 'white' : 'black';

        // 1. ORTHO CONNECTIONS (The Snake Body)
        if (isValid(x + 1, y)) {
          const right = board[y][x + 1];
          if (right && right.color === stone.color) {
            lines.push({ x1: x, y1: y, x2: x + 1, y2: y, color: stone.color, type: 'ortho' });
          }
        }
        if (isValid(x, y + 1)) {
          const bottom = board[y + 1][x];
          if (bottom && bottom.color === stone.color) {
            lines.push({ x1: x, y1: y, x2: x, y2: y + 1, color: stone.color, type: 'ortho' });
          }
        }

        // 2. LOOSE CONNECTIONS (The Silk)
        const addLooseIfIsolated = (dx: number, dy: number) => {
          const tx = x + dx;
          const ty = y + dy;

          if (!isValid(tx, ty)) return;
          const target = board[ty][tx];
          if (!target || target.color !== stone.color) return;

          const minX = Math.min(x, tx);
          const maxX = Math.max(x, tx);
          const minY = Math.min(y, ty);
          const maxY = Math.max(y, ty);

          // 1. 检查是否有己方棋子连通 (Has Bridge)
          let hasBridge = false;
          for (let by = minY; by <= maxY; by++) {
            for (let bx = minX; bx <= maxX; bx++) {
              if ((bx === x && by === y) || (bx === tx && by === ty)) continue;
              const midStone = board[by][bx];
              if (midStone && midStone.color === stone.color) {
                hasBridge = true;
                break;
              }
            }
            if (hasBridge) break;
          }

          // 2. 检查是否被对手切断 (Is Cut)
          let isCut = false;

          // 情况 A: 象步/小尖 (Kosumi, 对角线 1,1)
          // 只有当两个“象眼”都被堵住时，才算彻底切断视觉联系
          if (Math.abs(dx) === 1 && Math.abs(dy) === 1) {
            const s1 = board[y][tx];
            const s2 = board[ty][x];
            if (s1?.color === opColor && s2?.color === opColor) isCut = true;
          }
          // 情况 B: 跳/飞 (Jump/Knight's Move)
          // 只要路径矩形范围内有任何一颗对手棋子，就视为阻断了“牵丝”
          else {
            for (let by = minY; by <= maxY; by++) {
              for (let bx = minX; bx <= maxX; bx++) {
                if ((bx === x && by === y) || (bx === tx && by === ty)) continue;
                const midStone = board[by][bx];
                if (midStone && midStone.color === opColor) {
                  isCut = true;
                  break;
                }
              }
              if (isCut) break;
            }
          }

          if (!hasBridge && !isCut) {
            lines.push({ x1: x, y1: y, x2: tx, y2: ty, color: stone.color, type: 'loose' });
          }
        };

        addLooseIfIsolated(1, 1);
        addLooseIfIsolated(-1, 1);
        addLooseIfIsolated(2, 0);
        addLooseIfIsolated(0, 2);
        addLooseIfIsolated(1, 2);
        addLooseIfIsolated(2, 1);
        addLooseIfIsolated(-1, 2);
        addLooseIfIsolated(-2, 1);
      }
    }
  }
  return lines;
};
