import React, { useMemo, useState, useRef, useEffect } from 'react';
import { getAllGroups } from '../utils/goLogic';
import { BoardState, Player, Stone, GameType, GameMode } from '../types';
import { StoneFace } from './StoneFaces';
import { ZoomOut } from 'lucide-react';
import { STONE_THEMES, BOARD_THEMES, StoneThemeId, BoardThemeId } from '../utils/themes';

export const calculateBoardConstants = (boardSize: number, showCoordinates: boolean = false) => {
  // Dynamic cell size: Smaller boards have larger cells, maxing out at 19
  // FIXED: Revert to 40 as standard base
  const CELL_SIZE = Math.min(40, 420 / (boardSize + 1)); 
  
  // Increase padding if coordinates are shown
  const BASE_PADDING = boardSize >= 19 ? 12 : 20;
  const GRID_PADDING = showCoordinates ? BASE_PADDING + 15 : BASE_PADDING;
  
  return { CELL_SIZE, GRID_PADDING };
};

interface GameBoardProps {
  board: BoardState;
  onIntersectionClick: (x: number, y: number) => void;
  currentPlayer: Player;
  lastMove: { x: number, y: number } | null;
  showQi: boolean;
  gameType: GameType;
  gameMode?: GameMode; // Added
  showCoordinates?: boolean;
  extraSVG?: React.ReactNode;
  autoShowQiAt?: { x: number, y: number };
  territory?: Float32Array | null;
  showTerritory?: boolean;
  stoneSkin?: string;
  boardSkin?: string; // New
}


type ConnectionType = 'ortho' | 'loose';

interface Connection {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: Player;
  type: ConnectionType;
}

// 定义气流线段结构
interface QiSegment {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    key: string;
}

export const GameBoard: React.FC<GameBoardProps> = ({ 
  board, 
  onIntersectionClick, 
  lastMove,
  showQi,
  gameType,
  gameMode,
  showCoordinates = false,
  extraSVG,
  autoShowQiAt,
  territory,
  showTerritory,
  stoneSkin = 'classic',
  boardSkin = 'wood'
}) => {
  const boardSize = board.length;
  const { CELL_SIZE, GRID_PADDING } = useMemo(() => 
    calculateBoardConstants(boardSize, showCoordinates), 
  [boardSize, showCoordinates]);
  
  const STONE_RADIUS = CELL_SIZE * 0.45; 
  
  const boardPixelSize = (boardSize - 1) * CELL_SIZE + GRID_PADDING * 2;

  // --- ZOOM & PAN STATE ---
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const touchState = useRef({
    isPanning: false,
    startDist: 0,
    startScale: 1,
    lastX: 0,
    lastY: 0,
    blockClick: false
  });

  // --- ACTIVE QI STATE ---
  const [activeQiSegments, setActiveQiSegments] = useState<QiSegment[]>([]);

  // [Perf] Track the ID of the most recently placed stone for animation targeting
  // This prevents ALL stones from re-animating on every render
  const [animatingStoneId, setAnimatingStoneId] = useState<string | null>(null);

  // Update animating stone when lastMove changes
  useEffect(() => {
    if (lastMove) {
      const stone = board[lastMove.y]?.[lastMove.x];
      if (stone) {
        setAnimatingStoneId(stone.id);
        // Clear after animation completes to prevent re-animation on unrelated re-renders
        const timer = setTimeout(() => setAnimatingStoneId(null), 450);
        return () => clearTimeout(timer);
      }
    }
  }, [lastMove, board]);

  useEffect(() => {
    setTransform({ scale: 1, x: 0, y: 0 });
    setActiveQiSegments([]); // 重置棋盘大小时清除气流
    setAnimatingStoneId(null);
  }, [boardSize, showCoordinates]);

  // 当棋盘变化（落子）时，清除之前的气流显示
  useEffect(() => {
    setActiveQiSegments([]);
  }, [board]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
        touchState.current.lastX = e.touches[0].clientX;
        touchState.current.lastY = e.touches[0].clientY;
        touchState.current.isPanning = false;
    } else if (e.touches.length === 2) {
         touchState.current.isPanning = true;
         touchState.current.blockClick = true;
         const dx = e.touches[0].clientX - e.touches[1].clientX;
         const dy = e.touches[0].clientY - e.touches[1].clientY;
         touchState.current.startDist = Math.hypot(dx, dy);
         touchState.current.startScale = transform.scale;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 2) return;

    if (e.touches.length === 2) {
         const dx = e.touches[0].clientX - e.touches[1].clientX;
         const dy = e.touches[0].clientY - e.touches[1].clientY;
         const dist = Math.hypot(dx, dy);
         
         if (touchState.current.startDist > 0) {
             const scaleFactor = dist / touchState.current.startDist;
             const newScale = Math.min(Math.max(1, touchState.current.startScale * scaleFactor), 3);
             
             const panDx = e.touches[0].clientX - touchState.current.lastX;
             const panDy = e.touches[0].clientY - touchState.current.lastY;
             
             touchState.current.lastX = e.touches[0].clientX;
             touchState.current.lastY = e.touches[0].clientY;

             setTransform(prev => {
                 const limit = (boardPixelSize * prev.scale) / 2;
                 const newX = Math.max(-limit, Math.min(limit, prev.x + panDx));
                 const newY = Math.max(-limit, Math.min(limit, prev.y + panDy));
                 return { ...prev, x: newX, y: newY, scale: newScale };
             });
         }
    }
  };

  // --- SHOW QI LOGIC ---
  const calculateQiFlow = (x: number, y: number) => {
      const targetStone = board[y][x];
      if (!targetStone) return [];

      // 简单的泛洪算法找到整个棋块 (Group)
      const groupStones: {x: number, y: number}[] = [];
      const visited = new Set<string>();
      const stack = [{x, y}];
      const color = targetStone.color;

      visited.add(`${x},${y}`);

      while(stack.length > 0) {
          const curr = stack.pop()!;
          groupStones.push(curr);

          const dirs = [[1,0], [-1,0], [0,1], [0,-1]];
          dirs.forEach(([dx, dy]) => {
              const nx = curr.x + dx;
              const ny = curr.y + dy;
              if (nx >= 0 && nx < boardSize && ny >= 0 && ny < boardSize) {
                  const key = `${nx},${ny}`;
                  if (!visited.has(key)) {
                      const neighbor = board[ny][nx];
                      if (neighbor && neighbor.color === color) {
                          visited.add(key);
                          stack.push({x: nx, y: ny});
                      }
                  }
              }
          });
      }

      // 计算该棋块所有的气（连接到空位的线段）
      const segments: QiSegment[] = [];
      groupStones.forEach(stone => {
          const dirs = [[1,0], [-1,0], [0,1], [0,-1]];
          dirs.forEach(([dx, dy]) => {
              const nx = stone.x + dx;
              const ny = stone.y + dy;
              if (nx >= 0 && nx < boardSize && ny >= 0 && ny < boardSize) {
                  // 如果邻居是空的，这就是一口气
                  if (!board[ny][nx]) {
                      segments.push({
                          x1: stone.x,
                          y1: stone.y,
                          x2: nx,
                          y2: ny,
                          key: `qi-${stone.x},${stone.y}-${nx},${ny}`
                      });
                  }
              }
          });
      });
      return segments;
  };

  // --- Auto Show Qi Effect ---
  useEffect(() => {
      if (autoShowQiAt) {
          const segments = calculateQiFlow(autoShowQiAt.x, autoShowQiAt.y);
          if (segments.length > 0) {
              setActiveQiSegments(segments);
          }
      }
  }, [autoShowQiAt]);


  const handleStoneHover = (x: number, y: number) => {
    if (!showQi) {
        if (activeQiSegments.length > 0) setActiveQiSegments([]);
        return;
    }
    // 如果悬停的是空位，且当前有显示气流，则清空（桌面体验优化）
    if (!board[y][x]) {
        // setActiveQiSegments([]); // 可选：如果希望移开鼠标就消失，可以取消注释
        return;
    }
    setActiveQiSegments(calculateQiFlow(x, y));
  };

  const handleMouseLeaveBoard = () => {
      if (!autoShowQiAt) {
           setActiveQiSegments([]);
      }
  };

  // 统一处理点击：如果是空位则落子，如果是棋子则显示气（移动端友好）
  const handleIntersectionClickWrapper = (x: number, y: number) => {
    if (touchState.current.blockClick) return;
    
    // 逻辑分支：
    // 1. 如果该位置有子，且开启了显示气功能 -> 切换显示该子的气
    if (board[y][x] && showQi) {
        const segments = calculateQiFlow(x, y);
        // 如果点击的是当前已经高亮的棋子，可以做toggle，或者刷新
        setActiveQiSegments(segments);
        // 手机震动反馈
        if (navigator.vibrate) navigator.vibrate(10);
        return;
    }

    // 2. 如果该位置无子 -> 落子，并自动清除当前的气流显示
    setActiveQiSegments([]); 
    onIntersectionClick(x, y);
  };

  // Identify connections
  const connections = useMemo(() => {
    const lines: Connection[] = [];
    const isValid = (cx: number, cy: number) => cx >= 0 && cx < boardSize && cy >= 0 && cy < boardSize;

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

        for(let y=0; y<boardSize; y++) {
          for(let x=0; x<boardSize; x++) {
            const stone = board[y][x];
            if(!stone) continue;

            // 上下左右 + 斜对角，使用围棋同款牵丝效果
            addGomokuLink(x, y, 1, 0);
            addGomokuLink(x, y, 0, 1);
            addGomokuLink(x, y, 1, 1);
            addGomokuLink(x, y, -1, 1);
          }
        }
    } else {
        for(let y=0; y<boardSize; y++) {
          for(let x=0; x<boardSize; x++) {
            const stone = board[y][x];
            if(!stone) continue;
            const opColor = stone.color === 'black' ? 'white' : 'black';

            // 1. ORTHO CONNECTIONS (The Snake Body)
            if(isValid(x+1, y)) {
               const right = board[y][x+1];
               if(right && right.color === stone.color) {
                 lines.push({ x1: x, y1: y, x2: x+1, y2: y, color: stone.color, type: 'ortho' });
               }
            }
            if(isValid(x, y+1)) {
               const bottom = board[y+1][x];
               if(bottom && bottom.color === stone.color) {
                 lines.push({ x1: x, y1: y, x2: x, y2: y+1, color: stone.color, type: 'ortho' });
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
  }, [board, boardSize, gameType]);

  const stones = useMemo(() => {
    const flat: Stone[] = [];
    board.forEach(row => row.forEach(stone => {
      if (stone) flat.push(stone);
    }));
    return flat;
  }, [board]);

  const groupFaces = useMemo(() => {
    if (gameType === 'Gomoku') {
        return stones.map(stone => ({
            id: stone.id,
            x: stone.x,
            y: stone.y,
            mood: 'happy' as const,
            color: stone.color,
            scale: 1,
            lookOffset: { x: 0, y: 0 }
        }));
    }

    const groups = getAllGroups(board);
    return groups.map(group => {
        let sumX = 0;
        let sumY = 0;
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        
        const sortedStones = [...group.stones].sort((a, b) => {
            if (a.y !== b.y) return a.y - b.y;
            return a.x - b.x;
        });

        const groupKey = sortedStones.map(s => s.id).join('-');

        sortedStones.forEach(s => {
            sumX += s.x;
            sumY += s.y;
            minX = Math.min(minX, s.x);
            maxX = Math.max(maxX, s.x);
            minY = Math.min(minY, s.y);
            maxY = Math.max(maxY, s.y);
        });
        
        const count = sortedStones.length;
        const centerX = sumX / count;
        const centerY = sumY / count;

        let finalX = centerX;
        let finalY = centerY;

        const isHorizontalLine = (maxY === minY) && count > 1;
        const isVerticalLine = (maxX === minX) && count > 1;

        if (isHorizontalLine || isVerticalLine) {
            const edgeStone = sortedStones[sortedStones.length - 1];
            finalX = edgeStone.x;
            finalY = edgeStone.y;
        } else {
            let closestDist = Infinity;
            let closestStone = sortedStones[0];
            sortedStones.forEach(s => {
                const dist = Math.pow(s.x - centerX, 2) + Math.pow(s.y - centerY, 2);
                if (dist < closestDist) {
                    closestDist = dist;
                    closestStone = s;
                }
            });
            finalX = closestStone.x;
            finalY = closestStone.y;
        }

        // --- FACE DIRECTION LOGIC ---
        let lookOffset = { x: 0, y: 0 };
        if (group.libertyPoints && group.libertyPoints.length > 0) {
            let lx = 0;
            let ly = 0;
            group.libertyPoints.forEach(p => {
                lx += p.x;
                ly += p.y;
            });
            lx /= group.libertyPoints.length;
            ly /= group.libertyPoints.length;
            
            // Calculate vector from Face Position to Center of Liberties
            const dx = lx - finalX;
            const dy = ly - finalY;
            const dist = Math.sqrt(dx*dx + dy*dy) || 1;
            
            // Normalize
            lookOffset = { x: dx / dist, y: dy / dist };
        }
        // ---------------------------

        let mood: 'happy' | 'neutral' | 'worried' = 'happy';
        if (group.liberties === 1) mood = 'worried';
        else if (group.liberties <= 3) mood = 'neutral';

        const sizeBonus = Math.min(count - 1, 3) * 0.1;

        return {
            id: groupKey,
            x: finalX,
            y: finalY,
            mood,
            color: group.stones[0].color,
            scale: 1 + sizeBonus,
            lookOffset
        };
    });
  }, [board, gameType, stones]);

  const renderGridLines = () => {
    const lines = [];
    for (let i = 0; i < boardSize; i++) {
      const pos = GRID_PADDING + i * CELL_SIZE;
      lines.push(
        <line
          key={`v-${i}`}
          x1={pos} y1={GRID_PADDING}
          x2={pos} y2={boardPixelSize - GRID_PADDING}
          stroke="#5c4033" strokeWidth={boardSize > 13 ? 1 : 2} strokeLinecap="round"
        />
      );
      lines.push(
        <line
          key={`h-${i}`}
          x1={GRID_PADDING} y1={pos}
          x2={boardPixelSize - GRID_PADDING} y2={pos}
          stroke="#5c4033" strokeWidth={boardSize > 13 ? 1 : 2} strokeLinecap="round"
        />
      );
    }
    return lines;
  };

  const renderCoordinates = () => {
      if (!showCoordinates) return null;
      
      const labels = [];
      const colLabels = "ABCDEFGHJKLMNOPQRST".split("").slice(0, boardSize);
      
      for(let i=0; i<boardSize; i++) {
          const pos = GRID_PADDING + i * CELL_SIZE;
          
          labels.push(
            <text key={`col-top-${i}`} x={pos} y={GRID_PADDING - 12} textAnchor="middle" fontSize={boardSize > 13 ? "8" : "10"} fill="#5c4033" fontWeight="bold">
                {colLabels[i]}
            </text>
          );
          
          const rowNum = boardSize - i;
          
          labels.push(
            <text key={`row-left-${i}`} x={GRID_PADDING - 12} y={pos + 3} textAnchor="end" fontSize={boardSize > 13 ? "8" : "10"} fill="#5c4033" fontWeight="bold">
                {rowNum}
            </text>
          );
      }
      return <g opacity="0.7">{labels}</g>;
  };

  const starPoints = useMemo(() => {
    const points: [number, number][] = [];
    
    if (boardSize < 7) {
        // No star points for very small boards
    } else if (boardSize % 2 !== 0) {
        // Odd sizes have a center point (Tengen)
        const center = Math.floor(boardSize / 2);
        points.push([center, center]);
        
        if (boardSize >= 9) {
            // Add corners
            const offset = boardSize >= 13 ? 3 : 2; // 4th line for 13+, 3rd line for 9-12
            points.push([offset, offset]);
            points.push([boardSize - 1 - offset, offset]);
            points.push([offset, boardSize - 1 - offset]);
            points.push([boardSize - 1 - offset, boardSize - 1 - offset]);
        }
        
        if (boardSize >= 19) {
            // Add side stars
            const offset = 3;
            const center = Math.floor(boardSize / 2);
            points.push([center, offset]);
            points.push([center, boardSize - 1 - offset]);
            points.push([offset, center]);
            points.push([boardSize - 1 - offset, center]);
        }
    } else {
        // Even sizes - usually no Tengen, but maybe symmetric 4 stars
        // Just empty or custom logic if needed. keeping it clean for now.
    }
    
    return points;
  }, [boardSize]);

  const renderIntersections = () => {
    const hits = [];
    for (let y = 0; y < boardSize; y++) {
      for (let x = 0; x < boardSize; x++) {
        const cx = GRID_PADDING + x * CELL_SIZE;
        const cy = GRID_PADDING + y * CELL_SIZE;
        hits.push(
          <rect
            key={`hit-${x}-${y}`}
            x={cx - CELL_SIZE / 2}
            y={cy - CELL_SIZE / 2}
            width={CELL_SIZE}
            height={CELL_SIZE}
            fill="transparent"
            className="cursor-pointer hover:fill-black/5 transition-colors"
            onClick={() => handleIntersectionClickWrapper(x, y)}
            onMouseEnter={() => handleStoneHover(x, y)}
          />
        );
      }
    }
    return hits;
  };

  const renderTerritory = () => {
      if (!showTerritory || !territory) return null;
      const rects = [];
      const len = boardSize * boardSize;
      // Safety check for array length
      if (territory.length < len) return null;

      for (let i = 0; i < len; i++) {
           const val = territory[i];
           if (Math.abs(val) < 0.1) continue; // Noise/Neutral
           
           const x = i % boardSize;
           const y = Math.floor(i / boardSize);
           
           // Don't draw over existing stones (Optional, but looks cleaner)
           if (board[y][x]) continue;

           const cx = GRID_PADDING + x * CELL_SIZE;
           const cy = GRID_PADDING + y * CELL_SIZE;
           
           const color = val > 0 ? 'black' : 'white';
           const opacity = Math.min(Math.abs(val) * 0.7, 0.8);
           const size = CELL_SIZE * 0.5;
           
           rects.push(
               <rect 
                   key={`t-${i}`} 
                   x={cx - size/2} 
                   y={cy - size/2} 
                   width={size} 
                   height={size} 
                   fill={color} 
                   opacity={opacity} 
                   rx={2}
                   pointerEvents="none" 
               />
           );
      }
      return <g>{rects}</g>;
  };

  // 渲染流动的气特效
  const renderQiFlow = () => {
      if (!showQi || activeQiSegments.length === 0) return null;
      
      return (
          <g filter="url(#glow-flow)">
              {/* 底层高亮线 (背景) */}
              {activeQiSegments.map(seg => (
                  <line 
                    key={`${seg.key}-bg`}
                    x1={GRID_PADDING + seg.x1 * CELL_SIZE}
                    y1={GRID_PADDING + seg.y1 * CELL_SIZE}
                    x2={GRID_PADDING + seg.x2 * CELL_SIZE}
                    y2={GRID_PADDING + seg.y2 * CELL_SIZE}
                    stroke="#4fc3f7"
                    strokeWidth={boardSize > 13 ? 3 : 5}
                    strokeLinecap="round"
                    opacity="0.5"
                  />
              ))}
              
              {/* 上层流动动画线 */}
              {activeQiSegments.map(seg => (
                  <line 
                    key={seg.key}
                    x1={GRID_PADDING + seg.x1 * CELL_SIZE}
                    y1={GRID_PADDING + seg.y1 * CELL_SIZE}
                    x2={GRID_PADDING + seg.x2 * CELL_SIZE}
                    y2={GRID_PADDING + seg.y2 * CELL_SIZE}
                    stroke="url(#qi-gradient)"
                    strokeWidth={boardSize > 13 ? 2 : 3}
                    strokeLinecap="round"
                    className="animate-dash-flow"
                  />
              ))}
              
              {/* 末端的气点 (空位上的呼吸光点) */}
              {activeQiSegments.map(seg => (
                  <circle 
                    key={`${seg.key}-dot`}
                    cx={GRID_PADDING + seg.x2 * CELL_SIZE}
                    cy={GRID_PADDING + seg.y2 * CELL_SIZE}
                    r={boardSize > 13 ? 3 : 4}
                    fill="#e1f5fe"
                    className="animate-pulse"
                  />
              ))}
          </g>
      );
  };

    const renderStoneBody = (color: Player) => {
        const theme = STONE_THEMES[stoneSkin as StoneThemeId] || STONE_THEMES['classic'];
        const isMinimal = theme.id === 'minimal';
        const isGomoku = gameType === 'Gomoku';

        // Helper to render the actual shapes (Lines + Circles + Fillers)
        // We pass color/width override to allow drawing "Shadow/Highlight" layers
        // [Refactor] Add opacity support for layered rendering
        const renderShapes = (drawColor: string, isMainLayer: boolean, opacity: number = 1.0) => {
            // [Fix] Ortho connection width should match stone diameter (2 * 0.45 = 0.9)
            // previously 0.95 caused "bulge", and mismatch caused gaps with borders.
            const orthoWidth = isGomoku ? CELL_SIZE * 0.2 : CELL_SIZE * 0.9;
            
            // Unified filter for standard themes
            // [Fix] Allow jelly filter for Gomoku too (User Request)
            const filterId = (!isMinimal) 
                ? (theme.filter ? undefined : (color === 'black' ? 'url(#jelly-black)' : 'url(#jelly-white)'))
                : undefined;
            
            const styleFilter = theme.filter ? { filter: theme.filter } : undefined;
            const borderColor = color === 'black' ? theme.blackBorder : theme.whiteBorder;
            const strokeW = isGomoku ? 1 : 0;

            // [Fix] For minimal theme, main body should NOT have a stroke to allow fusion
            // The edge definition comes from the shadow/highlight layers
            const effectiveStroke = (isMinimal && isMainLayer) ? 'none' : (isMainLayer ? borderColor : 'none');
            const effectiveStrokeWidth = (isMinimal && isMainLayer) ? 0 : (isMainLayer ? strokeW : 0);

            // [Refine] Detect 2x2 quads to fill the center hole
            // This ensures 2x2 blocks look like a solid chunk without a tiny hole in the middle
            // Only necessary for Minimal theme (Compatibility mode) where we do fusion
            const fillers = [];
            if (isMinimal && !isGomoku) {
                 const myStones = new Set(stones.filter(s => s.color === color).map(s => `${s.x},${s.y}`));
                 // Naive scan is fast enough for 19x19
                 for (let x = 0; x < boardSize - 1; x++) {
                     for (let y = 0; y < boardSize - 1; y++) {
                         if (
                             myStones.has(`${x},${y}`) &&
                             myStones.has(`${x+1},${y}`) &&
                             myStones.has(`${x},${y+1}`) &&
                             myStones.has(`${x+1},${y+1}`)
                         ) {
                             fillers.push({ x, y });
                         }
                     }
                 }
            }

            // [Fix] For Gomoku, apply filter to individual stones to prevent fusion. 
            // For Go, apply to group to enable fusion.
            const groupFilter = isGomoku ? undefined : filterId;
            const stoneFilter = isGomoku ? filterId : undefined;

            return (
                <g filter={groupFilter} style={styleFilter} opacity={opacity}>
                     {/* 1. Direct Connections (Fused Body) */}
                     {!isGomoku && (
                        <g>
                            {connections.filter(c => c.color === color && c.type === 'ortho').map((c, i) => (
                                <line 
                                    key={`${color}-ortho-${i}-${drawColor}`}
                                    x1={GRID_PADDING + c.x1 * CELL_SIZE}
                                    y1={GRID_PADDING + c.y1 * CELL_SIZE}
                                    x2={GRID_PADDING + c.x2 * CELL_SIZE}
                                    y2={GRID_PADDING + c.y2 * CELL_SIZE}
                                    stroke={drawColor}
                                    strokeWidth={orthoWidth}
                                    strokeLinecap="round"
                                />
                            ))}
                        </g>
                    )}

                    {/* 2. Filler Quads (Close the gap in 2x2 blocks) */}
                    {fillers.map((f, i) => (
                         <rect
                            key={`${color}-filler-${i}-${drawColor}`}
                            x={GRID_PADDING + (f.x + 0.5) * CELL_SIZE - CELL_SIZE * 0.15}
                            y={GRID_PADDING + (f.y + 0.5) * CELL_SIZE - CELL_SIZE * 0.15}
                            width={CELL_SIZE * 0.3}
                            height={CELL_SIZE * 0.3}
                            fill={drawColor}
                         />
                    ))}

                    {/* 3. Stone Bodies */}
                    {stones.filter(s => s.color === color).map(s => (
                        <circle
                            key={`${color}-stone-${s.id}-${drawColor}`}
                            cx={GRID_PADDING + s.x * CELL_SIZE}
                            cy={GRID_PADDING + s.y * CELL_SIZE}
                            r={STONE_RADIUS}
                            fill={drawColor}
                            // Only draw stroke on the MAIN layer
                            stroke={effectiveStroke}
                            strokeWidth={effectiveStrokeWidth} 
                            // [Fix] Apply filter here if Gomoku
                            filter={stoneFilter}
                            // [Perf] Only animate the newly placed stone
                            className={animatingStoneId === s.id ? 'stone-enter' : undefined}
                        />
                    ))}
                </g>
            );
        };

        if (isMinimal) {
            // [Fix] Refined Skeuomorphic Bevel for Compatibility Mode
            // 4 Layers for "Ceramic/Jade" feel without SVG filters
            // Using small, fixed offsets creates a tighter, more precise 3D look
            const mainColor = color === 'black' ? theme.blackColor : theme.whiteColor;
            
            // Tone-on-Tone Shadow/Highlight colors
            // Black: Dark Grey highlight, Pure Black shadow
            // White: Pure White highlight, Grey shadow
            const highlightColor = color === 'black' ? '#505050' : '#ffffff'; 
            const bodyShadowColor = color === 'black' ? '#000000' : '#999999';
            const dropShadowColor = '#000000'; 
            
            // Sub-pixel offsets for "Exquisite" look
            const off1 = 1.0; // Rim Highlight (Sharp)
            const off2 = 0.8; // Body Shadow (Soft)
            const off3 = 1.5; // Drop Shadow (Depth)

            return (
                <g>
                    {/* Layer 1: Drop Shadow (Soft depth on board) */}
                    <g transform={`translate(${off3}, ${off3})`}>
                        {renderShapes(dropShadowColor, false, 0.2)}
                    </g>
                    
                    {/* Layer 2: Body Shadow (Volume on bottom-right) */}
                    <g transform={`translate(${off2}, ${off2})`}>
                        {renderShapes(bodyShadowColor, false, 0.5)} 
                    </g>

                    {/* Layer 3: Main Body (Center) */}
                     <g>
                        {renderShapes(mainColor, true)}
                    </g>


                </g>
            );
        } else {
            // Standard Rendering
            const baseColor = color === 'black' ? theme.blackColor : theme.whiteColor;
            return renderShapes(baseColor, true);
        }
    };

    const renderLooseSilk = (color: Player) => {
        const theme = STONE_THEMES[stoneSkin as StoneThemeId] || STONE_THEMES['classic'];
        const baseColor = color === 'black' ? theme.blackColor : theme.whiteColor;
        const isGomoku = gameType === 'Gomoku';
        const trim = isGomoku ? STONE_RADIUS * 0.7 : 0;
        const filterId = isGomoku ? 'url(#goo-silk-gomoku)' : 'url(#goo-silk)';
        const groupClass = isGomoku ? 'animate-liquid-flow-gomoku' : 'animate-liquid-flow';
        const opacity = isGomoku ? 0.4 : 0.65;
    
        return (
            <g opacity={opacity} filter={filterId}>
                <g className={groupClass}>
                    {connections.filter(c => c.color === color && c.type === 'loose').map((c, i) => {
                        const x1 = GRID_PADDING + c.x1 * CELL_SIZE;
                        const y1 = GRID_PADDING + c.y1 * CELL_SIZE;
                        const x2 = GRID_PADDING + c.x2 * CELL_SIZE;
                        const y2 = GRID_PADDING + c.y2 * CELL_SIZE;

                        const strokeWidth = isGomoku ? CELL_SIZE * 0.1 : CELL_SIZE * 0.12;

                        if (isGomoku) {
                            const dx = x2 - x1;
                            const dy = y2 - y1;
                            const len = Math.hypot(dx, dy) || 1;
                            const ux = dx / len;
                            const uy = dy / len;
                            return (
                                <line 
                                    key={`${color}-loose-${i}`}
                                    x1={x1 + ux * trim} y1={y1 + uy * trim}
                                    x2={x2 - ux * trim} y2={y2 - uy * trim}
                                    stroke={baseColor} strokeWidth={strokeWidth} strokeLinecap="round"
                                />
                            );
                        }

                        return (
                            <line 
                                key={`${color}-loose-${i}`}
                                x1={x1} y1={y1} x2={x2} y2={y2}
                                stroke={baseColor} strokeWidth={strokeWidth} strokeLinecap="round"
                            />
                        );
                    })}
                </g>
            </g>
        );
    };

  return (
    <div 
        className="relative flex justify-center items-center w-full h-full max-w-full aspect-square rounded-xl overflow-hidden border-4 border-[#cba367] bg-[#e3c086] touch-none shadow-xl"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={() => {
            setTimeout(() => {
                touchState.current.blockClick = false;
                touchState.current.isPanning = false;
            }, 100);
        }}
        onMouseLeave={handleMouseLeaveBoard}
    >
      <style>{`
        @keyframes pulseSlow {
            0%, 100% { opacity: 0.3; transform: scale(0.95); }
            50% { opacity: 0.6; transform: scale(1.05); }
        }
        .animate-pulse-slow {
            animation: pulseSlow 4s ease-in-out infinite;
            transform-origin: center;
        }
        @keyframes liquidFlow {
            0%, 100% { stroke-width: ${CELL_SIZE * 0.12}px; }
            50% { stroke-width: ${CELL_SIZE * 0.22}px; }
        }
        .animate-liquid-flow line {
            animation: liquidFlow 2.5s ease-in-out infinite;
        }
        @keyframes liquidFlowGomoku {
            0%, 100% { stroke-width: ${CELL_SIZE * 0.22}px; }
            50% { stroke-width: ${CELL_SIZE * 0.13}px; }
        }
        .animate-liquid-flow-gomoku line {
            animation: liquidFlowGomoku 3s ease-in-out infinite;
        }

        /* [新增] 气流动动画 */
        @keyframes dashFlow {
            to { stroke-dashoffset: -20; }
        }
        .animate-dash-flow {
            stroke-dasharray: 4, 6;
            animation: dashFlow 1s linear infinite;
        }
      `}</style>
      <div 
        className="w-full h-full relative transition-transform duration-75 ease-linear origin-center rounded-xl overflow-hidden shadow-2xl border-[6px]"
        style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            borderColor: BOARD_THEMES[boardSkin as BoardThemeId]?.borderColor || '#8c6b38',
            backgroundColor: BOARD_THEMES[boardSkin as BoardThemeId]?.borderColor || '#8c6b38', // Fill gap
        }}
      >
        <div 
            className="absolute inset-0 transition-all duration-300"
            style={{
                background: BOARD_THEMES[boardSkin as BoardThemeId]?.background || '#e3c086',
                backgroundImage: BOARD_THEMES[boardSkin as BoardThemeId]?.backgroundImage,
                backgroundSize: BOARD_THEMES[boardSkin as BoardThemeId]?.backgroundSize,
                zIndex: 0
            }}
        />

        <svg 
            viewBox={`0 0 ${boardPixelSize} ${boardPixelSize}`}
            className="relative z-10 w-full h-full select-none"
            style={{ maxWidth: '100%', maxHeight: '100%' }}
        >
            {extraSVG}
            <defs>
                <filter id="goo-silk">
                    <feGaussianBlur in="SourceGraphic" stdDeviation={CELL_SIZE * 0.15} result="blur" />
                    <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 25 -10" result="goo" />
                    <feComposite in="SourceGraphic" in2="goo" operator="atop"/>
                </filter>

                <filter id="goo-silk-gomoku">
                    <feGaussianBlur in="SourceGraphic" stdDeviation={CELL_SIZE * 0.08} result="blur" />
                    <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -9" result="goo" />
                    <feComposite in="SourceGraphic" in2="goo" operator="atop"/>
                </filter>

                <filter id="jelly-black" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation={CELL_SIZE * 0.1} result="blur" />
                    <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9" result="blob" />
                    <feGaussianBlur in="blob" stdDeviation="2" result="blurBlob"/>
                    <feSpecularLighting in="blurBlob" surfaceScale="5" specularConstant="0.8" specularExponent="20" lightingColor="#ffffff" result="specular">
                        <fePointLight x="-500" y="-500" z="300" />
                    </feSpecularLighting>
                    <feComposite in="specular" in2="blob" operator="in" result="specularInBlob"/>
                    <feDropShadow dx="0" dy={CELL_SIZE * 0.1} stdDeviation={CELL_SIZE * 0.05} floodColor="#000000" floodOpacity="0.5" in="blob" result="shadow" />
                    <feComposite in="shadow" in2="blob" operator="over" result="shadowedBlob"/>
                    <feComposite in="specularInBlob" in2="shadowedBlob" operator="over" />
                </filter>

                <filter id="jelly-white" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation={CELL_SIZE * 0.1} result="blur" />
                    <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9" result="blob" />
                    <feGaussianBlur in="blob" stdDeviation="2" result="blurBlob"/>
                    <feSpecularLighting in="blurBlob" surfaceScale="5" specularConstant="1.2" specularExponent="15" lightingColor="#ffffff" result="specular">
                        <fePointLight x="-500" y="-500" z="300" />
                    </feSpecularLighting>
                    <feComposite in="specular" in2="blob" operator="in" result="specularInBlob"/>
                    <feDropShadow dx="0" dy={CELL_SIZE * 0.1} stdDeviation={CELL_SIZE * 0.05} floodColor="#5c4033" floodOpacity="0.3" in="blob" result="shadow" />
                    <feComposite in="shadow" in2="blob" operator="over" result="shadowedBlob"/>
                    <feComposite in="specularInBlob" in2="shadowedBlob" operator="over" />
                </filter>

                <filter id="qi-blur">
                    <feGaussianBlur in="SourceGraphic" stdDeviation={CELL_SIZE * 0.3} />
                </filter>

                {/* [新增] 气流发光滤镜 */}
                <filter id="glow-flow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                    <feMerge>
                        <feMergeNode in="coloredBlur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
                
                {/* [新增] 气流渐变色 */}
                <linearGradient id="qi-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#4fc3f7" stopOpacity="0.6" />
                    <stop offset="50%" stopColor="#e1f5fe" stopOpacity="1" />
                    <stop offset="100%" stopColor="#4fc3f7" stopOpacity="0.6" />
                </linearGradient>

                {/* [新增] 兼容模式(简约)的高光渐变 - 黑色棋子 (叠加层) */}
                <radialGradient id="compat-black-gradient" cx="35%" cy="35%" r="60%">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="0.15" />
                    <stop offset="100%" stopColor="#000000" stopOpacity="0" />
                </radialGradient>

                {/* [新增] 兼容模式(简约)的高光渐变 - 白色棋子 (叠加层) */}
                <radialGradient id="compat-white-gradient" cx="70%" cy="70%" r="65%">
                    <stop offset="0%" stopColor="#000000" stopOpacity="0.1" />
                    <stop offset="100%" stopColor="#000000" stopOpacity="0" />
                </radialGradient>
            </defs>
            
            <g>{renderGridLines()}</g>
            {renderTerritory()}
            
            {/* 气流层放在网格之上，棋子之下 */}
            {renderQiFlow()}

            {renderCoordinates()}

            {starPoints.map(([x, y], i) => (
                <circle key={`star-${i}`} cx={GRID_PADDING + x * CELL_SIZE} cy={GRID_PADDING + y * CELL_SIZE} r={boardSize > 13 ? 2 : 3} fill="#5c4033" />
            ))}

            {renderLooseSilk('black')}
            {renderLooseSilk('white')}

            {renderStoneBody('black')}
            {renderStoneBody('white')}

            <g>
            {groupFaces.map(face => (
                <g 
                    key={`face-group-${face.id}`} 
                    className="face-enter transition-all duration-300 ease-out"
                    style={{ 
                        transformOrigin: 'center',
                        transform: `translate(${GRID_PADDING + face.x * CELL_SIZE}px, ${GRID_PADDING + face.y * CELL_SIZE}px)`
                    }}
                >
                    <g transform={`translate(${-CELL_SIZE/2}, ${-CELL_SIZE/2})`}>
                        <StoneFace
                            x={0}
                            y={0}
                            size={CELL_SIZE}
                            color={face.color === 'black' ? '#fff' : '#333'}
                            mood={face.mood}
                            lookOffset={face.lookOffset}
                        />
                    </g>
                </g>
            ))}
            </g>

            {lastMove && (
                <circle 
                    cx={GRID_PADDING + lastMove.x * CELL_SIZE + CELL_SIZE/2 - (CELL_SIZE * 0.15)} 
                    cy={GRID_PADDING + lastMove.y * CELL_SIZE + CELL_SIZE/2 - (CELL_SIZE * 0.15)} 
                    r={CELL_SIZE * 0.1} 
                    fill="#ff4444" 
                    className="animate-pulse"
                    style={{ pointerEvents: 'none' }}
                    transform={`translate(${-CELL_SIZE/2 + (CELL_SIZE * 0.15)}, ${-CELL_SIZE/2 + (CELL_SIZE * 0.15)})`}
                />
            )}

            <g>{renderIntersections()}</g>
        </svg>
      </div>

      {transform.scale > 1.1 && (
        <button 
            className="absolute bottom-2 right-2 bg-black/40 hover:bg-black/60 text-white p-2 rounded-full z-30 backdrop-blur-sm transition-colors"
            onClick={(e) => {
                e.stopPropagation();
                setTransform({ scale: 1, x: 0, y: 0 });
            }}
            aria-label="Reset Zoom"
        >
            <ZoomOut size={18} />
        </button>
      )}
    </div>
  );
};