import { BoardState, Player, Point, Stone, Group, BoardSize, Difficulty, GameType } from '../types';
import { getAIConfig } from './aiConfig';

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

export const getBoardHash = (board: BoardState): string => {
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
  
  // 浅拷贝优化：由于 Stone 对象在逻辑中通常视为不可变（只会被替换或移除，不会修改其属性），
  // 我们可以只复制棋盘的行数组结构，而不需要复制每个棋子对象。
  // 这将大幅减少内存分配和垃圾回收压力。
  const safeBoard = board.map(row => [...row]);

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
      const currentHash = getBoardHash(safeBoard);
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

// [优化] 计算启发式分数（不仅看地盘，还看棋子安全性与潜力）
const calculateHeuristicScore = (board: BoardState): { black: number, white: number } => {
    const size = board.length;
    let blackScore = 0, whiteScore = 0;
    const visited = new Set<number>();
    const allGroups = getAllGroups(board);

    // 1. 基础地盘分（Territory）
    const territoryScore = calculateScore(board);
    blackScore += territoryScore.black;
    whiteScore += territoryScore.white;

    // 2. 棋子安全性修正 (Group Safety)
    allGroups.forEach(group => {
        const isBlack = group.stones[0].color === 'black';
        const numStones = group.stones.length;
        
        // 惩罚：气太少（不稳定）
        if (group.liberties === 1) {
            // 极度危险，可以说是死棋（除非是打劫或杀气，这里做静态悲观估计）
            // 扣除掉这些子的价值，甚至倒扣
            if (isBlack) blackScore -= numStones * 1.5; 
            else whiteScore -= numStones * 1.5;
        } else if (group.liberties === 2) {
            // 危险
            if (isBlack) blackScore -= numStones * 0.5;
            else whiteScore -= numStones * 0.5;
        } else if (group.liberties >= 5) {
            // 奖励：气长（厚势）
            if (isBlack) blackScore += 2;
            else whiteScore += 2;
        }

        // 3. 影响力修正 (Influence - 仅在开局/中局有效)
        // 鼓励占据星位和天元附近
        group.stones.forEach(s => {
             const distToCenter = Math.abs(s.x - size / 2) + Math.abs(s.y - size / 2);
             const normalizedDist = distToCenter / (size / 2); // 0 (center) ~ 1 (edge)
             
             // 中心区域（影响力）加分，但在边缘（实地）通常已经被 territoryScore 算进去了
             // 所以这里只给中间的子一点“潜力分”
             if (normalizedDist < 0.6) {
                 if (isBlack) blackScore += 0.2;
                 else whiteScore += 0.2;
             }
        });
    });

    return { black: blackScore, white: whiteScore };
};

export const calculateWinRate = (board: BoardState): number => {
    let stoneCount = 0;
    const size = board.length;
    const totalPoints = size * size;
    for(let y=0; y<size; y++) for(let x=0; x<size; x++) if (board[y][x]) stoneCount++;
    
    // 开局阶段（小于5%手），不确定性极大，强制接近 50%
    // if (stoneCount < totalPoints * 0.05) return 50; // Removed hard limit to allow subtle heuristics to show

    const fillRatio = stoneCount / totalPoints;
    const heuristic = calculateHeuristicScore(board);
    const diff = heuristic.black - heuristic.white; 

    // K 值动态调整：
    // 开局 (fill=0.1) -> k 小 (0.08) -> 分数差距对胜率影响小（还早）
    // 终局 (fill=0.9) -> k 大 (0.25) -> 分数差距即使小，胜率也倾斜大（基本定型）
    const baseK = 0.08;
    const endK = 0.35;
    const k = baseK + (endK - baseK) * (fillRatio * fillRatio); // 平方曲线，中盘才开始变陡

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
      // 9x9 天元
      if (size <= 9) return [{x: center, y: center}];
      
      // 13x13 或 19x19 推荐星位
      const points: Point[] = [];
      const offset = size >= 19 ? 3 : 3; // 19路或13路都通常在4线(index 3)或3线
      // 传统星位 (4线)
      points.push(
          {x: 3, y: 3}, {x: size-4, y: 3}, 
          {x: 3, y: size-4}, {x: size-4, y: size-4}
      );
      // 加上天元
      points.push({x: center, y: center});
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
      // 极罕见情况：棋盘满了或者只有无气的子？
      // 回退到遍历所有空点
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

// 4. 五子棋评估核心 (Heuristics)
// 权重调整：活三其实比冲四危险，因为活三下一步能变活四（无解），而冲四下一步变五（必须堵，但堵住就没事）
// Revised Weights:
// Win (5): 100,000,000
// Live 4: 10,000,000 (Game Over unless already 5)
// Dead 4: 1,000,000 (Must block)
// Live 3: 800,000 (Dangerous, turns into Live 4)
// Dead 3: 50,000
// Live 2: 10,000
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
  const isBlocked = blockedStart || blockedEnd;
  const isCap = blockedStart && blockedEnd;

  if (total >= 5) return 100000000;
  if (total === 4) {
      if (!isBlocked) return 10000000; // 活四
      if (!isCap) return 1000000;      // 冲四 (还有一头空)
      return 0; // 死四 (两头都被堵，没用)
  }
  if (total === 3) {
      if (!isBlocked) return 800000;   // 活三
      if (!isCap) return 50000;        // 眠三 (有一头空)
      return 0;
  }
  if (total === 2) {
      if (!isBlocked) return 10000;    // 活二
      if (!isCap) return 1000;
      return 0;
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
    
    // 进攻是最好的防守，但也必须防守对方的必杀
    // 如果我们要评估“这一步有多好”，不仅看攻击力，还要看它是否阻止了对方的胜利
    if (strict) {
        // 必杀：我已经成5
        if (attackScore >= 50000000) return 100000000; 
        
        // 救命：对方下一步要成5，或者已经是活4，必须堵
        // 原逻辑 defenseScore >= 50000 (Live 4) 
        if (defenseScore >= 8000000) return 50000000; // 必须防守

        // 强攻：我有活4 (对方必须堵我)
        if (attackScore >= 8000000) return 40000000; 

        // 防守冲四：对方有冲四，虽然不是必死，但如果不理会可能变活四
        if (defenseScore >= 500000) return 20000000;
    }
    return attackScore + defenseScore; // 综合分
};

// 5. 五子棋 Minimax (Improved)
const minimaxGomoku = (
    board: BoardState, depth: number, alpha: number, beta: number, isMaximizing: boolean, player: Player, lastMove: Point | null
): number => {
    // 终局状态检查
    if (lastMove && checkGomokuWin(board, lastMove)) {
        // 越快赢分越高，越晚输分越低
        return isMaximizing ? -1000000000 + depth : 1000000000 - depth; 
    }
    if (depth === 0) return 0;

    const size = board.length;
    // 限制搜索范围：只搜索有棋子的邻域
    let candidates = getCandidateMoves(board, size, 2); 
    const opponent = player === 'black' ? 'white' : 'black';

    // Move Ordering: 先算高分点，利于 Alpha-Beta 剪枝
    const scoredCandidates = candidates.map(move => {
         // 使用快速评估 (Strict=true)
        const score = getGomokuScore(board, move.x, move.y, isMaximizing ? player : opponent, isMaximizing ? opponent : player, true);
        return { move, score };
    });

    // 排序：高分在前
    scoredCandidates.sort((a, b) => b.score - a.score);
    
    // 只取前 6 个最好的点进行深搜 (Width Pruning)
    // 如果是第一层(最高层)，可以稍微多看几个，深层则少看
    const beamWidth = depth > 2 ? 8 : 5;
    const topCandidates = scoredCandidates.slice(0, beamWidth).map(sc => sc.move);

    if (isMaximizing) {
        let maxEval = -Infinity;
        for (const move of topCandidates) {
            board[move.y][move.x] = { color: player, x: move.x, y: move.y, id: 'sim' };
            
            // 立即检查是否获胜，如果是，直接返回（不用递归了）
            if (checkGomokuWin(board, move)) {
                 board[move.y][move.x] = null;
                 return 1000000000 - (10 - depth); // Prefer faster win
            }

            const val = minimaxGomoku(board, depth - 1, alpha, beta, false, player, move);
            
            // 加上位置分作为微调，防止在必胜/必输之外的地方乱走
            const positionalScore = getGomokuScore(board, move.x, move.y, player, opponent, false) * 0.01;
            const totalVal = val + positionalScore;

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
            
            if (checkGomokuWin(board, move)) {
                board[move.y][move.x] = null;
                return -1000000000 + (10 - depth);
            }

            const val = minimaxGomoku(board, depth - 1, alpha, beta, true, player, move);
            
            const positionalScore = getGomokuScore(board, move.x, move.y, opponent, player, false) * 0.01;
            const totalVal = val - positionalScore;

            board[move.y][move.x] = null;
            minEval = Math.min(minEval, totalVal);
            beta = Math.min(beta, totalVal);
            if (beta <= alpha) break;
        }
        return minEval;
    }
};

// --- Go Minimax (New) ---
// 简单的 2层 Minimax，用于围棋局部战斗
const evaluateGoBoard = (board: BoardState, player: Player, simResult: NonNullable<ReturnType<typeof attemptMove>>): number => {
    let score = 0;
    const size = board.length;
    
    // 1. 提子 (Huge value)
    if (simResult.captured > 0) score += 5000 + simResult.captured * 200;

    // 2. 气数变化
    // （这里需要比较复杂的判断，简单处理：如果我的气非常少，扣分）
    // （在 attemptMove 外面判断可能更准，但这里只能根据 newBoard 判）
    // 暂时略过复杂的全盘气数计算，太慢
    
    return score;
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

  // Use new config system
  const config = getAIConfig(difficulty);
  
  // If rank is high enough (e.g. 9k+), we prefer WebAI (handled by App.tsx logic).
  // But if App.tsx calls this function, it means WebAI is unavailable OR rank is low (Local).
  // If we are here, we are running Local JS Logic.
  
  // Apply randomness based on rank
  const randomFactor = config.randomness; // 0.8 for 18k, 0.05 for 9k

  // === 五子棋 AI ===
  if (gameType === 'Gomoku') {
    const candidates = getCandidateMoves(board, size);
    if (candidates.length === 0) return null;

    // Easy & Medium 保持原来的逻辑，但使用新的 getGomokuScore 可能会变强一点点
    if (difficulty === 'Easy') {
      let bestScore = -Infinity;
      let bestMoves: Point[] = [];
      for (const move of candidates) {
       let score = getGomokuScore(board, move.x, move.y, player, opponent, false);
       score += Math.random() * 2000; // 增加随机性
       if (score > bestScore) { bestScore = score; bestMoves = [move]; }
       else if (Math.abs(score - bestScore) < 500) bestMoves.push(move);
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
      // 先用静态评分筛选出 Top 10
      const sortedMoves = candidates.map(m => ({
        move: m,
        score: getGomokuScore(board, m.x, m.y, player, opponent, true)
      })).sort((a, b) => b.score - a.score);
      const topMoves = sortedMoves.slice(0, 10).map(i => i.move);

      for (const move of topMoves) {
        // 模拟落子
        board[move.y][move.x] = { color: player, x: move.x, y: move.y, id: 'sim' };
        
        // 只有 Hard 模式才会搜索 4 层 (我方-敌方-我方-敌方)
        // 这样可以看出双活三等杀招
        const val = minimaxGomoku(board, 4, -Infinity, Infinity, false, player, move);
        
        // 加上基础分，倾向于即便搜索不到杀招，也要走好形
        const baseScore = getGomokuScore(board, move.x, move.y, player, opponent, true) * 0.1;
        const finalScore = val + baseScore;
        
        board[move.y][move.x] = null;

        if (finalScore > bestScore) {
          bestScore = finalScore;
          bestMoves = [move];
        } else if (Math.abs(finalScore - bestScore) < 10) {
          bestMoves.push(move);
        }
      }
      return bestMoves.length > 0 ? bestMoves[0] : candidates[0];
    }
  }

  // === 围棋 AI (本地) ===
  const possibleMoves: { x: number; y: number; score: number }[] = [];
  const candidates = getCandidateMoves(board, size, 2); 

  // Resign Check:
  // If we have played enough moves (>30% of board) and we are losing by HUGE margin, resign.
  // Using calculateWinRate for this check.
  const winRate = calculateWinRate(board);
  const totalSpots = size * size;
  let stoneCount = 0;
  for(let r=0; r<size; r++) for(let c=0; c<size; c++) if(board[r][c]) stoneCount++;
  
  if (difficulty !== 'Easy' && stoneCount > totalSpots * 0.3) {
      // 检查当前的比分差距
      const heuristic = calculateHeuristicScore(board);
      const isBlack = player === 'black'; // AI color
      const scoreDiff = isBlack ? (heuristic.black - heuristic.white) : (heuristic.white - heuristic.black);
      
      // 如果落后超过 35 目，且棋盘比较满，投降
      // 或者如果落后超过 50 目，直接投降
      if (scoreDiff < -50 || (scoreDiff < -35 && stoneCount > totalSpots * 0.6)) {
          return 'RESIGN';
      }
  }

  for (const move of candidates) {
    const { x, y } = move;
    
    // 真眼保护
    if (isSimpleEye(board, x, y, player)) continue;

    // 1. 我方尝试落子
    const sim = attemptMove(board, x, y, player, 'Go', previousBoardHash);
    if (!sim) continue;
    const myNewGroup = getGroup(sim.newBoard, { x, y });
    if (myNewGroup && myNewGroup.liberties === 0 && sim.captured === 0) continue; // 自杀检测

    let score = 0;

    // --- 基础评估 (Level 0) ---
    // A. 吃子
    if (sim.captured > 0) score += 2000 + sim.captured * 150;
    
    // B. 叫吃检测 (Atari) - 提升权重
    const neighbors = getNeighbors({x, y}, size);
    neighbors.forEach(n => {
       const stone = board[n.y][n.x];
       if (stone && stone.color === opponent) {
           const enemyGroup = getGroup(sim.newBoard, n);
           if (enemyGroup && enemyGroup.liberties === 1) score += 800; // 制造叫吃 (was 300) -> Aggression Up
       }
    });

    // C. 自身安全 (Safety) - 提升权重
    if (myNewGroup) {
        if (myNewGroup.liberties === 1) score -= 800; // 除非为了吃子，否则极力避免被叫吃
        if (myNewGroup.liberties >= 3) score += 100;   // 长气
    }

    // D. 棋形 (Shape)
    score += evaluateShape(board, x, y, player) * 2; // 提升棋形权重 (Cut, Tiger)
    score += evaluatePositionStrength(x, y, size);

    // --- 进阶评估 (Level 1: Opponent Response) ---
    // 现在 Medium 和 Hard 都启用这一层，增加计算深度
    if (difficulty === 'Hard' || difficulty === 'Medium') {
       const localResponses = getCandidateMoves(sim.newBoard, size, 2); 
       let minOpponentOutcome = 0; 
       let bestOpponentMoves = [];
       for (const opMove of localResponses) {
           if (sim.newBoard[opMove.y][opMove.x]) continue; 
           const opSim = attemptMove(sim.newBoard, opMove.x, opMove.y, opponent, 'Go', null);
           if (!opSim) continue;
           
           let opScore = 0;
           if (opSim.captured > 0) opScore += 5000; 
           const opNewGroup = getGroup(opSim.newBoard, {x: opMove.x, y: opMove.y});
           const myGroupAfterOpStr = getGroup(opSim.newBoard, {x, y});
           if (myGroupAfterOpStr && myGroupAfterOpStr.liberties === 1) opScore += 1200; // 怕被对方叫吃

           if (opScore > 50) bestOpponentMoves.push({move: opMove, score: opScore});
       }

       bestOpponentMoves.sort((a,b) => b.score - a.score);
       const topOp = bestOpponentMoves.slice(0, 1);
       if (topOp.length > 0) {
           score -= topOp[0].score; 
       }
    }

    // E. 随机扰动 (大幅降低)
    if (difficulty === 'Easy') score += Math.random() * 150; // was 300
    // Medium 不再加随机扰动，或者加极少
    else if (difficulty === 'Medium') score += Math.random() * 20;

    possibleMoves.push({ x, y, score });
  }

  possibleMoves.sort((a, b) => b.score - a.score);
  
  if (possibleMoves.length === 0) return null;
  const bestMove = possibleMoves[0];

  // Pass Logic Check:
  // 如果最佳的一步棋分数很低（负分或极低分），说明没棋下了，不如停着
  // 但为了防止过早停着，我们要求这种状态至少持续几步，或者分数非常低
  // 简单判定：如果最佳得分 <= 0 且此时不是终局打劫状态，则停着
  // [Fix] 提高停着门槛：棋盘满了 60% 后才考虑停着，防止中盘突然停着引发强制结算
  if (bestMove.score <= 0 && stoneCount > size * size * 0.6) {
       return null; 
  }

  if (difficulty === 'Easy') {
    // Top 5 random
    const topN = possibleMoves.slice(0, 5);
    return topN[Math.floor(Math.random() * topN.length)];
  }

  return bestMove;
};

// --- SGF Export ---
// --- SGF Export ---
export const generateSGF = (
    history: { board: BoardState, currentPlayer: Player, lastMove: {x:number,y:number}|null }[],
    boardSize: number,
    komi: number = 7.5,
    initialStones: {x: number, y: number, color: Player}[] = []
): string => {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    let sgf = `(;GM[1]FF[4]CA[UTF-8]AP[CuteGo:1.0]ST[2]\n`;
    sgf += `RU[Chinese]SZ[${boardSize}]KM[${komi}]\n`;
    sgf += `DT[${date}]PW[White]PB[Black]GN[CuteGo Game]\n`;

    // Coordinates mapping: 0->a, 1->b (SGF does NOT skip 'i')
    const toSgfCoord = (c: number) => String.fromCharCode(97 + c);

    // [Fix] Export Initial Stones (Handicap/Setup)
    if (initialStones.length > 0) {
        let ab = "";
        let aw = "";
        initialStones.forEach(s => {
            const coord = toSgfCoord(s.x) + toSgfCoord(s.y);
            if (s.color === 'black') ab += `[${coord}]`;
            else aw += `[${coord}]`;
        });
        if (ab) sgf += `AB${ab}`;
        if (aw) sgf += `AW${aw}`;
        sgf += "\n";
    }

    history.forEach((h, index) => {
        // [Fix] History stores 'Next Player' (who is about to move). 
        // So the move h.lastMove was made by the Opponent.
        // If h.currentPlayer is 'black', it means White just moved.
        const color = h.currentPlayer === 'black' ? 'W' : 'B';
        let moveStr = "";
        
        if (h.lastMove) {
             moveStr = toSgfCoord(h.lastMove.x) + toSgfCoord(h.lastMove.y);
             sgf += `;${color}[${moveStr}]`;
        } else {
             // Skip null moves (setup nodes)
        }
    });

    sgf += ")";
    return sgf;
};

// --- SGF Import ---
export const parseSGF = (sgf: string): { 
    board: BoardState, currentPlayer: Player, gameType: GameType, boardSize: BoardSize, 
    blackCaptures: number, whiteCaptures: number, history: any[], komi: number,
    initialStones: {x: number, y: number, color: Player}[] 
} | null => {
    try {
        // 1. Basic Metadata
        const szMatch = sgf.match(/SZ\[(\d+)\]/);
        const size = szMatch ? parseInt(szMatch[1]) : 19;
        const komiMatch = sgf.match(/KM\[([\d.]+)\]/);
        const komi = komiMatch ? parseFloat(komiMatch[1]) : 7.5;
        
        let board = createBoard(size);
        let currentPlayer: Player = 'black'; // Default start
        const history: any[] = [];
        let blackCaptures = 0;
        let whiteCaptures = 0;
        let consectivePasses = 0;
        const initialStones: {x: number, y: number, color: Player}[] = [];

        // 2. Setup Stones (AB/AW)
        // Matches AB[aa][bb]...
        const abMatch = sgf.match(/AB((?:\[[a-z]{2}\])+)/);
        if (abMatch) {
            const coords = abMatch[1].match(/\[([a-z]{2})\]/g);
            coords?.forEach(c => {
                const s = c.replace(/[\[\]]/g, '');
                const x = s.charCodeAt(0) - 97;
                const y = s.charCodeAt(1) - 97;
                if (x >= 0 && x < size && y >= 0 && y < size) {
                    board[y][x] = { color: 'black', x, y, id: `setup-b-${x}-${y}` };
                    initialStones.push({x, y, color: 'black'});
                }
            });
        }
        const awMatch = sgf.match(/AW((?:\[[a-z]{2}\])+)/);
        if (awMatch) {
            const coords = awMatch[1].match(/\[([a-z]{2})\]/g);
            coords?.forEach(c => {
                const s = c.replace(/[\[\]]/g, '');
                const x = s.charCodeAt(0) - 97;
                const y = s.charCodeAt(1) - 97;
                if (x >= 0 && x < size && y >= 0 && y < size) {
                    board[y][x] = { color: 'white', x, y, id: `setup-w-${x}-${y}` };
                    initialStones.push({x, y, color: 'white'});
                }
            });
        }

        // 3. Moves Main Loop
        const moveRegex = /;([BW])\[([a-z]{0,2})\]/g;
        let match;
        
        while ((match = moveRegex.exec(sgf)) !== null) {
            const colorCode = match[1]; // B or W
            const coordStr = match[2]; // aa or empty
            const player = colorCode === 'B' ? 'black' : 'white';
            
            if (!coordStr || coordStr === "" || coordStr === "tt" && size <= 19) {
                // PASS
                // [Fix] Store NEXT Player in history context to match App.tsx logic
                const nextPlayer = player === 'black' ? 'white' : 'black';
                 history.push({ 
                    board: board, 
                    currentPlayer: nextPlayer, 
                    lastMove: null,
                    blackCaptures, whiteCaptures, consecutivePasses: consectivePasses + 1 
                });
                consectivePasses++;
                currentPlayer = nextPlayer;
                continue;
            }

            const x = coordStr.charCodeAt(0) - 97;
            const y = coordStr.charCodeAt(1) - 97;

            // Execute Move
            if (x >= 0 && x < size && y >= 0 && y < size) {
                const result = attemptMove(board, x, y, player, 'Go'); // Assuming Go for SGF
                if (result) {
                    board = result.newBoard;
                    if (player === 'black') blackCaptures += result.captured;
                    else whiteCaptures += result.captured;
                    
                    const nextPlayer = player === 'black' ? 'white' : 'black';

                    history.push({
                        board: board,
                        currentPlayer: nextPlayer, 
                        lastMove: {x, y},
                        blackCaptures, whiteCaptures, consecutivePasses: 0
                    });
                    consectivePasses = 0;
                    currentPlayer = nextPlayer;
                }
            }
        }

        return {
            board,
            currentPlayer,
            gameType: 'Go', // SGF is usually Go
            boardSize: size as BoardSize,
            blackCaptures,
            whiteCaptures,
            history,
            komi,
            initialStones
        };

    } catch (e) {
        console.error("SGF Parse Failed", e);
        return null;
    }
};