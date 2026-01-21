import { BoardState, Player, Point, Stone, Group, BoardSize, Difficulty, GameType } from '../types';

// --- 基础工具函数 ---
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

// [优化 1] 使用数字索引代替字符串 Key，大幅提升高频调用的性能
export const getGroup = (board: BoardState, start: Point): Group | null => {
  const size = board.length;
  const stone = board[start.y][start.x];
  if (!stone) return null;

  const color = stone.color;
  const group: Stone[] = [];
  // Optimization: use number set (y * size + x) instead of string set
  const visited = new Set<number>();
  const queue: Point[] = [start];
  const liberties = new Set<number>();

  // Init
  visited.add(start.y * size + start.x);

  while (queue.length > 0) {
    const current = queue.shift()!;
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
      // 保持接口兼容，还原回 Point 数组
      libertyPoints: Array.from(liberties).map(idx => ({
          x: idx % size,
          y: Math.floor(idx / size)
      }))
  };
};

export const getAllGroups = (board: BoardState): Group[] => {
  const size = board.length;
  const visited = new Set<number>(); // Optimization
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

const hashBoard = (board: BoardState): string => {
    // 字符串拼接对于 React Hook 依赖检查是必须的，保持不变
    let str = '';
    for(let y=0; y<board.length; y++) {
        for(let x=0; x<board.length; x++) {
            const s = board[y][x];
            str += s ? (s.color === 'black' ? 'B' : 'W') : '.';
        }
    }
    return str;
};

// --- 序列化/反序列化 (保持不变) ---
interface GameSnapshot {
    board: string[][];
    size: number;
    turn: Player;
    type: GameType;
    bCaps: number;
    wCaps: number;
}

export const serializeGame = (
    board: BoardState, currentPlayer: Player, gameType: GameType, bCaps: number, wCaps: number
): string => {
    const simpleBoard = board.map(row => row.map(cell => cell ? (cell.color === 'black' ? 'B' : 'W') : '.'));
    const snapshot: GameSnapshot = { board: simpleBoard, size: board.length, turn: currentPlayer, type: gameType, bCaps, wCaps };
    try { return btoa(JSON.stringify(snapshot)); } catch (e) { console.error(e); return ""; }
};

export const deserializeGame = (key: string): { 
    board: BoardState, currentPlayer: Player, gameType: GameType, boardSize: BoardSize, blackCaptures: number, whiteCaptures: number 
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
        return { board: newBoard, currentPlayer: snapshot.turn, gameType: snapshot.type, boardSize: snapshot.size as BoardSize, blackCaptures: snapshot.bCaps, whiteCaptures: snapshot.wCaps };
    } catch (e) { return null; }
};

// --- 核心落子逻辑 ---
export const attemptMove = (
  board: BoardState, x: number, y: number, player: Player, gameType: 'Go' | 'Gomoku' = 'Go', previousBoardStateHash: string | null = null
): { newBoard: BoardState; captured: number } | null => {
  if (board[y][x] !== null) return null;
  const size = board.length;
  
  // 浅拷贝 + 行拷贝优化
  // 注意：AI 模拟时这里是性能热点，但为了保证逻辑正确性（提子、劫争），
  // 完全的不可变数据结构是必要的。
  const safeBoard = board.map(row => row.map(s => s ? { ...s } : null));

  safeBoard[y][x] = { color: player, id: `${player}-${Date.now()}-${x}-${y}`, x, y };

  if (gameType === 'Gomoku') return { newBoard: safeBoard, captured: 0 };

  let capturedCount = 0;
  const opponent = player === 'black' ? 'white' : 'black';
  const neighbors = getNeighbors({ x, y }, size);

  neighbors.forEach(n => {
    const stone = safeBoard[n.y][n.x];
    if (stone && stone.color === opponent) {
      const group = getGroup(safeBoard, n);
      if (group && group.liberties === 0) {
        group.stones.forEach(s => {
          safeBoard[s.y][s.x] = null;
          capturedCount++;
        });
      }
    }
  });

  const myGroup = getGroup(safeBoard, { x, y });
  // 自杀禁手检查：如果在这个位置落子后没气，且没有提掉对方的子，则为非法
  if (myGroup && myGroup.liberties === 0 && capturedCount === 0) return null; 

  if (previousBoardStateHash) {
      const currentHash = hashBoard(safeBoard);
      if (currentHash === previousBoardStateHash) return null; // 简单的劫争检查
  }

  return { newBoard: safeBoard, captured: capturedCount };
};

export const checkGomokuWin = (board: BoardState, lastMove: {x: number, y: number} | null): boolean => {
  if (!lastMove) return false;
  const { x, y } = lastMove;
  const player = board[y][x]?.color;
  if (!player) return false;
  const size = board.length;
  const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (const [dx, dy] of directions) {
    let count = 1;
    let i = 1;
    while (true) {
      const nx = x + dx * i; const ny = y + dy * i;
      if (nx >= 0 && nx < size && ny >= 0 && ny < size && board[ny][nx]?.color === player) { count++; i++; } else break;
    }
    i = 1;
    while (true) {
      const nx = x - dx * i; const ny = y - dy * i;
      if (nx >= 0 && nx < size && ny >= 0 && ny < size && board[ny][nx]?.color === player) { count++; i++; } else break;
    }
    if (count >= 5) return true;
  }
  return false;
};

// [优化 2] 使用数字 Set 优化算分
export const calculateScore = (board: BoardState): { black: number, white: number } => {
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
        const regionQueue: Point[] = [{x, y}];
        visited.add(idx);
        let touchesBlack = false, touchesWhite = false;
        
        while(regionQueue.length > 0) {
           const p = regionQueue.shift()!;
           region.push(p);
           const neighbors = getNeighbors(p, size);
           for(const n of neighbors) {
              const nIdx = n.y * size + n.x;
              const nStone = board[n.y][n.x];
              
              if(nStone) {
                 if(nStone.color === 'black') touchesBlack = true;
                 if(nStone.color === 'white') touchesWhite = true;
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
  whiteScore += 7.5; // Komi
  return { black: blackScore, white: whiteScore };
};

export const calculateWinRate = (board: BoardState): number => {
    let stoneCount = 0;
    for(let y=0; y<board.length; y++) for(let x=0; x<board.length; x++) if (board[y][x]) stoneCount++;
    if (stoneCount < 10) return 50;
    const score = calculateScore(board);
    const diff = score.black - score.white; 
    const k = 0.12; 
    return (1 / (1 + Math.exp(-k * diff))) * 100;
};

// --- 增强版 AI 系统 ---

// [优化 3] 增加“真眼”识别，防止 AI 填自己的眼
const isSimpleEye = (board: BoardState, x: number, y: number, color: Player): boolean => {
    const size = board.length;
    // 1. 检查四周十字方向，如果不是自己的子或边缘，则不是眼
    const neighbors = getNeighbors({x, y}, size);
    for (const n of neighbors) {
        const s = board[n.y][n.x];
        if (!s || s.color !== color) return false;
    }
    
    // 2. 检查对角线，防止假眼
    // 规则：对于非边缘的眼，4个对角点至少要有3个是自己的子；边缘则适当放宽
    let corners = 0;
    let myCorners = 0;
    const diags = [[-1,-1], [-1,1], [1,-1], [1,1]];
    
    for (const [dx, dy] of diags) {
        const nx = x+dx, ny = y+dy;
        if (nx < 0 || nx >= size || ny < 0 || ny >= size) {
             // 棋盘外算作“保护”，计入 myCorners
             corners++;
             myCorners++;
        } else {
             corners++;
             const s = board[ny][nx];
             if (s && s.color === color) myCorners++;
        }
    }
    
    // 简单判定：如果有2个以上对角线不是自己的，可能是假眼，但为了安全，
    // 我们只保护非常确定的真眼（防止AI自杀），所以严格一点：
    // 如果是我方控制的角落少于3个，就不视为绝对安全的真眼（允许填）
    // 反之，如果是真眼，绝对不填。
    if (myCorners < 3) return false; 
    
    return true;
};

// 1. 候选点生成器
const getCandidateMoves = (board: BoardState, size: number, range: number = 2): Point[] => {
  const candidates = new Set<number>(); // Optimization
  const hasStones = board.some(row => row.some(s => s !== null));

  if (!hasStones) {
      const center = Math.floor(size / 2);
      const points = [{x: center, y: center}];
      if (size >= 9) {
          const offset = size >= 13 ? 3 : 2;
          points.push({x: offset, y: offset}, {x: size-1-offset, y: offset}, {x: offset, y: size-1-offset}, {x: size-1-offset, y: size-1-offset});
      }
      return points;
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (board[y][x] !== null) {
        for (let dy = -range; dy <= range; dy++) {
          for (let dx = -range; dx <= range; dx++) {
            const ny = y + dy;
            const nx = x + dx;
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
      for(let y=0; y<size; y++) for(let x=0; x<size; x++) if(!board[y][x]) all.push({x,y});
      return all;
  }
  return Array.from(candidates).map(idx => ({x: idx % size, y: Math.floor(idx / size)}));
};

// 2. 棋形评估
const evaluateShape = (board: BoardState, x: number, y: number, player: Player): number => {
  const size = board.length;
  let score = 0;
  const opponent = player === 'black' ? 'white' : 'black';

  // 1. 虎口/连接检测 (Tiger's Mouth / Connection)
  const diagonals = [
    {x: x-1, y: y-1}, {x: x+1, y: y-1},
    {x: x-1, y: y+1}, {x: x+1, y: y+1}
  ];
  let myStonesDiag = 0;
  diagonals.forEach(p => {
    if (p.x >= 0 && p.x < size && p.y >= 0 && p.y < size) {
      const stone = board[p.y][p.x];
      if (stone && stone.color === player) myStonesDiag++;
    }
  });
  if (myStonesDiag >= 2) score += 15; // 鼓励连接形状

  // 2. 扭羊头/切断检测 (Cut)
  const neighbors = getNeighbors({x, y}, size);
  let opponentStones = 0;
  neighbors.forEach(p => {
    const stone = board[p.y][p.x];
    if (stone && stone.color === opponent) opponentStones++;
  });
  if (opponentStones >= 2) score += 10; // 关键切断点

  return score;
};

// 3. 影响力/位置评分
const evaluatePositionStrength = (x: number, y: number, size: number): number => {
  if (size >= 13) {
    const dX = Math.min(x, size - 1 - x);
    const dY = Math.min(y, size - 1 - y);
    if ((dX === 2 || dX === 3) && (dY === 2 || dY === 3)) return 25; // 金角银边
    if (dX === 2 && dY === 4) return 20;
    if (dX === 0 || dY === 0) return -20; // 除非必要，少下断头路
    if (dX === 1 || dY === 1) return -5;  // 爬二路通常不好
  }
  const center = Math.floor(size / 2);
  const distToCenter = Math.abs(x - center) + Math.abs(y - center);
  return Math.max(0, 10 - distToCenter);
};

// 4. 五子棋评估核心 (Heuristics) - 保持不变
const evaluateGomokuDirection = (board: BoardState, x: number, y: number, dx: number, dy: number, player: Player): number => {
  let count = 0;
  let blockedStart = false; let blockedEnd = false;
  const size = board.length;

  for (let i = 1; i <= 4; i++) {
    const nx = x + dx * i; const ny = y + dy * i;
    if (nx < 0 || nx >= size || ny < 0 || ny >= size) { blockedEnd = true; break; }
    const stone = board[ny][nx];
    if (stone?.color === player) count++; else if (stone) { blockedEnd = true; break; } else break; 
  }
  for (let i = 1; i <= 4; i++) {
    const nx = x - dx * i; const ny = y - dy * i;
    if (nx < 0 || nx >= size || ny < 0 || ny >= size) { blockedStart = true; break; }
    const stone = board[ny][nx];
    if (stone?.color === player) count++; else if (stone) { blockedStart = true; break; } else break;
  }

  const total = count + 1;
  if (total >= 5) return 1000000;
  if (total === 4) {
      if (!blockedStart && !blockedEnd) return 50000; // 活四
      if (!blockedStart || !blockedEnd) return 5000;  // 冲四
  }
  if (total === 3) {
      if (!blockedStart && !blockedEnd) return 5000;  // 活三
      if (!blockedStart || !blockedEnd) return 500;   // 眠三
  }
  if (total === 2) {
      if (!blockedStart && !blockedEnd) return 500;   // 活二
      if (!blockedStart || !blockedEnd) return 50;
  }
  return 1;
};

const getGomokuScore = (board: BoardState, x: number, y: number, player: Player, opponent: Player, strict: boolean): number => {
    const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
    let attackScore = 0;
    let defenseScore = 0;

    for (const [dx, dy] of directions) {
        attackScore += evaluateGomokuDirection(board, x, y, dx, dy, player);
        defenseScore += evaluateGomokuDirection(board, x, y, dx, dy, opponent);
    }
    
    if (strict) {
        if (attackScore >= 50000) return 9999999; 
        if (defenseScore >= 50000) return 8000000;
        if (attackScore >= 5000) return 40000; 
        if (defenseScore >= 5000) return 30000;
    }
    return attackScore + defenseScore;
};

// 5. 五子棋 Minimax - 保持不变
const minimaxGomoku = (
    board: BoardState, depth: number, alpha: number, beta: number, isMaximizing: boolean, player: Player, lastMove: Point | null
): number => {
    if (lastMove && checkGomokuWin(board, lastMove)) {
        return isMaximizing ? -10000000 + depth : 10000000 - depth; 
    }
    if (depth === 0) return 0;

    const size = board.length;
    let candidates = getCandidateMoves(board, size);
    const opponent = player === 'black' ? 'white' : 'black';

    const scoredCandidates = candidates.map(move => {
        const score = getGomokuScore(board, move.x, move.y, isMaximizing ? player : opponent, isMaximizing ? opponent : player, true);
        return { move, score };
    });

    scoredCandidates.sort((a, b) => b.score - a.score);
    const topCandidates = scoredCandidates.slice(0, 8).map(sc => sc.move);

    if (isMaximizing) {
        let maxEval = -Infinity;
        for (const move of topCandidates) {
            board[move.y][move.x] = { color: player, x: move.x, y: move.y, id: 'sim' };
            const score = getGomokuScore(board, move.x, move.y, player, opponent, true);
            if (score >= 9000000) { board[move.y][move.x] = null; return score; }

            const val = minimaxGomoku(board, depth - 1, alpha, beta, false, player, move);
            const totalVal = score + val * 0.8; 

            board[move.y][move.x] = null;
            maxEval = Math.max(maxEval, totalVal);
            alpha = Math.max(alpha, totalVal);
            if (beta <= alpha) break;
        }
        return maxEval;
    } else {
        let minEval = Infinity;
        for (const move of topCandidates) {
            board[move.y][move.x] = { color: opponent, x: move.x, y: move.y, id: 'sim' };
            const score = getGomokuScore(board, move.x, move.y, opponent, player, true);
            if (score >= 9000000) { board[move.y][move.x] = null; return -score; }

            const val = minimaxGomoku(board, depth - 1, alpha, beta, true, player, move);
            const totalVal = -score + val * 0.8;

            board[move.y][move.x] = null;
            minEval = Math.min(minEval, totalVal);
            beta = Math.min(beta, totalVal);
            if (beta <= alpha) break;
        }
        return minEval;
    }
};


// --- 主入口 ---
export const getAIMove = (
  board: BoardState,
  player: Player,
  gameType: GameType,
  difficulty: Difficulty,
  previousBoardHash: string | null
): Point | null | 'RESIGN' => {
  const size = board.length;
  const opponent = player === 'black' ? 'white' : 'black';

  // === 五子棋 AI ===
  if (gameType === 'Gomoku') {
    const candidates = getCandidateMoves(board, size);
    if (candidates.length === 0) return null;

    if (difficulty === 'Easy') {
      let bestScore = -Infinity;
      let bestMoves: Point[] = [];
      for (const move of candidates) {
       let score = getGomokuScore(board, move.x, move.y, player, opponent, false);
       score += Math.random() * 500;
       if (score > bestScore) { bestScore = score; bestMoves = [move]; }
       else if (Math.abs(score - bestScore) < 10) bestMoves.push(move);
      }
      return bestMoves[Math.floor(Math.random() * bestMoves.length)];
    }

    if (difficulty === 'Medium') {
      let bestScore = -Infinity;
      let bestMoves: Point[] = [];
      for (const move of candidates) {
       const score = getGomokuScore(board, move.x, move.y, player, opponent, true);
       if (score > bestScore) { bestScore = score; bestMoves = [move]; }
       else if (score === bestScore) bestMoves.push(move);
      }
      return bestMoves[Math.floor(Math.random() * bestMoves.length)];
    }

    if (difficulty === 'Hard') {
      let bestScore = -Infinity;
      let bestMoves: Point[] = [];
      const sortedMoves = candidates.map(m => ({
        move: m,
        score: getGomokuScore(board, m.x, m.y, player, opponent, true)
      })).sort((a, b) => b.score - a.score);
      const topMoves = sortedMoves.slice(0, 6).map(i => i.move);

      for (const move of topMoves) {
        board[move.y][move.x] = { color: player, x: move.x, y: move.y, id: 'sim' };
        if (checkGomokuWin(board, move)) { board[move.y][move.x] = null; return move; }
        const val = minimaxGomoku(board, 3, -Infinity, Infinity, false, player, move);
        const baseScore = getGomokuScore(board, move.x, move.y, player, opponent, true);
        const finalScore = baseScore + val;
        board[move.y][move.x] = null;

        if (finalScore > bestScore) {
          bestScore = finalScore;
          bestMoves = [move];
        } else if (Math.abs(finalScore - bestScore) < 1) {
          bestMoves.push(move);
        }
      }
      return bestMoves.length > 0 ? bestMoves[0] : candidates[0];
    }
  }

  // === 围棋 AI (本地) ===
  let possibleMoves: { x: number; y: number; score: number }[] = [];

  for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    if (board[y][x] !== null) continue;

    // [优化] 如果确定是真眼，直接跳过，防止自杀式填眼
    if (isSimpleEye(board, x, y, player)) continue;

    const sim = attemptMove(board, x, y, player, 'Go', previousBoardHash);
    if (!sim) continue;

    const myNewGroup = getGroup(sim.newBoard, { x, y });
    // 如果下完这步棋，自己的气是 0 (自杀)，attemptMove 已经处理返回 null，但双重保险
    if (myNewGroup && myNewGroup.liberties === 0 && sim.captured === 0) continue;

    let score = 0;

    // A. 吃子 (最高优先级)
    if (sim.captured > 0) {
      score += 1000 + sim.captured * 50;
    }

    // B. 叫吃/打吃
    const neighbors = getNeighbors({x, y}, size);
    neighbors.forEach(n => {
      if (board[n.y][n.x]?.color === opponent) {
        const enemyGroup = getGroup(sim.newBoard, n);
        if (enemyGroup && enemyGroup.liberties === 1) {
          score += 200;
        }
      }
    });

    // C. 逃生/防守
    // 如果原本只有1口气，现在变多了，加分
    if (myNewGroup && myNewGroup.liberties >= 3) score += 20;
    // 如果下完只有2口气，有点危险，减分
    if (myNewGroup && myNewGroup.liberties === 2) score -= 10;
    // 如果下完只有1口气，且没吃到子，非常危险（可能是愚型）
    if (myNewGroup && myNewGroup.liberties === 1 && sim.captured === 0) score -= 50;

    // D. 棋形与位置
    score += evaluateShape(board, x, y, player);
    score += evaluatePositionStrength(x, y, size);

    // E. 随机扰动 (避免 AI 每次走棋都一样)
    if (difficulty === 'Easy') {
      score += Math.random() * 200;
    } else if (difficulty === 'Medium') {
      score += Math.random() * 30;
    }

    possibleMoves.push({ x, y, score });
  }
  }

  possibleMoves.sort((a, b) => b.score - a.score);
  if (possibleMoves.length === 0) return null; // 无处可下，停着

  if (difficulty === 'Easy') {
    // 简单模式：在前5好的点里随机选
    const topN = possibleMoves.slice(0, 5);
    return topN[Math.floor(Math.random() * topN.length)];
  }

  return possibleMoves[0];
};