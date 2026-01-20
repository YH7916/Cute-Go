import { BoardState, Player, Point, Stone, Group, BoardSize, Difficulty, GameType } from '../types';

// --- 基础工具函数 (保持不变) ---
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

  return { 
      stones: group, 
      liberties: liberties.size,
      libertyPoints: Array.from(liberties).map(s => {
          const [x, y] = s.split(',').map(Number);
          return {x, y};
      })
  };
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

// --- 核心落子逻辑 (保持不变) ---
export const attemptMove = (
  board: BoardState, x: number, y: number, player: Player, gameType: 'Go' | 'Gomoku' = 'Go', previousBoardStateHash: string | null = null
): { newBoard: BoardState; captured: number } | null => {
  if (board[y][x] !== null) return null;
  const size = board.length;
  // 浅拷贝 + 行拷贝优化
  const nextBoard = [...board];
  nextBoard[y] = [...board[y]]; 
  // 注意：为了处理提子，我们需要更深的拷贝，或者只拷贝受影响的行。
  // 为安全起见，还是做全量 map 拷贝，但在 getAIMove 中我们会尽量少调用它。
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
  if (myGroup && myGroup.liberties === 0) return null; 

  if (previousBoardStateHash) {
      const currentHash = hashBoard(safeBoard);
      if (currentHash === previousBoardStateHash) return null;
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

export const calculateScore = (board: BoardState): { black: number, white: number } => {
  const size = board.length;
  let blackScore = 0, whiteScore = 0;
  const visited = new Set<string>();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const key = `${x},${y}`;
      if (visited.has(key)) continue;
      const stone = board[y][x];
      if (stone) {
        if (stone.color === 'black') blackScore++; else whiteScore++;
        visited.add(key);
      } else {
        const region: Point[] = [];
        const regionQueue: Point[] = [{x, y}];
        visited.add(key);
        let touchesBlack = false, touchesWhite = false;
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
  whiteScore += 7.5;
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

// 1. 候选点生成器 (Candidate Generator)
const getCandidateMoves = (board: BoardState, size: number, range: number = 2): Point[] => {
  const candidates = new Set<string>();
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
               candidates.add(`${nx},${ny}`);
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
  return Array.from(candidates).map(s => { const [x, y] = s.split(',').map(Number); return {x, y}; });
};

// 2. 围棋棋形评估 (Shape Analysis)
const evaluateGoShape = (board: BoardState, x: number, y: number, player: Player): number => {
    const size = board.length;
    let score = 0;
    
    // 简单的 3x3 模式匹配
    // 虎口检测 (Hanging connection / Tiger's mouth)
    // 长 (Extend)
    // 扳 (Hane)
    
    const opponent = player === 'black' ? 'white' : 'black';
    const neighbors = getNeighbors({x, y}, size);
    
    let friendly = 0;
    let enemy = 0;
    let empty = 0;

    neighbors.forEach(n => {
        const s = board[n.y][n.x];
        if (!s) empty++;
        else if (s.color === player) friendly++;
        else enemy++;
    });

    // 愚形惩罚 (Empty Triangle): 自己有2个邻居，且对角线也是自己，且形成了团状
    if (friendly >= 2) {
        // 简单检测：如果是实心的“团”，稍微扣分，鼓励舒展
        // 这里只是非常简化的逻辑
    }

    // 扳头奖励 (Hane at the head of two)
    // 如果紧贴着对方，且对方气紧，这是好棋
    if (enemy >= 1) {
        score += 5; // 接触战积极
    }
    
    // 连接奖励：如果这一步连接了两个原本不连通的己方棋块
    if (friendly >= 2) {
        score += 10;
    }

    return score;
};

const isEye = (board: BoardState, x: number, y: number, color: Player): boolean => {
    const size = board.length;
    const neighbors = getNeighbors({x, y}, size);
    if (neighbors.length === 0) return false;
    const orthoCheck = neighbors.every(n => board[n.y][n.x]?.color === color);
    if (!orthoCheck) return false;
    return true;
}

// 3. 五子棋评估核心 (Heuristics)
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
  // 评分权重优化：区分“活四”和“冲四”
  if (total >= 5) return 1000000;
  if (total === 4) {
      if (!blockedStart && !blockedEnd) return 50000; // 活四 (必胜)
      if (!blockedStart || !blockedEnd) return 5000;  // 冲四 (需要防守)
  }
  if (total === 3) {
      if (!blockedStart && !blockedEnd) return 5000;  // 活三 (威胁大)
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
        // 困难模式：大幅提高进攻和防守的关键权重
        if (attackScore >= 50000) return 9999999; // 自己能活四 -> 赢了
        if (defenseScore >= 50000) return 8000000; // 对方能活四 -> 必堵
        if (attackScore >= 5000) return 40000; // 自己能冲四/活三
        if (defenseScore >= 5000) return 30000; // 对方能冲四/活三
    }
    return attackScore + defenseScore; // 基础模式：攻守兼备
};

// 4. 五子棋 Minimax (带 Alpha-Beta 剪枝 + 启发式排序)
// 优化：增加了 moveOrdering (排序)，使得剪枝效率更高，允许更深层搜索
const minimaxGomoku = (
    board: BoardState, 
    depth: number, 
    alpha: number, 
    beta: number, 
    isMaximizing: boolean,
    player: Player,
    lastMove: Point | null
): number => {
    // 终局判断
    if (lastMove && checkGomokuWin(board, lastMove)) {
        return isMaximizing ? -10000000 + depth : 10000000 - depth; 
    }
    if (depth === 0) return 0;

    const size = board.length;
    let candidates = getCandidateMoves(board, size);
    const opponent = player === 'black' ? 'white' : 'black';

    // --- 启发式排序 (Beam Search 核心) ---
    // 为了搜得更深，我们只搜前 N 个最好的点，而不是所有点
    // 这能让深度从 2 提升到 4~6
    const scoredCandidates = candidates.map(move => {
        const score = getGomokuScore(board, move.x, move.y, isMaximizing ? player : opponent, isMaximizing ? opponent : player, true);
        return { move, score };
    });

    // 排序：高分在前
    scoredCandidates.sort((a, b) => b.score - a.score);

    // 剪枝宽度：每层只看前 8 个点 (大幅优化性能)
    const topCandidates = scoredCandidates.slice(0, 8).map(sc => sc.move);

    if (isMaximizing) {
        let maxEval = -Infinity;
        for (const move of topCandidates) {
            board[move.y][move.x] = { color: player, x: move.x, y: move.y, id: 'sim' };
            const score = getGomokuScore(board, move.x, move.y, player, opponent, true);
            
            // 立即获胜剪枝
            if (score >= 9000000) {
                 board[move.y][move.x] = null;
                 return score;
            }

            const val = minimaxGomoku(board, depth - 1, alpha, beta, false, player, move);
            // 结合当前评分和未来评分
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
            
            if (score >= 9000000) {
                board[move.y][move.x] = null;
                return -score;
            }

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
  gameType: 'Go' | 'Gomoku',
  difficulty: Difficulty,
  previousBoardHash: string | null
): Point | null | 'RESIGN' => {
  const size = board.length;
  // 获取候选点
  const candidates = getCandidateMoves(board, size);
  if (candidates.length === 0) return null;

  const opponent = player === 'black' ? 'white' : 'black';

  // === 五子棋 AI ===
  if (gameType === 'Gomoku') {
      // 简单：带噪声的贪心
      if (difficulty === 'Easy') {
          let bestScore = -Infinity;
          let bestMoves: Point[] = [];
          for (const move of candidates) {
             let score = getGomokuScore(board, move.x, move.y, player, opponent, false);
             score += Math.random() * 500; // 巨大噪声
             if (score > bestScore) { bestScore = score; bestMoves = [move]; }
             else if (Math.abs(score - bestScore) < 10) bestMoves.push(move);
          }
          return bestMoves[Math.floor(Math.random() * bestMoves.length)];
      }

      // 中等：纯贪心 (无噪声，防守严密)
      if (difficulty === 'Medium') {
          let bestScore = -Infinity;
          let bestMoves: Point[] = [];
          for (const move of candidates) {
             const score = getGomokuScore(board, move.x, move.y, player, opponent, true); // Strict Mode
             if (score > bestScore) { bestScore = score; bestMoves = [move]; }
             else if (score === bestScore) bestMoves.push(move);
          }
          return bestMoves[Math.floor(Math.random() * bestMoves.length)];
      }

      // 困难：Minimax 深度搜索 (Depth 4)
      if (difficulty === 'Hard') {
          let bestScore = -Infinity;
          let bestMoves: Point[] = [];
          
          // 预排序：先算一次贪心分，只对高分点进行 Minimax
          const sortedMoves = candidates.map(m => ({
              move: m,
              score: getGomokuScore(board, m.x, m.y, player, opponent, true)
          })).sort((a, b) => b.score - a.score);
          
          // 只取前 6 个点进行深度运算 (Beam Width = 6)
          const topMoves = sortedMoves.slice(0, 6).map(i => i.move);

          for (const move of topMoves) {
              board[move.y][move.x] = { color: player, x: move.x, y: move.y, id: 'sim' };
              if (checkGomokuWin(board, move)) { board[move.y][move.x] = null; return move; } // 绝杀
              
              // 搜索深度 3 (即: 我下 -> 对手回 -> 我再下 -> 对手再回评估)
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

  // === 围棋 AI ===
  
  // 投降逻辑 (仅中困难)
  if (difficulty !== 'Easy') {
       let occupiedCount = 0;
       for(let y=0; y<size; y++) for(let x=0; x<size; x++) if(board[y][x]) occupiedCount++;
       if (occupiedCount > (size * size) * 0.5) {
           const score = calculateScore(board);
           const diff = player === 'black' ? score.black - score.white : score.white - score.black;
           if (diff < -30) return 'RESIGN';
       }
  }

  let bestMove: Point | null = null;
  let maxWeight = -Infinity;

  for (const move of candidates) {
      if (isEye(board, move.x, move.y, player)) continue;

      // 模拟落子 (Depth 1)
      const sim = attemptMove(board, move.x, move.y, player, 'Go', previousBoardHash);
      if (!sim) continue;

      let weight = Math.random() * 5; 

      // 1. 吃子 (Capture) - 权重极高
      if (sim.captured > 0) weight += 100 + (sim.captured * 25);

      // 2. 逃生 (Save Self)
      const myNewGroup = getGroup(sim.newBoard, move);
      const neighbors = getNeighbors(move, size);
      
      let selfAtari = false;
      if (myNewGroup && myNewGroup.liberties === 1) selfAtari = true;

      // 检查这一步是否救活了原本只有1口气的队友
      let savedAlly = false;
      neighbors.forEach(n => {
          const s = board[n.y][n.x];
          if (s && s.color === player) {
              const gOld = getGroup(board, n);
              if (gOld && gOld.liberties === 1 && myNewGroup && myNewGroup.liberties > 1) {
                  weight += 80;
                  savedAlly = true;
              }
          }
      });

      // 3. 送吃检查 (Snapback / Ladder check simplified)
      // 如果这一步让自己变成了 1 口气 (Self-Atari)，且没有吃到子，也没有救活谁 -> 这是送死
      if (selfAtari && sim.captured === 0 && !savedAlly) {
          // 困难模式下，坚决不送死；简单模式可能会犯傻
          if (difficulty === 'Hard') weight -= 1000;
          else if (difficulty === 'Medium') weight -= 200;
      }

      // --- 进阶策略 (Medium / Hard) ---
      if (difficulty !== 'Easy') {
          // 4. 进攻 (Atari Opponent)
          neighbors.forEach(n => {
             const s = board[n.y][n.x];
             if (s && s.color === opponent) {
                 const g = getGroup(board, n);
                 if (g && g.liberties === 2) {
                     // 这一步把对手打成1口气
                     weight += 40;
                 }
             }
          });
          
          // 5. 棋形奖励 (Shape)
          const shapeScore = evaluateGoShape(board, move.x, move.y, player);
          weight += shapeScore;
      }

      // --- 专家策略 (Hard Only) ---
      if (difficulty === 'Hard') {
          // 6. 布局理论 (Fuseki)
          if (size >= 9) {
              const dX = Math.min(move.x, size - 1 - move.x);
              const dY = Math.min(move.y, size - 1 - move.y);
              // 金角银边草肚皮
              // 优先占角 (3-3, 3-4, 4-4)
              if ((dX === 2 || dX === 3) && (dY === 2 || dY === 3)) {
                   const nearby = neighbors.filter(n => board[n.y][n.x] !== null).length;
                   // 只有当周围空旷时才去占角，避免战斗中脱先
                   if (nearby === 0) weight += 30;
              }
              // 极力避免爬一路线 (死亡线)
              if (dX === 0 || dY === 0) weight -= 50;
          }
          
          // 7. 倒扑检测 (Snapback Lookahead)
          // 如果我这步棋虽然是自杀(1气)，但是能反杀对方(造成对方也0气)?
          // 这里的 sim.captured 已经处理了提子。
          // 如果提子后，自己的气数还是1? 
          if (sim.captured > 0 && myNewGroup && myNewGroup.liberties === 1) {
              // 这种情况叫“打劫”或者“倒扑”成功后还没活净
              // 稍微加分，鼓励尝试
              weight += 20; 
          }
      }

      if (weight > maxWeight) {
          maxWeight = weight;
          bestMove = move;
      }
  }

  return bestMove || candidates[Math.floor(Math.random() * candidates.length)];
};