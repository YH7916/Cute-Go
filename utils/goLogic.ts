import { BoardState, Player, Point, Stone, Group, BoardSize, Difficulty, GameType } from '../types';

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

// Simple board hash for Ko detection
const hashBoard = (board: BoardState): string => {
    let str = '';
    for(let y=0; y<board.length; y++) {
        for(let x=0; x<board.length; x++) {
            const s = board[y][x];
            str += s ? (s.color === 'black' ? 'B' : 'W') : '.';
        }
    }
    return str;
};

// --- Import / Export Logic ---
interface GameSnapshot {
    board: string[][]; // Simplified board for JSON
    size: number;
    turn: Player;
    type: GameType;
    bCaps: number;
    wCaps: number;
}

export const serializeGame = (
    board: BoardState, 
    currentPlayer: Player, 
    gameType: GameType,
    bCaps: number,
    wCaps: number
): string => {
    const simpleBoard = board.map(row => 
        row.map(cell => cell ? (cell.color === 'black' ? 'B' : 'W') : '.')
    );
    
    const snapshot: GameSnapshot = {
        board: simpleBoard,
        size: board.length,
        turn: currentPlayer,
        type: gameType,
        bCaps,
        wCaps
    };

    try {
        return btoa(JSON.stringify(snapshot));
    } catch (e) {
        console.error("Serialization failed", e);
        return "";
    }
};

export const deserializeGame = (key: string): { 
    board: BoardState, 
    currentPlayer: Player, 
    gameType: GameType,
    boardSize: BoardSize,
    blackCaptures: number,
    whiteCaptures: number 
} | null => {
    try {
        const jsonStr = atob(key);
        const snapshot: GameSnapshot = JSON.parse(jsonStr);
        
        if (!snapshot.board || !snapshot.size) return null;

        const newBoard: BoardState = snapshot.board.map((row, y) => 
            row.map((cell, x) => {
                if (cell === 'B') return { color: 'black', x, y, id: `imported-b-${x}-${y}-${Date.now()}` };
                if (cell === 'W') return { color: 'white', x, y, id: `imported-w-${x}-${y}-${Date.now()}` };
                return null;
            })
        );

        return {
            board: newBoard,
            currentPlayer: snapshot.turn,
            gameType: snapshot.type,
            boardSize: snapshot.size as BoardSize,
            blackCaptures: snapshot.bCaps,
            whiteCaptures: snapshot.wCaps
        };

    } catch (e) {
        console.error("Deserialization failed", e);
        return null;
    }
};

export const attemptMove = (
  board: BoardState, 
  x: number, 
  y: number, 
  player: Player,
  gameType: 'Go' | 'Gomoku' = 'Go',
  previousBoardStateHash: string | null = null
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

  // KO RULE CHECK
  if (previousBoardStateHash) {
      const currentHash = hashBoard(nextBoard);
      if (currentHash === previousBoardStateHash) {
          return null; // Illegal due to Ko (repeating position)
      }
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
    const diff = score.black - score.white; 
    const k = 0.15; 
    return (1 / (1 + Math.exp(-k * diff))) * 100;
};

// --- ADVANCED AI LOGIC ---

// Helper: Check if a spot is a real eye (very basic)
const isEye = (board: BoardState, x: number, y: number, color: Player): boolean => {
    const size = board.length;
    const neighbors = getNeighbors({x, y}, size);
    if (neighbors.length === 0) return false;
    // An eye must be surrounded by friendly stones
    const orthoCheck = neighbors.every(n => board[n.y][n.x]?.color === color);
    if (!orthoCheck) return false;
    return true;
}

// Gomoku: Enhanced pattern evaluation
const evaluateGomokuDirection = (board: BoardState, x: number, y: number, dx: number, dy: number, player: Player): number => {
  let count = 0;
  let blockedStart = false;
  let blockedEnd = false;
  const size = board.length;

  // Check forward
  for (let i = 1; i <= 4; i++) {
    const nx = x + dx * i;
    const ny = y + dy * i;
    if (nx < 0 || nx >= size || ny < 0 || ny >= size) { blockedEnd = true; break; }
    const stone = board[ny][nx];
    if (stone?.color === player) count++;
    else if (stone) { blockedEnd = true; break; }
    else break; 
  }
  
  // Check backward
  for (let i = 1; i <= 4; i++) {
    const nx = x - dx * i;
    const ny = y - dy * i;
    if (nx < 0 || nx >= size || ny < 0 || ny >= size) { blockedStart = true; break; }
    const stone = board[ny][nx];
    if (stone?.color === player) count++;
    else if (stone) { blockedStart = true; break; }
    else break;
  }

  // Count includes the hypothetical stone placed at x,y
  const total = count + 1;

  // Scoring Weights (Exponential for strict tiering)
  // Win
  if (total >= 5) return 100000;
  
  // 4 in a row
  if (total === 4) {
      if (!blockedStart && !blockedEnd) return 10000; // Live 4 (Unstoppable)
      if (!blockedStart || !blockedEnd) return 1000;  // Dead 4 (Must block)
  }
  
  // 3 in a row
  if (total === 3) {
      if (!blockedStart && !blockedEnd) return 1000; // Live 3 (Very dangerous)
      if (!blockedStart || !blockedEnd) return 100;  // Dead 3
  }
  
  // 2 in a row
  if (total === 2) {
      if (!blockedStart && !blockedEnd) return 100; // Live 2
      if (!blockedStart || !blockedEnd) return 10;
  }
  
  return 1;
};

// Gomoku: Score a position based on all 4 directions
const getGomokuScore = (board: BoardState, x: number, y: number, player: Player, opponent: Player, difficulty: Difficulty): number => {
    const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
    let attackScore = 0;
    let defenseScore = 0;

    for (const [dx, dy] of directions) {
        attackScore += evaluateGomokuDirection(board, x, y, dx, dy, player);
        defenseScore += evaluateGomokuDirection(board, x, y, dx, dy, opponent);
    }
    
    // In Hard mode, we prioritize defense slightly more if the opponent has a strong threat
    if (difficulty === 'Hard') {
        // If opponent has a winning move or a Live 4, blocking is top priority
        if (defenseScore >= 9000) return defenseScore * 1.2; 
        // If we have a win, take it
        if (attackScore >= 9000) return attackScore * 1.5;
        
        // Block Live 3s heavily
        if (defenseScore >= 900) return defenseScore * 1.1;
    } 
    // Medium Mode logic
    else if (difficulty === 'Medium') {
        if (defenseScore >= 5000) return defenseScore * 1.1;
    }

    return attackScore + defenseScore;
};

// --- MAIN AI FUNCTION ---

export const getAIMove = (
  board: BoardState, 
  player: Player, 
  gameType: 'Go' | 'Gomoku',
  difficulty: Difficulty,
  previousBoardHash: string | null
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
      if (difficulty === 'Easy') {
          // Pure randomness
          return validMoves[Math.floor(Math.random() * validMoves.length)];
      }

      const opponent = player === 'black' ? 'white' : 'black';
      let bestScore = -Infinity;
      let bestMoves: Point[] = [];

      // Determine error margin based on difficulty
      const errorMargin = difficulty === 'Medium' ? 100 : 0; // No error margin for Hard

      for (const move of validMoves) {
          // Optimization: Only check moves near existing stones (Radius 2)
          // For empty board, center is best.
          const hasNeighbor = validMoves.length > size*size - 1 ? false : (() => {
               for(let dy=-2; dy<=2; dy++) {
                   for(let dx=-2; dx<=2; dx++) {
                       if (dx===0 && dy===0) continue;
                       const ny = move.y + dy;
                       const nx = move.x + dx;
                       if(nx>=0 && nx<size && ny>=0 && ny<size && board[ny][nx]) return true;
                   }
               }
               return false;
          })();

          // First move logic
          if (validMoves.length >= size*size - 1) {
              if (move.x === Math.floor(size/2) && move.y === Math.floor(size/2)) return move;
          }

          if (!hasNeighbor && validMoves.length < size*size - 1) continue;

          let score = getGomokuScore(board, move.x, move.y, player, opponent, difficulty);
          
          // Positional Bias (Center is better)
          const distFromCenter = Math.abs(move.x - size/2) + Math.abs(move.y - size/2);
          score += (size - distFromCenter);

          // Fuzzy Logic for Medium
          if (difficulty === 'Medium') {
             score += (Math.random() * errorMargin);
          }

          if (score > bestScore) {
              bestScore = score;
              bestMoves = [move];
          } else if (Math.abs(score - bestScore) < 10) { // Keep moves with similar scores
              bestMoves.push(move);
          }
      }
      
      // If no strategic moves found (e.g. only distant valid moves), pick random
      if (bestMoves.length === 0) return validMoves[Math.floor(Math.random() * validMoves.length)];
      
      return bestMoves[Math.floor(Math.random() * bestMoves.length)];
  }

  // --- GO AI ---
  // Easy: Random valid moves (avoids suicide/eyes)
  if (difficulty === 'Easy') {
    const safeMoves = validMoves.filter(m => {
        const res = attemptMove(board, m.x, m.y, player, 'Go', previousBoardHash);
        if (!res) return false;
        return !isEye(board, m.x, m.y, player);
    });
    return safeMoves.length > 0 ? safeMoves[Math.floor(Math.random() * safeMoves.length)] : null;
  }

  // Medium & Hard: Weighted Heuristic Map
  // Factors: Captures, Saving Self (Atari), Corner/Side preference, Pattern weights
  let bestMove: Point | null = null;
  let maxWeight = -Infinity;

  const opponent = player === 'black' ? 'white' : 'black';

  for (const move of validMoves) {
      if (isEye(board, move.x, move.y, player)) continue;

      const sim = attemptMove(board, move.x, move.y, player, 'Go', previousBoardHash);
      if (!sim) continue;

      let weight = Math.random() * 10; // Baseline randomness

      // 1. TACTICAL: Capturing (High Priority)
      if (sim.captured > 0) {
          weight += 100 + (sim.captured * 20);
      }

      // 2. TACTICAL: Save Self (Atari) / Extension
      // Check neighbors for friendly groups in atari
      const neighbors = getNeighbors(move, size);
      let savesGroup = false;
      neighbors.forEach(n => {
          const s = board[n.y][n.x];
          if (s && s.color === player) {
              const g = getGroup(board, n);
              if (g && g.liberties === 1) {
                  // If placing here increases liberties of that group > 1, it's a save
                  const newSelfGroup = getGroup(sim.newBoard, move);
                  if (newSelfGroup && newSelfGroup.liberties > 1) {
                      weight += 80;
                      savesGroup = true;
                  }
              }
          }
      });

      // 3. TACTICAL: Atari Opponent (Medium Priority)
      if (difficulty === 'Hard') {
          neighbors.forEach(n => {
             const s = board[n.y][n.x];
             if (s && s.color === opponent) {
                 const g = getGroup(board, n);
                 if (g && g.liberties === 2) {
                     // Check if this move reduces them to 1 liberty (Atari)
                     // Note: We need to check the liberties on the NEW board, but simple check is:
                     // We placed a stone next to them, so we likely took a liberty.
                     weight += 25;
                 }
             }
          });
      }

      // 4. STRATEGIC: Pattern / Influence (Hard Only)
      if (difficulty === 'Hard') {
          // Corner preference (Star points)
          if (size >= 9) {
              const dX = Math.min(move.x, size - 1 - move.x);
              const dY = Math.min(move.y, size - 1 - move.y);
              // 3-3, 3-4, 4-4 points are gold in opening
              if ((dX === 2 || dX === 3) && (dY === 2 || dY === 3)) {
                  // Only boost if board is relatively empty nearby
                  const closeStones = neighbors.filter(n => board[n.y][n.x] !== null).length;
                  if (closeStones === 0) weight += 15;
              }
              // Avoid edges line 0 early game
              if (dX === 0 || dY === 0) weight -= 5;
          }
      }

      // 5. SAFETY: Don't self-atari unless necessary (stupid filter)
      const myNewGroup = getGroup(sim.newBoard, move);
      if (myNewGroup && myNewGroup.liberties === 1) {
          // Only play self-atari if it captured something (snapback logic handled in rule 1)
          // or if it connects to a safe group (handled in rule 2 check).
          // If neither, penalize heavily.
          if (sim.captured === 0 && !savesGroup) {
              weight -= 200; 
          }
      }

      // 6. CONTACT: Play near opponent stones (Medium/Hard)
      // Since difficulty 'Easy' returns early, we don't need to check for it here.
      const enemyNeighbors = neighbors.filter(n => board[n.y][n.x]?.color === opponent).length;
      if (enemyNeighbors > 0) weight += 5;

      if (weight > maxWeight) {
          maxWeight = weight;
          bestMove = move;
      }
  }

  return bestMove;
};