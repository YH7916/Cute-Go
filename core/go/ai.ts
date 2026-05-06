import { BoardState, Player, Point } from '../../types';
import { getNeighbors, getGroup, getAllGroups } from '../board';
import { calculateHeuristicScore } from './scoring';
import { getCandidateMoves, attemptMove, isSimpleEye } from './rules';
import { getJosekiMove } from '../../utils/joseki';

export const evaluatePositionStrength = (x: number, y: number, size: number): number => {
  if (size >= 13) {
    const dX = Math.min(x, size - 1 - x);
    const dY = Math.min(y, size - 1 - y);
    if ((dX === 2 || dX === 3) && (dY === 2 || dY === 3)) return 25;
    if (dX === 2 && dY === 4) return 20;
    if (dX === 0 || dY === 0) return -20;
    if (dX === 1 || dY === 1) return -5;
  }
  const center = Math.floor(size / 2);
  const distToCenter = Math.abs(x - center) + Math.abs(y - center);
  return Math.max(0, 10 - distToCenter);
};

export const evaluateShape = (board: BoardState, x: number, y: number, player: Player): number => {
  const size = board.length;
  let score = 0;
  const opponent = player === 'black' ? 'white' : 'black';

  const diagonals = [
    { x: x - 1, y: y - 1 }, { x: x + 1, y: y - 1 },
    { x: x - 1, y: y + 1 }, { x: x + 1, y: y + 1 },
  ];
  let myStonesDiag = 0;
  diagonals.forEach(p => {
    if (p.x >= 0 && p.x < size && p.y >= 0 && p.y < size) {
      const stone = board[p.y][p.x];
      if (stone && stone.color === player) myStonesDiag++;
    }
  });
  if (myStonesDiag >= 2) score += 15;

  const neighbors = getNeighbors({ x, y }, size);
  let opponentStones = 0, myStones = 0;
  neighbors.forEach(p => {
    const stone = board[p.y][p.x];
    if (stone) {
      if (stone.color === opponent) opponentStones++;
      if (stone.color === player) myStones++;
    }
  });
  if (opponentStones >= 2 && myStones >= 1) score += 15;

  const jumpDirs = [[2, 0], [-2, 0], [0, 2], [0, -2]] as const;
  for (const [dx, dy] of jumpDirs) {
    const tx = x + dx, ty = y + dy;
    const mx = x + dx / 2, my = y + dy / 2;
    if (tx >= 0 && tx < size && ty >= 0 && ty < size) {
      const target = board[ty][tx];
      const mid = board[my][mx];
      if (target && target.color === player && !mid) score += 8;
    }
  }

  if (myStones >= 3) {
    let myNeighbors = 0;
    getNeighbors({ x, y }, size).forEach(n => {
      if (board[n.y][n.x]?.color === player) myNeighbors++;
    });
    if (myNeighbors >= 3) score -= 15;
    else score -= 5;
  }

  let nearbyStones = 0;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < size && ny >= 0 && ny < size && board[ny][nx]) nearbyStones++;
    }
  }
  if (nearbyStones === 0) score += 40;

  return score;
};

export const getGoAIMove = (
  board: BoardState,
  player: Player,
  difficulty: string,
  previousBoardHash: string | null
): Point | null | 'RESIGN' => {
  const size = board.length;
  const opponent = player === 'black' ? 'white' : 'black';
  const possibleMoves: { x: number; y: number; score: number }[] = [];
  const candidates = getCandidateMoves(board, size, 2);

  const totalSpots = size * size;
  let stoneCount = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (board[r][c]) stoneCount++;

  if (difficulty !== 'Easy' && stoneCount > totalSpots * 0.3) {
    const heuristic = calculateHeuristicScore(board);
    const isBlack = player === 'black';
    const scoreDiff = isBlack
      ? heuristic.black - heuristic.white
      : heuristic.white - heuristic.black;
    if (scoreDiff < -50 || (scoreDiff < -35 && stoneCount > totalSpots * 0.6)) return 'RESIGN';
  }

  if (stoneCount < size * size * 0.4) {
    const josekiMove = getJosekiMove(board, size, player);
    if (josekiMove && board[josekiMove.y][josekiMove.x] === null) return josekiMove;
  }

  const rankedCandidates = candidates.map(pt => {
    const posScore = evaluatePositionStrength(pt.x, pt.y, size);
    const shapeScore = evaluateShape(board, pt.x, pt.y, player);
    let proximityBonus = 0;
    const neighbors = getNeighbors(pt, size);
    neighbors.forEach(n => { if (board[n.y][n.x]) proximityBonus += 10; });
    return { pt, staticScore: posScore + shapeScore * 2 + proximityBonus };
  });

  rankedCandidates.sort((a, b) => b.staticScore - a.staticScore);

  const targetMoves = difficulty === 'Easy' ? 15 : difficulty === 'Medium' ? 25 : 40;
  let validMovesFound = 0;

  for (const item of rankedCandidates) {
    if (validMovesFound >= targetMoves) break;
    const { x, y } = item.pt;

    if (isSimpleEye(board, x, y, player)) continue;

    const sim = attemptMove(board, x, y, player, 'Go', previousBoardHash);
    if (!sim) continue;

    const myNewGroup = sim.newBoard[y][x] ? getGroup(sim.newBoard, { x, y }) : null;
    if (myNewGroup && myNewGroup.liberties === 0 && sim.captured === 0) continue;

    validMovesFound++;
    let score = 0;

    if (sim.captured > 0) {
      if (sim.captured === 1) score += 80;
      else score += 300 + sim.captured * 100;
    }

    const neighbors = getNeighbors({ x, y }, size);
    neighbors.forEach(n => {
      const stone = board[n.y][n.x];
      if (stone && stone.color === opponent) {
        const enemyGroup = getGroup(sim.newBoard, n);
        if (enemyGroup && enemyGroup.liberties === 1) {
          score += 60;
          if (enemyGroup.stones.length > 1) score += 200;
        }
      }
    });

    if (myNewGroup) {
      if (myNewGroup.liberties === 1) score -= 900;
      if (myNewGroup.liberties === 2) score -= 100;
      if (myNewGroup.liberties >= 4) score += 50;
    }

    score += evaluateShape(board, x, y, player) * 8;
    score += evaluatePositionStrength(x, y, size) * 3;

    if (myNewGroup) {
      let totalDist = 0;
      myNewGroup.stones.forEach((s: Point) =>
        (totalDist += Math.min(s.x, s.y, size - 1 - s.x, size - 1 - s.y))
      );
      const avgDist = totalDist / myNewGroup.stones.length;
      if (avgDist > 1.5 && avgDist < 4) score += 40;
    }

    if (difficulty === 'Easy') score += Math.random() * 50;
    else if (difficulty === 'Medium') score += Math.random() * 10;

    possibleMoves.push({ x, y, score });
  }

  possibleMoves.sort((a, b) => b.score - a.score);
  if (possibleMoves.length === 0) return null;

  const bestMove = possibleMoves[0];
  if (bestMove.score <= -500 && stoneCount > size * size * 0.6) return null;

  if (difficulty === 'Easy') {
    const topN = possibleMoves.slice(0, 3);
    const r = Math.random();
    if (r < 0.7 && topN[0]) return topN[0];
    if (r < 0.9 && topN[1]) return topN[1];
    return topN[topN.length - 1];
  }

  return bestMove;
};
