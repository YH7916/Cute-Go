import { BoardState, Player, Point, Stone, Group, BoardSize, Difficulty, GameType } from '../types';

// --- GTP Coordinate Utilities for KataGo ---

// GTP 协议中，坐标 I 被跳过以避免与 1 混淆
const GTP_COLUMNS = "ABCDEFGHJKLMNOPQRST"; 

/**
 * 将前端坐标 (x, y) 转换为 GTP 坐标 (例如: "D4", "Q16")
 * 前端: (0,0) 是左上角
 * GTP: A1 通常是左下角 (但也取决于引擎配置，标准 GTP 是左下角为 1)
 * 这里我们采用标准：行号 = BoardSize - y
 */
export const toGTPCoordinate = (x: number, y: number, boardSize: number): string => {
  if (x < 0 || x >= boardSize || y < 0 || y >= boardSize) return 'PASS';
  
  const colChar = GTP_COLUMNS[x];
  // y=0 是最上面一行 (例如 19路棋盘的第19行)
  const rowNum = boardSize - y; 
  
  return `${colChar}${rowNum}`;
};

/**
 * 将 GTP 坐标 (例如: "R16") 解析回前端坐标 {x, y}
 */
export const fromGTPCoordinate = (gtp: string, boardSize: number): {x: number, y: number} | null => {
  const s = gtp.trim().toUpperCase();
  
  if (s === 'PASS' || s === 'RESIGN') return null;
  
  // 处理可能的 "Genmove Error" 等异常字符串
  if (s.length < 2) return null;

  const colChar = s[0];
  const rowStr = s.slice(1);
  
  const x = GTP_COLUMNS.indexOf(colChar);
  if (x === -1) return null; // 无效列
  
  const rowNum = parseInt(rowStr, 10);
  if (isNaN(rowNum)) return null;

  // 转换回 0-indexed 的 y 轴
  const y = boardSize - rowNum;

  if (x < 0 || x >= boardSize || y < 0 || y >= boardSize) return null;
  
  return { x, y };
};

// --- 基本围棋逻辑 ---
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

// 获取有意义的候选移动点（只看棋子周围 2 格范围内的空位 + 星位）
const getCandidateMoves = (board: BoardState, size: number): Point[] => {
  const candidates = new Set<string>();
  const hasStones = board.some(row => row.some(s => s !== null));

  // 如果棋盘是空的，只返回天元和星位 (优化开局)
  if (!hasStones) {
      const center = Math.floor(size / 2);
      const points = [{x: center, y: center}];
      if (size >= 9) { // 添加星位
          const offset = size >= 13 ? 3 : 2;
          points.push({x: offset, y: offset}, {x: size-1-offset, y: offset}, 
                      {x: offset, y: size-1-offset}, {x: size-1-offset, y: size-1-offset});
      }
      return points;
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (board[y][x] !== null) {
        // 遍历该棋子周围 2 格范围
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
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

  return Array.from(candidates).map(s => {
      const [x, y] = s.split(',').map(Number);
      return {x, y};
  });
};

// 简单的局面评估函数
const evaluateBoardGomoku = (board: BoardState, player: Player): number => {
    // 这里复用你现有的 getGomokuScore 逻辑，但要计算总分差
    // 简化版：遍历所有点，计算 (MyScore - OpponentScore)
    // 注意：为了性能，这里最好不要复用太重的逻辑，或者只评估有棋子的区域
    const size = board.length;
    let score = 0;
    const opponent = player === 'black' ? 'white' : 'black';
    
    // 简单采样评估（实际项目中需要更高效的评估）
    for(let y=0; y<size; y++){
        for(let x=0; x<size; x++){
            if(board[y][x]) continue; // 只评估空位的潜力
            // 这里为了简化，我们假设评估函数的开销是可控的
            // 实际上应该只计算最后落子点的影响
        }
    }
    return Math.random(); // 占位，下文 Minimax 会用到具体的 evaluateGomokuDirection
};

// Alpha-Beta 搜索 (递归)
const minimax = (
    board: BoardState, 
    depth: number, 
    alpha: number, 
    beta: number, 
    isMaximizing: boolean,
    player: Player,
    lastMove: Point
): number => {
    const opponent = player === 'black' ? 'white' : 'black';
    
    // 1. 检查游戏结束或达到深度
    if (checkGomokuWin(board, lastMove)) {
        return isMaximizing ? -100000 + depth : 100000 - depth; // 越快赢分越高
    }
    if (depth === 0) {
        // 静态评估：这里直接利用你现有的 getGomokuScore 逻辑
        // 注意：getGomokuScore 是针对单点评估的，这里我们需要一个简单的局面分
        // 作为一个轻量级 AI，我们简化为：评估上一手棋的价值
        return isMaximizing 
            ? getGomokuScore(board, lastMove.x, lastMove.y, opponent, player, 'Hard') 
            : -getGomokuScore(board, lastMove.x, lastMove.y, player, opponent, 'Hard');
    }

    const candidates = getCandidateMoves(board, board.length);
    // 排序 candidates 以优化剪枝效率（可选）
    
    if (isMaximizing) {
        let maxEval = -Infinity;
        for (const move of candidates) {
            board[move.y][move.x] = { color: player, x: move.x, y: move.y, id: 'temp' }; // 模拟落子 (不深拷贝)
            const evalScore = minimax(board, depth - 1, alpha, beta, false, player, move);
            board[move.y][move.x] = null; // 回溯
            maxEval = Math.max(maxEval, evalScore);
            alpha = Math.max(alpha, evalScore);
            if (beta <= alpha) break;
        }
        return maxEval;
    } else {
        let minEval = Infinity;
        for (const move of candidates) {
            board[move.y][move.x] = { color: opponent, x: move.x, y: move.y, id: 'temp' };
            const evalScore = minimax(board, depth - 1, alpha, beta, true, player, move);
            board[move.y][move.x] = null;
            minEval = Math.min(minEval, evalScore);
            beta = Math.min(beta, evalScore);
            if (beta <= alpha) break;
        }
        return minEval;
    }
};

export const getAIMove = (
  board: BoardState, 
  player: Player, 
  gameType: 'Go' | 'Gomoku',
  difficulty: Difficulty,
  previousBoardHash: string | null
): Point | null | 'RESIGN' => {
  const size = board.length;
  
  // 1. 优化：获取候选点 (Candidate Pruning)
  // 极大减少循环次数，解决发热问题
  let candidates = getCandidateMoves(board, size);
  
  // 如果没有候选点（虽然前面处理了，防万一），则随机
  if (candidates.length === 0) {
      const allMoves: Point[] = [];
      for(let y=0; y<size; y++) for(let x=0; x<size; x++) if(!board[y][x]) allMoves.push({x,y});
      if (allMoves.length === 0) return null;
      return allMoves[Math.floor(Math.random() * allMoves.length)];
  }

  // --- GOMOKU 逻辑升级 (Minimax) ---
  if (gameType === 'Gomoku') {
      if (difficulty === 'Easy') {
          return candidates[Math.floor(Math.random() * candidates.length)];
      }

      // 如果是 Hard 模式，使用浅层 Minimax (深度 2，即自己一步，对手一步)
      // 深度太深在 JS 线程会卡死，建议 2 或 3
      if (difficulty === 'Hard' || difficulty === 'Medium') {
          const searchDepth = 2; 
          let bestVal = -Infinity;
          let bestMoves: Point[] = [];
          const opponent = player === 'black' ? 'white' : 'black';

          // 第一层循环
          for (const move of candidates) {
              // 模拟落子 (直接修改数组，比 deep clone 快 100 倍)
              board[move.y][move.x] = { color: player, x: move.x, y: move.y, id: 'temp' };
              
              // 检查这一步是否直接获胜
              if (checkGomokuWin(board, move)) {
                  board[move.y][move.x] = null; // 回溯
                  return move; // 直接赢
              }

              // 进入递归评估
              // 注意：这里传入的是 minimize (因为轮到对手了)
              const moveVal = minimax(board, searchDepth - 1, -Infinity, Infinity, false, player, move);
              
              // 回溯
              board[move.y][move.x] = null;

              if (moveVal > bestVal) {
                  bestVal = moveVal;
                  bestMoves = [move];
              } else if (moveVal === bestVal) {
                  bestMoves.push(move);
              }
          }
          return bestMoves.length > 0 ? bestMoves[Math.floor(Math.random() * bestMoves.length)] : candidates[0];
      }
  }

  // --- 围棋逻辑优化 (保留启发式，但应用候选点剪枝) ---
  
  // 围棋依然使用原来的加权逻辑，但循环范围从全图变成了 candidates
  // 这解决了性能问题。
  
  let bestMove: Point | null = null;
  let maxWeight = -Infinity;
  const opponent = player === 'black' ? 'white' : 'black';

  for (const move of candidates) {
      // 简单的眼位检查
      if (isEye(board, move.x, move.y, player)) continue;

      // 这里依然需要 attemptMove，因为它涉及提子逻辑，比较复杂
      // 但由于 candidates 数量少了很多，性能是可以接受的
      const sim = attemptMove(board, move.x, move.y, player, 'Go', previousBoardHash);
      if (!sim) continue;

      let weight = Math.random() * 10; 

      // --- 增强 AI 逻辑：增加对"征子"和"断点"的敏感度 ---
      
      // 1. 吃子权重 (大幅提高)
      if (sim.captured > 0) {
          weight += 200 + (sim.captured * 30);
      }

      // 2. 逃生权重 (检测自己是否处于 Atari 状态)
      const myGroup = getGroup(sim.newBoard, move);
      if (myGroup) {
          if (myGroup.liberties === 1) {
              // 除非是打劫或反提，否则不要下气紧的地方
              if (sim.captured === 0) weight -= 500; // 找死
          } else if (myGroup.liberties >= 3) {
              weight += 20; // 气延展
          }
      }

      // 3. 进攻权重 (让对手气变紧)
      const neighbors = getNeighbors(move, size);
      neighbors.forEach(n => {
          const s = board[n.y][n.x];
          if (s && s.color === opponent) {
              const g = getGroup(board, n);
              if (g && g.liberties === 2) {
                  // 对手只有2口气，我贴上去，对手变1口气 (叫吃)
                  weight += 60; 
              }
          }
      });
      
      // 4. 布局权重 (金角银边草肚皮)
      if (size >= 9 && difficulty === 'Hard') {
          const distToEdgeX = Math.min(move.x, size - 1 - move.x);
          const distToEdgeY = Math.min(move.y, size - 1 - move.y);
          if (distToEdgeX >= 2 && distToEdgeX <= 4 && distToEdgeY >= 2 && distToEdgeY <= 4) {
              weight += 15;
          }
      }

      if (weight > maxWeight) {
          maxWeight = weight;
          bestMove = move;
      }
  }

  return bestMove || candidates[Math.floor(Math.random() * candidates.length)];
};