/**
 * Territory and score calculation utilities
 */

import type { SignMap, Sign, Vertex } from '@kaya/goboard';

interface TerritoryResult {
  blackTerritory: number;
  whiteTerritory: number;
  territories: SignMap; // -1 = white territory, 0 = neutral, 1 = black territory
}

/**
 * Calculate territory using flood fill algorithm
 * Territory is empty space surrounded by stones of one color
 */
export function calculateTerritory(signMap: SignMap, deadStones: Set<string>): TerritoryResult {
  const height = signMap.length;
  const width = signMap[0]?.length || 0;

  // Create a modified board with dead stones removed
  const modifiedBoard: SignMap = signMap.map((row, y) =>
    row.map((sign, x) => {
      const key = `${x},${y}`;
      if (deadStones.has(key)) {
        return 0; // Treat dead stones as empty
      }
      return sign;
    })
  );

  const visited = new Set<string>();
  const territories: SignMap = Array.from({ length: height }, () => Array(width).fill(0));

  let blackTerritory = 0;
  let whiteTerritory = 0;

  // Flood fill from each empty point
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const key = `${x},${y}`;
      if (modifiedBoard[y][x] === 0 && !visited.has(key)) {
        const region = floodFill(modifiedBoard, [x, y], visited);
        const owner = determineOwner(modifiedBoard, region);

        // Mark territory
        for (const vertex of region) {
          territories[vertex[1]][vertex[0]] = owner;
        }

        if (owner === 1) {
          blackTerritory += region.length;
        } else if (owner === -1) {
          whiteTerritory += region.length;
        }
      }
    }
  }

  return { blackTerritory, whiteTerritory, territories };
}

/**
 * Flood fill to find connected empty region
 */
function floodFill(board: SignMap, start: Vertex, visited: Set<string>): Vertex[] {
  const height = board.length;
  const width = board[0]?.length || 0;
  const region: Vertex[] = [];
  const stack: Vertex[] = [start];

  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    const key = `${x},${y}`;

    if (visited.has(key)) continue;
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    if (board[y][x] !== 0) continue;

    visited.add(key);
    region.push([x, y]);

    // Add neighbors
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  return region;
}

/**
 * Determine who owns a region based on surrounding stones
 * Returns -1 (white), 0 (neutral/dame), or 1 (black)
 */
function determineOwner(board: SignMap, region: Vertex[]): Sign {
  const height = board.length;
  const width = board[0]?.length || 0;

  let touchesBlack = false;
  let touchesWhite = false;

  for (const [x, y] of region) {
    const neighbors: Vertex[] = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];

    for (const [nx, ny] of neighbors) {
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const sign = board[ny][nx];
      if (sign === 1) touchesBlack = true;
      if (sign === -1) touchesWhite = true;
    }
  }

  // Territory belongs to one color only
  if (touchesBlack && !touchesWhite) return 1;
  if (touchesWhite && !touchesBlack) return -1;
  return 0; // Dame (neutral)
}

/**
 * Count captures from current board state
 * In scoring mode, we need to track historical captures
 */
export function countDeadStones(
  signMap: SignMap,
  deadStones: Set<string>
): { blackDeadStones: number; whiteDeadStones: number } {
  let blackDeadStones = 0;
  let whiteDeadStones = 0;

  deadStones.forEach(key => {
    const [x, y] = key.split(',').map(Number);
    const sign = signMap[y]?.[x];
    if (sign === 1) blackDeadStones++;
    if (sign === -1) whiteDeadStones++;
  });

  return { blackDeadStones, whiteDeadStones };
}
