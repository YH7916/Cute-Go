import { BoardState, Player, Point, Stone, Group, BoardSize, Difficulty } from '../types';

export const createBoard = (size: number): BoardState => {
  return Array(size).fill(null).map(() => Array(size).fill(null));
};

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
  const visited = new Set<string>();
  const queue: Point[] = [start];
  const liberties = new Set<string>();

  visited.add(`${start.x},${start.y}`);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentStone = board[current.y][current.x];
    if (currentStone) group.push(currentStone);

    const neighbors = getNeighbors(current, size);
    for (const n of neighbors) {
      const neighborKey = `${n.x},${n.y}`;
      const neighborStone = board[n.y][n.x];

      if (!neighborStone) {
        liberties.add(neighborKey);
      } else if (neighborStone.color === color && !visited.has(neighborKey)) {
        visited.add(neighborKey);
        queue.push(n);
      }
    }
  }

  return { stones: group, liberties: liberties.size };
};

export const getAllGroups = (board: BoardState): Group[] => {
  const size = board.length;
  const visited = new Set<string>();
  const groups: Group[] = [];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const key = `${x},${y}`;
      if (board[y][x] && !visited.has(key)) {
        const group = getGroup(board, { x, y });
        if (group) {
          group.stones.forEach(s => visited.add(`${s.x},${s.y}`));
          groups.push(group);
        }
      }
    }
  }
  return groups;
};

export const attemptMove = (
  board: BoardState, 
  x: number, 
  y: number, 
  player: Player,
  gameType: 'Go' | 'Gomoku' = 'Go'
): { newBoard: BoardState; captured: number } | null => {
  if (board[y][x] !== null) return null;

  const size = board.length;
  const nextBoard = board.map(row => row.map(s => s ? { ...s } : null));
  nextBoard[y][x] = { color: player, id: `${player}-${Date.now()}-${x}-${y}`, x, y };

  if (gameType === 'Gomoku') {
    return { newBoard: nextBoard, captured: 0 };
  }

  let capturedCount = 0;
  const opponent = player === 'black' ? 'white' : 'black';
  const neighbors = getNeighbors({ x, y }, size);

  neighbors.forEach(n => {
    const stone = nextBoard[n.y][n.x];
    if (stone && stone.color === opponent) {
      const group = getGroup(nextBoard, n);
      if (group && group.liberties === 0) {
        group.stones.forEach(s => {
          nextBoard[s.y][s.x] = null;
          capturedCount++;
        });
      }
    }
  });

  const myGroup = getGroup(nextBoard, { x, y });
  if (myGroup && myGroup.liberties === 0) {
    return null; // Suicide is illegal
  }

  return { newBoard: nextBoard, captured: capturedCount };
};

export const checkGomokuWin = (board: BoardState, lastMove: {x: number, y: number}): boolean => {
  const { x, y } = lastMove;
  const player = board[y][x]?.color;
  if (!player) return false;
  const size = board.length;

  const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];

  for (const [dx, dy] of directions) {
    let count = 1;
    let i = 1;
    while (true) {
      const nx = x + dx * i;
      const ny = y + dy * i;
      if (nx >= 0 && nx < size && ny >= 0 && ny < size && board[ny][nx]?.color === player) {
        count++; i++;
      } else break;
    }
    i = 1;
    while (true) {
      const nx = x - dx * i;
      const ny = y - dy * i;
      if (nx >= 0 && nx < size && ny >= 0 && ny < size && board[ny][nx]?.color === player) {
        count++; i++;
      } else break;
    }
    if (count >= 5) return true;
  }
  return false;
};

// Simple territory calculation for scoring
export const calculateScore = (board: BoardState): { black: number, white: number } => {
  const size = board.length;
  let blackScore = 0;
  let whiteScore = 0;
  const visited = new Set<string>();

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const key = `${x},${y}`;
      if (visited.has(key)) continue;

      const stone = board[y][x];
      if (stone) {
        if (stone.color === 'black') blackScore++;
        else whiteScore++;
        visited.add(key);
      } else {
        const region: Point[] = [];
        const regionQueue: Point[] = [{x, y}];
        visited.add(key);
        let touchesBlack = false;
        let touchesWhite = false;

        while(regionQueue.length > 0) {
           const p = regionQueue.shift()!;
           region.push(p);
           const neighbors = getNeighbors(p, size);
           
           for(const n of neighbors) {
              const nKey = `${n.x},${n.y}`;
              const nStone = board[n.y][n.x];
              if(nStone) {
                 if(nStone.color === 'black') touchesBlack = true;
                 if(nStone.color === 'white') touchesWhite = true;
              } else if (!visited.has(nKey)) {
                 visited.add(nKey);
                 regionQueue.push(n);
              }
           }
        }
        if (touchesBlack && !touchesWhite) blackScore += region.length;
        if (touchesWhite && !touchesBlack) whiteScore += region.length;
      }
    }
  }
  whiteScore += 7.5; // Komi
  return { black: blackScore, white: whiteScore };
};

export const calculateWinRate = (board: BoardState): number => {
    const score = calculateScore(board);
    const diff = score.black - score.white; // + means Black leads
    // Use a sigmoid-like function to map point difference to win percentage (0-100)
    // A difference of ~20 points is roughly 95% win rate
    const k = 0.15; 
    return (1 / (1 + Math.exp(-k * diff))) * 100;
};

// --- Advanced AI Logic ---

// Helper: Check if a spot is a true eye for a color (Prevent AI from filling it)
const isEye = (board: BoardState, x: number, y: number, color: Player): boolean => {
    const size = board.length;
    const neighbors = getNeighbors({x, y}, size);
    // All ortho neighbors must be same color
    const orthoCheck = neighbors.every(n => board[n.y][n.x]?.color === color);
    if (!orthoCheck) return false;

    // Diagonals check (simplified: if 3+ diagonals are enemy/empty for edge, it's not a real eye, but for AI heuristic simply protecting surrounded spots is enough)
    return true;
}

// Helper: Gomoku evaluation
const evaluateGomokuLine = (board: BoardState, x: number, y: number, dx: number, dy: number, player: Player): number => {
  let count = 0;
  let openEnds = 0;
  const size = board.length;

  for (let i = 1; i <= 4; i++) {
    const nx = x + dx * i;
    const ny = y + dy * i;
    if (nx < 0 || nx >= size || ny < 0 || ny >= size) break;
    const stone = board[ny][nx];
    if (stone?.color === player) count++;
    else if (!stone) { openEnds++; break; }
    else break; 
  }
  
  for (let i = 1; i <= 4; i++) {
    const nx = x - dx * i;
    const ny = y - dy * i;
    if (nx < 0 || nx >= size || ny < 0 || ny >= size) break;
    const stone = board[ny][nx];
    if (stone?.color === player) count++;
    else if (!stone) { openEnds++; break; }
    else break;
  }

  if (count >= 4) return 10000;
  if (count === 3 && openEnds === 2) return 1000;
  if (count === 3 && openEnds === 1) return 100;
  if (count === 2 && openEnds === 2) return 80;
  
  return count * 10 + openEnds;
};

// "Third Party" AI Placeholder
const getHellMove = (board: BoardState, player: Player): Point | null => {
    // 1. Look for killing moves (Atari)
    const size = board.length;
    const validMoves: Point[] = [];
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (!board[y][x]) validMoves.push({ x, y });
        }
    }

    let bestMove: Point | null = null;
    let maxWeight = -Infinity;

    const opponent = player === 'black' ? 'white' : 'black';

    for (const move of validMoves) {
        if (isEye(board, move.x, move.y, player)) continue; // Don't fill eyes

        const result = attemptMove(board, move.x, move.y, player, 'Go');
        if (!result) continue; // Suicide check failed

        let weight = Math.random(); // Base random

        // A. Capture Weight
        if (result.captured > 0) {
            weight += result.captured * 50; 
        }

        // B. Save Self Weight (Check if we are in Atari)
        const myGroup = getGroup(result.newBoard, move);
        if (myGroup && myGroup.liberties === 1) {
            // Bad move, puts self in atari immediately
            weight -= 50; 
        } else if (myGroup && myGroup.liberties > 2) {
            // Good shape
            weight += 5;
        }

        // C. Cut Opponent
        const neighbors = getNeighbors(move, size);
        let opponentGroups = 0;
        neighbors.forEach(n => {
            if (board[n.y][n.x]?.color === opponent) opponentGroups++;
        });
        if (opponentGroups >= 2) weight += 15; // Cutting move

        // D. Edge/Corner preference (Golden lines)
        if (size > 9) {
            const dX = Math.min(move.x, size - 1 - move.x);
            const dY = Math.min(move.y, size - 1 - move.y);
            if ((dX === 2 || dX === 3) && (dY === 2 || dY === 3)) weight += 8;
        }

        // E. Prevent "Useless" moves inside own established territory
        // If all neighbors are friendly or empty-but-surrounded-by-friendly, lower weight
        const friendlyNeighbors = neighbors.filter(n => board[n.y][n.x]?.color === player).length;
        if (friendlyNeighbors === neighbors.length) weight -= 20; // Filling own space

        if (weight > maxWeight) {
            maxWeight = weight;
            bestMove = move;
        }
    }

    // If the best move is negative value (mostly filling own space), pass
    if (maxWeight < -10) return null;

    return bestMove;
};


export const getAIMove = (
  board: BoardState, 
  player: Player, 
  gameType: 'Go' | 'Gomoku',
  difficulty: Difficulty
): Point | null => {
  const size = board.length;
  const validMoves: Point[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!board[y][x]) validMoves.push({ x, y });
    }
  }
  if (validMoves.length === 0) return null;

  // --- GOMOKU AI ---
  if (gameType === 'Gomoku') {
    if (difficulty === 'Easy') return validMoves[Math.floor(Math.random() * validMoves.length)];

    const opponent = player === 'black' ? 'white' : 'black';
    let bestScore = -Infinity;
    let bestMoves: Point[] = [];

    for (const move of validMoves) {
      let score = 0;
      const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];

      // 1. Attack
      for (const [dx, dy] of directions) {
        score += evaluateGomokuLine(board, move.x, move.y, dx, dy, player);
      }

      // 2. Defense
      const defenseMultiplier = difficulty === 'Hard' || difficulty === 'Hell' ? 1.5 : 0.8; 
      let threatScore = 0;
      for (const [dx, dy] of directions) {
         threatScore += evaluateGomokuLine(board, move.x, move.y, dx, dy, opponent);
      }
      
      if (threatScore >= 5000) score += 20000; 
      else score += threatScore * defenseMultiplier;

      score += Math.random() * 5;

      if (score > bestScore) {
        bestScore = score;
        bestMoves = [move];
      } else if (Math.abs(score - bestScore) < 1) {
        bestMoves.push(move);
      }
    }
    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
  }

  // --- GO AI ---

  // HELL Mode: Simulating a stronger engine
  if (difficulty === 'Hell') {
      return getHellMove(board, player);
  }

  // Easy: Random but checks suicide
  if (difficulty === 'Easy') {
    const safeMoves = validMoves.filter(m => attemptMove(board, m.x, m.y, player, 'Go') !== null);
    // Even easy AI shouldn't fill eyes if possible
    const betterMoves = safeMoves.filter(m => !isEye(board, m.x, m.y, player));
    
    if (betterMoves.length > 0) return betterMoves[Math.floor(Math.random() * betterMoves.length)];
    return safeMoves.length > 0 ? safeMoves[Math.floor(Math.random() * safeMoves.length)] : null;
  }

  // Medium/Hard Logic
  
  let candidates = validMoves.filter(m => {
      const isSuicide = attemptMove(board, m.x, m.y, player, 'Go') === null;
      const fillsEye = isEye(board, m.x, m.y, player);
      return !isSuicide && !fillsEye;
  });
  
  if (candidates.length === 0) return null;

  // PRODUCTIVE MOVE CHECK
  // Filter out moves that are just filling own territory (basic check: all neighbors are friendly).
  const productiveMoves = candidates.filter(m => {
      const neighbors = getNeighbors(m, size);
      const friendlyCount = neighbors.filter(n => board[n.y][n.x]?.color === player).length;
      return friendlyCount < neighbors.length; // At least one empty or enemy neighbor
  });

  // LOGIC FIX: In Medium/Hard mode, if no productive moves exist (only Dame filling remains), 
  // do NOT pass immediately. Fallback to playing ANY valid move (Dame) to ensure the game finishes properly.
  // In Easy, we can be lazy and pass.
  let pool = productiveMoves;
  if (pool.length === 0) {
      // Since Easy/Hell return early, we are in Medium/Hard here.
      pool = candidates; // Play Dame/Neutral points
  }

  // If even candidates are empty (should be caught above, but safety check)
  if (pool.length === 0) return null;

  // 1. Check for Ataris (Save own or Capture enemy)
  for(const move of pool) {
     const sim = attemptMove(board, move.x, move.y, player, 'Go');
     if(sim && sim.captured > 0) return move;
     
     // Check saving self (simplistic: play near low liberty friendly stones)
     const neighbors = getNeighbors(move, size);
     for(const n of neighbors) {
         const s = board[n.y][n.x];
         if(s && s.color === player) {
             const g = getGroup(board, n);
             if(g && g.liberties === 1) {
                 if(sim && getGroup(sim.newBoard, move)!.liberties > 1) return move;
             }
         }
     }
  }

  // 2. Hard Mode Strategy: Edges and Corners
  if (difficulty === 'Hard') {
      const preferred = pool.filter(m => {
          const dX = Math.min(m.x, size - 1 - m.x);
          const dY = Math.min(m.y, size - 1 - m.y);
          return (dX >= 2 && dX <= 4) && (dY >= 2 && dY <= 4);
      });
      if(preferred.length > 0 && Math.random() > 0.4) {
          return preferred[Math.floor(Math.random() * preferred.length)];
      }
  }

  // Fallback: Contact moves
  const contactMoves = pool.filter(m => {
      const n = getNeighbors(m, size);
      return n.some(p => board[p.y][p.x] !== null);
  });
  
  if (contactMoves.length > 0) return contactMoves[Math.floor(Math.random() * contactMoves.length)];

  return pool[Math.floor(Math.random() * pool.length)];
};