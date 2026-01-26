import { BoardState, Player, Point, Stone, Group, BoardSize, Difficulty, GameType } from '../types';
import { getAIConfig } from './aiConfig';
import { getJosekiMove } from './joseki';

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

// --- Gomoku Win Rate (Heuristic) ---
export const calculateGomokuWinRate = (board: BoardState): number => {
    const size = board.length;
    let maxBlackThreat = 0;
    let maxWhiteThreat = 0;

    // Scan for highest threat for both sides
    for(let y=0; y<size; y++) {
        for(let x=0; x<size; x++) {
            if (!board[y][x]) {
                const bVal = getGomokuShapeScore(board, x, y, 'black');
                if (bVal > maxBlackThreat) maxBlackThreat = bVal;
                
                const wVal = getGomokuShapeScore(board, x, y, 'white');
                if (wVal > maxWhiteThreat) maxWhiteThreat = wVal;
            }
        }
    }
    
    // Immediate Win Checks
    if (maxBlackThreat >= 100000000) return 100;
    if (maxWhiteThreat >= 100000000) return 0;
    
    // Open 4 Checks (Virtually Win)
    if (maxBlackThreat >= 10000000) return 99;
    if (maxWhiteThreat >= 10000000) return 1;
    
    // Heuristic Diff
    const diff = maxBlackThreat - maxWhiteThreat;
    
    // Sigmoid scaling: Open 3 (100,000) should shift significantly
    const k = 0.00002; 
    const probability = 1 / (1 + Math.exp(-k * diff));
    
    return probability * 100;
};

// [New] Smart Scoring: Remove dead stones based on AI ownership
// Ownership: Positive = Black, Negative = White. Range -1 to 1.
// Threshold: > 0.5 (Confirmed Black), < -0.5 (Confirmed White).
export const cleanBoardWithTerritory = (board: BoardState, territory: Float32Array): BoardState => {
    const size = board.length;
    // Deep Clone to avoid mutating game state
    const newBoard = board.map(row => row.map(s => s ? { ...s } : null));

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const idx = y * size + x;
            const owner = territory[idx];
            const stone = newBoard[y][x];

            if (stone) {
                // If Stone is Black, but Owner is White (< -0.5) -> Dead
                if (stone.color === 'black' && owner < -0.5) {
                     newBoard[y][x] = null; // Remove dead black stone
                }
                // If Stone is White, but Owner is Black (> 0.5) -> Dead
                else if (stone.color === 'white' && owner > 0.5) {
                     newBoard[y][x] = null; // Remove dead white stone
                }
            }
        }
    }
    return newBoard;
};

// --- 增强版 AI 系统 ---

// [优化 3] 增加“真眼”识别，防止 AI 填自己的眼
const isSimpleEye = (board: BoardState, x: number, y: number, color: Player): boolean => {
    const size = board.length;
    // 1. 检查四周十字方向
    const neighbors = getNeighbors({x, y}, size);
    for (const n of neighbors) {
        const s = board[n.y][n.x];
        // 必须全是自己的子，或者边缘墙壁（但也得有子支撑）
        // 简单策略：如果十字方向有空点，或者有对方子，绝对不是眼
        if (!s || s.color !== color) return false;
    }
    
    // 2. 检查对角线 (X shape)
    // 真眼判定：
    // 非边缘点：至少3个对角是自己的子（或墙壁不算？通常墙壁算保护）
    // 墙边点：至少所有在盘内的对角都是自己的子？
    // 简化：统计 4 个对角中“非己方占据”的数量（空或敌）。
    // 如果这个数量 > 1 (即 >=2)，则是假眼。 <= 1 是真眼。
    // （对于边缘点，盘外算“占据/保护”，所以只看盘内）
    
    let badDiagonals = 0;
    const diags = [[-1,-1], [-1,1], [1,-1], [1,1]];
    
    for (const [dx, dy] of diags) {
        const nx = x+dx, ny = y+dy;
        if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
             const s = board[ny][nx];
             if (!s || s.color !== color) badDiagonals++;
        }
        // Off-board counts as "Good" (Protected by edge), so we don't increment badDiagonals
    }
    
    if (badDiagonals > 1) return false; // 假眼
    
    return true; 
};

// 1. 候选点生成器
const getCandidateMoves = (board: BoardState, size: number, range: number = 2): Point[] => {
  const candidates = new Set<number>(); // Optimization
  const hasStones = board.some(row => row.some(s => s !== null));

  // 总是添加关键的大场点（星位、三三），防止只在局部纠缠
  // 即使有子了，这些点如果是空的，也应该是候选（Tenuki）
  if (size >= 9) {
      const margin = size >= 13 ? 3 : 2; // 19x19 -> 3(4th line), 9x9 -> 2(3rd line)
      const points = [
          {x: margin, y: margin}, 
          {x: size-1-margin, y: margin},
          {x: margin, y: size-1-margin},
          {x: size-1-margin, y: size-1-margin},
          // 边星 (Side stars for 19路) - Optional
          {x: Math.floor(size/2), y: Math.floor(size/2)} // Center
      ];
      points.forEach(p => {
          if (!board[p.y][p.x]) candidates.add(p.y * size + p.x);
      });
  }

  if (!hasStones) {
      // First move logic handled above (Center + Stars added)
      // Just ensure we return them
      if (candidates.size > 0) 
        return Array.from(candidates).map(idx => ({x: idx % size, y: Math.floor(idx / size)}));
      
      const center = Math.floor(size / 2);
      return [{x: center, y: center}];
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
      // Fallback
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
  let myStones = 0;
  neighbors.forEach(p => {
    const stone = board[p.y][p.x];
    if (stone) {
        if (stone.color === opponent) opponentStones++;
        if (stone.color === player) myStones++;
    }
  });

  if (opponentStones >= 2 && myStones >= 1) score += 15; // 切断点 (was 10)

  // 3. [New] 跳/长 (Jump/Extend)
  // 检查是否与己方棋子构成一间跳或二间跳
  // 一间跳: (x, y) -> (x+2, y) 是己方，且 (x+1, y) 是空 (Simple check)
  const jumpDirs = [[2,0], [-2,0], [0,2], [0,-2]];
  for(const [dx, dy] of jumpDirs) {
      const tx = x + dx, ty = y + dy;
      const mx = x + dx/2, my = y + dy/2;
      if (tx>=0 && tx<size && ty>=0 && ty<size) {
           const target = board[ty][tx];
           const mid = board[my][mx];
           if (target && target.color === player && !mid) {
               score += 8; // 一间跳好形
           }
      }
  }

  // 4. [New] 愚形惩罚 (Empty Triangle & Heavy Shape)
  // shape: At (x,y), check if we form empty triangle with existing stones.
  if (myStones >= 3) {
      // 检查我的气 (Liberties)
      // 如果我贴着一团子，而且只有很少气，这是大忌 (Heavy)
      // 模拟落子后的气... 这里只看周边简单的邻居数量
      // 如果 4 个方向有 3 个是自己的子 -> 愚形/凝重 (Over-concentrated)
      // 除非是为了做眼或者连接切断，否则扣分
      let myNeighbors = 0;
      getNeighbors({x,y}, size).forEach(n => { if(board[n.y][n.x]?.color === player) myNeighbors++; });
      if (myNeighbors >= 3) score -= 15; // 严重扣分
      else score -= 5;
  }

  // 5. [New] 大场/脱先奖励 (Tenuki)
  // 如果这个点周围很空旷 (range=2 内没有子)，说明是大场
  // 但前面 getCandidateMoves 已经保证了只选局部点？
  // 不，现在 getCandidateMoves 包含了全局星位。
  // 所以如果落子点周围没有子，给予大场奖励。
  let nearbyStones = 0;
  for(let dy=-2; dy<=2; dy++){
      for(let dx=-2; dx<=2; dx++){
          const nx=x+dx; const ny=y+dy;
          if(nx>=0 && nx<size && ny>=0 && ny<size && board[ny][nx]) nearbyStones++;
      }
  }
  if (nearbyStones === 0) {
      // 纯粹的大场 (如开局占角)
      score += 40; // 鼓励脱先占大场
  }

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

// 4. 五子棋评估核心 (Heuristics - Stronger Version)
const GOMOKU_SCORES = {
  WIN: 100000000,
  OPEN_4: 10000000,
  CLOSED_4: 1000000, // Still deadly if not blocked
  OPEN_3: 100000,    // Major threat
  CLOSED_3: 1000,
  OPEN_2: 100,
  CLOSED_2: 10
};

// Check for specific patterns in a line (bitmask style or string match logic)
const evaluateLine = (board: BoardState, x: number, y: number, dx: number, dy: number, player: Player): number => {
  const size = board.length;
  // Extract a line of 9 points centered at x,y:  [-4, -3, -2, -1, 0, 1, 2, 3, 4]
  // 0 is the candidate move position (which is currently empty or simulated)
  
  const line: number[] = []; // 1=Me, -1=Opponent, 0=Empty, 2=Wall
  
  for (let i = -4; i <= 4; i++) {
    const nx = x + dx * i;
    const ny = y + dy * i;
    if (nx < 0 || nx >= size || ny < 0 || ny >= size) {
      line.push(2); // Wall
    } else {
      const stone = board[ny][nx];
      if (stone) {
        line.push(stone.color === player ? 1 : -1);
      } else {
        if (i === 0) line.push(1); // Assume we play here
        else line.push(0);
      }
    }
  }

  // Current pos is at index 4 (center)
  // Simple pattern matching for optimization
  // Convert to string for regex-like matching or perform manual checks
  // Let's do a sliding window check for 5 positions containing the center
  
  let score = 0;

  // Helper to count metrics in a window
  // "Window" size 5.
  // We check all windows of size 5 that include index 4.
  // Windows starting at: 0 (0-4), 1 (1-5), 2 (2-6), 3 (3-7), 4 (4-8)
  
  let maxConsecutive = 0;
  let open4 = 0;
  let closed4 = 0;
  let open3 = 0;
  let broken3 = 0; // X.XX or XX.X

  // --- Strict 5-in-a-row Check ---
  // If any window of 5 is all 1s -> WIN
  for (let start = 0; start <= 4; start++) {
    let count = 0;
    for (let k = 0; k < 5; k++) {
      if (line[start + k] === 1) count++;
      else if (line[start + k] === -1 || line[start + k] === 2) { count = -99; break; }
    }
    if (count === 5) return GOMOKU_SCORES.WIN;
  }
  
  // If not win, detailed analysis
  // We analyze the full line segment to find the "best" shape we created.
  
  // 1. Check for Open 4 ( .XXXX. )
  // The line array has 9 elements. Center is 4.
  // We need to look for patterns involving index 4.
  
  // Convert line to simplified string for easier logic? 
  // 1: Stone, 0: Empty, -1: Opp, 2: Wall
  // Optimizing: Just scan directions for "Live 4", "Dead 4", "Live 3"
  
  // Reuse the logic of counting consecutive stones + openings
  let consec = 1;
  let leftOpen = false;
  let rightOpen = false;
  
  // Left scan
  for (let i = 1; i <= 4; i++) {
      const val = line[4 - i];
      if (val === 1) consec++;
      else {
          if (val === 0) leftOpen = true;
          break;
      }
  }
  
  // Right scan
  for (let i = 1; i <= 4; i++) {
      const val = line[4 + i];
      if (val === 1) consec++;
      else {
          if (val === 0) rightOpen = true;
          break;
      }
  }
  
  if (consec >= 5) return GOMOKU_SCORES.WIN;
  if (consec === 4) {
      if (leftOpen && rightOpen) return GOMOKU_SCORES.OPEN_4;
      if (leftOpen || rightOpen) return GOMOKU_SCORES.CLOSED_4;
      return 0; // Totally blocked 4 is useless
  }
  if (consec === 3) {
      if (leftOpen && rightOpen) {
          // Check for "Jump 4" (Broken 4) e.g. X.XXX
          // If we have open ends, it is at least Open 3.
          // But check if we can extend to 4 through the gap?
          return GOMOKU_SCORES.OPEN_3;
      }
      if (leftOpen || rightOpen) return GOMOKU_SCORES.CLOSED_3;
      return 0;
  }
  if (consec === 2) {
      if (leftOpen && rightOpen) return GOMOKU_SCORES.OPEN_2;
      return GOMOKU_SCORES.CLOSED_2;
  }
  
  // Special Case: Broken 4 (X.XXX or XX.XX)
  // This is as strong as Closed 4 (requires immediate block)
  // Check pattern X X . X X  (Center can be the dot or the X)
  // In this function, center IS an X (simulated).
  // So we look for 1 0 1 1 1 etc.
  
  // Hard to scan generically. Let's do specific pattern checks for "Broken" shapes centered at 4.
  // Pattern: 1 1 0 1 -> If index 4 closes the gap
  
  const checkPattern = (pat: number[]) => {
      // Pat is an array like [1, 1, 1, 0, 1] relative to center?
      // Too complex.
      return false;
  };

  return score;
};

// Simplified but Stronger Shape Evaluator
const getGomokuShapeScore = (board: BoardState, x: number, y: number, player: Player): number => {
    const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
    let totalScore = 0;
    const size = board.length;

    for (const [dx, dy] of directions) {
        // Collect line for 9 cells
        const line: number[] = [];
        for(let k=-4; k<=4; k++) {
            const nx = x + k*dx;
            const ny = y + k*dy;
            if(nx<0||nx>=size||ny<0||ny>=size) line.push(2); // Wall
            else {
                const s = board[ny][nx];
                if(s) line.push(s.color === player ? 1 : -1);
                else line.push(0);
            }
        }
        // Center is at index 4, assume we play there (1)
        line[4] = 1; 

        // Analyze this line buffer
        totalScore += analyzeLineBuffer(line);
    }
    return totalScore;
};

const analyzeLineBuffer = (line: number[]): number => {
    // line length 9. 1=Me, -1=Opp, 0=Empty, 2=Wall
    // We look for patterns of '1'
    
    let score = 0;
    
    // Convert to string for internal pattern matching
    // Map: 1->X, -1->O, 0->_, 2->|
    const str = line.map(v => v===1?'X':(v===-1||v===2?'O':'_')).join('');
    
    // Patterns
    if (str.includes('XXXXX')) return GOMOKU_SCORES.WIN;
    
    // Live 4: _XXXX_
    if (str.includes('_XXXX_')) return GOMOKU_SCORES.OPEN_4;
    
    // Dead 4: OXXXX_ or _XXXXO or X_XXX or XXX_X or XX_XX 
    // (Broken 4s are effectively Dead 4s usually, or better if open edges)
    if (str.includes('XXXX_') || str.includes('_XXXX')) return GOMOKU_SCORES.CLOSED_4;
    if (str.includes('X_XXX') || str.includes('XXX_X') || str.includes('XX_XX')) {
        // These are broken 4s. If they are bounded by _, they are huge.
        // e.g. _XX_XX_ is a "Live Broken 4" -> effectively Open 4 logic? 
        // No, _XX_XX_ needs 1 move to become _XXXXX_ (Win). 
        // Standard Open 4 _XXXX_ needs 1 move to Win.
        // So Broken 4 is roughly equal to Closed 4 (Force opponent to block).
        return GOMOKU_SCORES.CLOSED_4;
    }

    // Live 3: _XXX_ or _X_XX_ or _XX_X_
    if (str.includes('_XXX_')) return GOMOKU_SCORES.OPEN_3;
    if (str.includes('_X_XX_') || str.includes('_XX_X_')) return GOMOKU_SCORES.OPEN_3;

    // Dead 3: _XXXO or OXXX_
    if (str.includes('_XXX') || str.includes('XXX_')) return GOMOKU_SCORES.CLOSED_3;
    
    // Live 2: _XX_ or _X_X_
    if (str.includes('_XX_') || str.includes('_X_X_')) return GOMOKU_SCORES.OPEN_2;
    
    return 0;
};

const getGomokuScore = (board: BoardState, x: number, y: number, player: Player, opponent: Player, strict: boolean): number => {
    // 1. Offensive Score (What I gain)
    const attackScore = getGomokuShapeScore(board, x, y, player);
    
    // 2. Defensive Score (What I deny opponent)
    // Pretend opponent plays here
    const defendScore = getGomokuShapeScore(board, x, y, opponent);

    // Weights
    // If I can WIN, do it.
    if (attackScore >= GOMOKU_SCORES.WIN) return GOMOKU_SCORES.WIN * 10;
    
    // If Opponent can WIN, MUST Block (unless I win first, covered above).
    if (defendScore >= GOMOKU_SCORES.WIN) return GOMOKU_SCORES.WIN; // Critical Block
    
    // If I have Open 4, I will win next turn (unless opponnent wins now).
    if (attackScore >= GOMOKU_SCORES.OPEN_4) return GOMOKU_SCORES.OPEN_4 * 10;
    
    // If Opponent has Open 4, I lose if I don't block. 
    // Actually, if opponent has Open 4, blocking one side leaves the other. It's usually game over.
    // But we must try.
    if (defendScore >= GOMOKU_SCORES.OPEN_4) return GOMOKU_SCORES.OPEN_4; 
    
    // If I make a Closed 4 (Threat), opponent must answer.
    // If Opponent makes Closed 4, I must answer.
    
    // General formula: Attack + Defense typically triggers good moves.
    // But we prioritize critical threats.
    
    // Strict Mode: For filtering candidate moves in Minimax
    if (strict) {
       // Only return high value moves
       if (attackScore + defendScore < GOMOKU_SCORES.CLOSED_2) return 0;
    }
    
    // Weight Defense slightly higher to be safe? 
    // Or Attack? 
    // In Gomoku, initiative is key.
    return attackScore + defendScore * 0.9;
};

const minimaxGomoku = (
    board: BoardState, 
    depth: number, 
    alpha: number, 
    beta: number, 
    isMaximizing: boolean, 
    player: Player, 
    lastMove: Point | null
): number => {
    // Check Terminal (Win/Loss)
    if (lastMove && checkGomokuWin(board, lastMove)) {
        // If the *current* player just moved and won, that's great for them.
        // But minimax is called *after* the move.
        // So if we are here, the previous mover (Opponent of current recursion) won.
        // If isMaximizing=true, it means 'We' are about to move, but 'They' (Minimizer) just moved and won.
        // So Score is -Infinity.
        return isMaximizing ? -100000000 : 100000000;
    }
    
    if (depth === 0) return 0;

    const size = board.length;
    const candidates = getCandidateMoves(board, size, 2);
    if (candidates.length === 0) return 0;

    const myColor = player;
    const opColor = player === 'black' ? 'white' : 'black';
    // Current Mover Color
    const currentColor = isMaximizing ? player : opColor;
    const nextColor    = isMaximizing ? opColor : player; // For next recursion
    
    // Heuristic Sort (Move Ordering)
    // We want to verify the BEST moves first.
    // For the current player, we want moves that give high Shape Score.
    const scoredMoves = candidates.map(pt => {
        // Evaluate based on Current Player's View
        // Is this move good for me?
        // We use the combined Attack/Defense score.
        const score = getGomokuScore(board, pt.x, pt.y, currentColor, isMaximizing ? opColor : player, false);
        return { pt, score };
    });
    
    scoredMoves.sort((a,b) => b.score - a.score);
    
    // Pruning: Only look at top K moves
    // Deep search handles the rest.
    const branching = depth > 2 ? 8 : 12; // Wider at shallow depths? No, typically Narrows deeper.
    const movesToSearch = scoredMoves.slice(0, branching);

    if (isMaximizing) {
        let maxEval = -Infinity;
        for (const {pt} of movesToSearch) {
            // Check immediate win to save time
            // (checkGomokuWin handles logic, but this is pre-move optimization)
            
            // Execute
            board[pt.y][pt.x] = { color: player, x: pt.x, y: pt.y, id: 'sim' };
            
            const evalScore = minimaxGomoku(board, depth - 1, alpha, beta, false, player, pt);
            
            // Backtrack
            board[pt.y][pt.x] = null;
            
            // Soft positional bonus to break ties
            const bonus = pt.x === Math.floor(size/2) && pt.y === Math.floor(size/2) ? 10 : 0;

            const total = evalScore + bonus * 0.01;
            
            maxEval = Math.max(maxEval, total);
            alpha = Math.max(alpha, total);
            if (beta <= alpha) break; 
        }
        return maxEval;
    } else {
        let minEval = Infinity;
        for (const {pt} of movesToSearch) {
            board[pt.y][pt.x] = { color: opColor, x: pt.x, y: pt.y, id: 'sim' };
            
            const evalScore = minimaxGomoku(board, depth - 1, alpha, beta, true, player, pt);
            
            board[pt.y][pt.x] = null;
            
            // Minus bonus? (Good for opponent is bad for us)
            // But evalScore is already from maximizing perspective.
            // If evalScore is high, it means MAX is winning.
            // MIN wants to minimize that.
            
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
  gameType: GameType,
  difficulty: Difficulty,
  previousBoardHash: string | null
): Point | null | 'RESIGN' => {
  const size = board.length;
  // const opponent = player === 'black' ? 'white' : 'black'; // Unused in this scope
  
  // 1. Gomoku AI Logic
  if (gameType === 'Gomoku') {
      const candidates = getCandidateMoves(board, size, 2);
      if (candidates.length === 0) return { x: Math.floor(size/2), y: Math.floor(size/2) }; // Center start

      // Difficulty Safe Mapping
      // If user switches from Go (Rank) to Gomoku without changing difficulty, map roughly:
      let safeDifficulty = difficulty;
      if (!['Easy', 'Medium', 'Hard'].includes(difficulty)) {
          // Heuristic mapping
          if (difficulty.includes('k')) safeDifficulty = 'Easy';
          else if (difficulty.includes('d')) safeDifficulty = 'Hard';
          else safeDifficulty = 'Medium';
      }

      let depth = 2;
      
      if (safeDifficulty === 'Easy') {
          depth = 2; // Fast
      } else if (safeDifficulty === 'Medium') {
          depth = 3; // Balanced
      } else if (safeDifficulty === 'Hard') {
          depth = 4; // Deep enough for 99% of casual games, vastly faster than 6
      }
      
      let bestMove: Point | null = null;
      let bestVal = -Infinity;
      
      const opColor = player === 'black' ? 'white' : 'black';
      
      // 1. Win Check (Depth 0)
      for (const m of candidates) {
          if (getGomokuShapeScore(board, m.x, m.y, player) >= GOMOKU_SCORES.WIN) return m;
      }
      // 2. Block Check (Depth 0)
      for (const m of candidates) {
          if (getGomokuShapeScore(board, m.x, m.y, opColor) >= GOMOKU_SCORES.WIN) return m;
      }
      
      // 3. Search
      const scoredCandidates = candidates.map(pt => ({
          pt,
          score: getGomokuScore(board, pt.x, pt.y, player, opColor, true)
      })).sort((a,b) => b.score - a.score);
      
      // Adaptive beam width
      let searchCount = 4;
      if (safeDifficulty === 'Medium') searchCount = 6;
      if (safeDifficulty === 'Hard') searchCount = 8;

      const topMoves = scoredCandidates.slice(0, searchCount).map(s => s.pt);
      
      // Easy Mode Special Behavior: deterministically suboptimal?
      // Or just shallow? 
      // User asked: "Do not use random algorithm".
      // So allow shallow search to pick best it sees.
      
      for (const move of topMoves) {
          board[move.y][move.x] = { color: player, x: move.x, y: move.y, id: 'sim' };
          
          const val = minimaxGomoku(board, depth - 1, -Infinity, Infinity, false, player, move);
          
          board[move.y][move.x] = null;
          
           // Positional bias for center control (Deterministic tie-breaker)
           const bias = (10 - (Math.abs(move.x - size/2) + Math.abs(move.y - size/2))) * 10;
           const finalVal = val + bias;

          if (finalVal > bestVal) {
              bestVal = finalVal;
              bestMove = move;
          }
      }
      
      return bestMove || candidates[0];
  }




  // === 围棋 AI (本地) ===
  const opponent = player === 'black' ? 'white' : 'black';
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

  // [New] Joseki / Fuseki Check (开局定式)
  // Only check in opening/early midgame (stones < 60?)
  if (stoneCount < size * size * 0.4) {
      const josekiMove = getJosekiMove(board, size, player);
      if (josekiMove && board[josekiMove.y][josekiMove.x] === null) {
           return josekiMove;
      }
  }

  // --- 性能优化：候选点预剪枝 (Pruning) ---
  // 先用轻量级的静态评估对候选点排序，只取前 N 个进行深度模拟
  const lastMovePt = deserializeGame(previousBoardHash || "")?.board 
        ? null // TODO: retrieve last move from history properly if needed, for proximity. 
        : null; 
  // actually we don't have last move easily here without parsing history again or changing signature. 
  // Let's use Shape + Position.

  const rankedCandidates = candidates.map(pt => {
      // 静态评分 (Static Evaluation)
      // 1. 位置分
      const posScore = evaluatePositionStrength(pt.x, pt.y, size);
      // 2. 棋形分 (轻量级)
      const shapeScore = evaluateShape(board, pt.x, pt.y, player);
      // 3. 接触战加分 (Proximity) - 优先考虑即便没有 attemptMove 也能看出的“贴”
      // 检查四周是否有别人的子 -> 战斗区域
      let proximityBonus = 0;
      const neighbors = getNeighbors(pt, size);
      neighbors.forEach(n => {
          if (board[n.y][n.x]) proximityBonus += 10;
      });

      return { pt, staticScore: posScore + shapeScore * 2 + proximityBonus };
  });

  // 排序并截断
  // Easy: Top 15 (非常快)
  // Medium: Top 25
  // Hard: Top 40
  rankedCandidates.sort((a, b) => b.staticScore - a.staticScore);
  
  // 动态剪枝搜索 (Dynamic Search with Fallback)
  // 确保至少找到一定数量的合法移动，而不是只看前 N 个
  // 这样避免了因为前 N 个虽然静态分高但实际是禁手/填眼而被过滤，导致 AI 误以为无棋可下
  let validMovesFound = 0;
  const targetMoves = difficulty === 'Easy' ? 15 : (difficulty === 'Medium' ? 25 : 40);
  
  for (const item of rankedCandidates) {
    // 如果已经找到了足够的候选点，提前结束搜索
    if (validMovesFound >= targetMoves) break;

    // 如果静态分太低（后半段），且我们已经有了一些保底棋，也可以提前结束
    // 但为了防止死机，如果还没找到棋，即使分数低也要用
    
    const { x, y } = item.pt;
    
    // 真眼保护
    if (isSimpleEye(board, x, y, player)) continue;

    // 1. 我方尝试落子
    const sim = attemptMove(board, x, y, player, 'Go', previousBoardHash);
    if (!sim) continue;
    const myNewGroup = getGroup(sim.newBoard, { x, y });
    if (myNewGroup && myNewGroup.liberties === 0 && sim.captured === 0) continue; // 自杀检测

    // 合法移动！
    validMovesFound++;

    let score = 0;

    // --- 基础评估 (Level 0) ---
    // A. 吃子 (Capture)
    // [Rebalance] 避免贪吃单子。提子价值 = 棋子数 * 基础分 + 额外奖励
    if (sim.captured > 0) {
        if (sim.captured === 1) score += 80; // 提一子 (was 300) -> 除非关键，否则不如大场
        else score += 300 + sim.captured * 100; // 提多子
    }
    
    // B. 叫吃检测 (Atari)
    const neighbors = getNeighbors({x, y}, size);
    neighbors.forEach(n => {
       const stone = board[n.y][n.x];
       if (stone && stone.color === opponent) {
           const enemyGroup = getGroup(sim.newBoard, n);
           if (enemyGroup && enemyGroup.liberties === 1) {
               // 叫吃！
               score += 60; 
               if (enemyGroup.stones.length > 1) score += 200; // 叫吃大龙
           }
       }
    });

    // C. 自身安全 (Safety)
    if (myNewGroup) {
        if (myNewGroup.liberties === 1) score -= 900; // 极度危险 (Self-Atari)
        if (myNewGroup.liberties === 2) score -= 100; // 稍微危险
        if (myNewGroup.liberties >= 4) score += 50;   // 气长
    }

    // D. 棋形 (Shape) & 潜力
    // 这里的 evaluateShape 计算的是局部好形，权重很重要
    score += evaluateShape(board, x, y, player) * 8; // was *5 -> 强调棋理
    score += evaluatePositionStrength(x, y, size) * 3; // was *2

    // [New] 孤子/根据地逻辑 (Group Base)
    if (myNewGroup) {
         let totalDist = 0;
         myNewGroup.stones.forEach(s => totalDist += Math.min(s.x, s.y, size-1-s.x, size-1-s.y));
         const avgDist = totalDist / myNewGroup.stones.length;
         if (avgDist > 1.5 && avgDist < 4) score += 40; 
    }

    // --- 进阶评估 (Level 1: Opponent Response) ---
    // 只有 Hard/Medium 开启
    if (difficulty === 'Hard' || difficulty === 'Medium') {
       // 仅仅检查此局部周围的反应，不需要重新生成全盘候选
       // 这是一个巨大的性能优化点：只在落子点周围检查
       const localResponses = getCandidateMoves(sim.newBoard, size, 2); 
       let opMaxDamage = 0;
       
       // 简化版反击检查：
       // 只看对方在我落子点周围 2 格内有没有非常狠的棋 (吃子)
       // 随机抽查 3 个静态分最高的反击点? 还是全查?
       // 局部点很少 (最多20个)，全查应该还好，但为了速度，只查 Top 5
       
       // 重新生成局部候选有点慢，不如直接检查刚才 neighbors 的 liberty points?
       // 为了稳妥，我们只做基本的吃子检查。
       // 略过繁重的模拟。Heuristic AI 要快。
    }

    // E. 随机扰动 (大幅降低)
    if (difficulty === 'Easy') score += Math.random() * 50; 
    else if (difficulty === 'Medium') score += Math.random() * 10;

    possibleMoves.push({ x, y, score });
  }

  possibleMoves.sort((a, b) => b.score - a.score);
  
  if (possibleMoves.length === 0) return null;
  const bestMove = possibleMoves[0];

  // Pass logic
  if (bestMove.score <= -500 && stoneCount > size * size * 0.6) {
       return null; 
  }

  if (difficulty === 'Easy') {
    // Top 3 weighted random (Pick 1st 70%, 2nd 20%, 3rd 10%)
    const topN = possibleMoves.slice(0, 3);
    const r = Math.random();
    if (r < 0.7 && topN[0]) return topN[0];
    if (r < 0.9 && topN[1]) return topN[1];
    return topN[topN.length-1];
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

// --- Territory Calculation (Flood Fill) ---
export const calculateTerritory = (board: BoardState): { black: {x:number, y:number}[], white: {x:number, y:number}[] } => {
    const size = board.length;
    const territory = { black: [] as {x:number, y:number}[], white: [] as {x:number, y:number}[] };
    const visited = new Set<string>();

    const getKey = (x:number, y:number) => `${x},${y}`;
    const isValid = (x:number, y:number) => x >= 0 && x < size && y >= 0 && y < size;

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (board[y][x] || visited.has(getKey(x, y))) continue;

            const region: {x:number, y:number}[] = [];
            let touchingBlack = false;
            let touchingWhite = false;
            const stack = [{x, y}];
            visited.add(getKey(x, y));

            while (stack.length > 0) {
                const p = stack.pop()!;
                region.push(p);

                const dirs = [[1,0], [-1,0], [0,1], [0,-1]];
                dirs.forEach(([dx, dy]) => {
                    const nx = p.x + dx;
                    const ny = p.y + dy;
                    if (isValid(nx, ny)) {
                        const stone = board[ny][nx];
                        if (stone) {
                            if (stone.color === 'black') touchingBlack = true;
                            if (stone.color === 'white') touchingWhite = true;
                        } else {
                            const key = getKey(nx, ny);
                            if (!visited.has(key)) {
                                visited.add(key);
                                stack.push({x: nx, y: ny});
                            }
                        }
                    }
                });
            }

            if (touchingBlack && !touchingWhite) {
                territory.black.push(...region);
            } else if (touchingWhite && !touchingBlack) {
                territory.white.push(...region);
            }
        }
    }
    return territory;
};