import React, { useMemo, useState, useRef, useEffect } from 'react';
import { getAllGroups } from '../utils/goLogic';
import { BoardState, Player, Stone } from '../types';
import { StoneFace } from './StoneFaces';
import { ZoomOut } from 'lucide-react';

interface GameBoardProps {
  board: BoardState;
  onIntersectionClick: (x: number, y: number) => void;
  currentPlayer: Player;
  lastMove: { x: number, y: number } | null;
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

export const GameBoard: React.FC<GameBoardProps> = ({ 
  board, 
  onIntersectionClick, 
  lastMove 
}) => {
  const boardSize = board.length;
  // Dynamic cell size (Internal coordinate system units)
  const CELL_SIZE = boardSize === 9 ? 40 : boardSize === 13 ? 30 : 22;
  // Reduced padding for larger boards to maximize space on small screens
  const GRID_PADDING = boardSize === 19 ? 20 : 30;
  const STONE_RADIUS = CELL_SIZE * 0.48; 

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

  // Reset zoom when board size changes
  useEffect(() => {
    setTransform({ scale: 1, x: 0, y: 0 });
  }, [boardSize]);

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
    if (e.touches.length === 1) {
         const dx = e.touches[0].clientX - touchState.current.lastX;
         const dy = e.touches[0].clientY - touchState.current.lastY;
         
         if (!touchState.current.isPanning && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
             touchState.current.isPanning = true;
             touchState.current.blockClick = true;
         }

         if (touchState.current.isPanning) {
             setTransform(prev => {
                 const limit = (boardPixelSize * prev.scale) / 2;
                 const newX = Math.max(-limit, Math.min(limit, prev.x + dx));
                 const newY = Math.max(-limit, Math.min(limit, prev.y + dy));
                 return { ...prev, x: newX, y: newY };
             });
             touchState.current.lastX = e.touches[0].clientX;
             touchState.current.lastY = e.touches[0].clientY;
         }

    } else if (e.touches.length === 2) {
         const dx = e.touches[0].clientX - e.touches[1].clientX;
         const dy = e.touches[0].clientY - e.touches[1].clientY;
         const dist = Math.hypot(dx, dy);
         
         if (touchState.current.startDist > 0) {
             const scaleFactor = dist / touchState.current.startDist;
             const newScale = Math.min(Math.max(1, touchState.current.startScale * scaleFactor), 3);
             setTransform(prev => ({ ...prev, scale: newScale }));
         }
    }
  };

  const handleIntersectionClickWrapper = (x: number, y: number) => {
    if (touchState.current.blockClick) return;
    onIntersectionClick(x, y);
  };

  // Identify connections
  const connections = useMemo(() => {
    const lines: Connection[] = [];
    
    for(let y=0; y<boardSize; y++) {
      for(let x=0; x<boardSize; x++) {
        const stone = board[y][x];
        if(!stone) continue;
        const opColor = stone.color === 'black' ? 'white' : 'black';

        // Helper to check valid coordinate
        const isValid = (cx: number, cy: number) => cx >= 0 && cx < boardSize && cy >= 0 && cy < boardSize;

        // 1. TIGHT CONNECTIONS (Orthogonal) - Right & Down
        // Right
        if(isValid(x+1, y)) {
           const right = board[y][x+1];
           if(right && right.color === stone.color) {
             lines.push({ x1: x, y1: y, x2: x+1, y2: y, color: stone.color, type: 'ortho' });
           }
        }
        // Bottom
        if(isValid(x, y+1)) {
           const bottom = board[y+1][x];
           if(bottom && bottom.color === stone.color) {
             lines.push({ x1: x, y1: y, x2: x, y2: y+1, color: stone.color, type: 'ortho' });
           }
        }

        // 2. LOOSE CONNECTIONS (Diagonal, Jumps & Knight's Moves)
        // Only look "forward" (Right, Down-Right, Down-Left, Down) to avoid duplicates

        // A. Diagonal (Kosumi) - Down Right
        if (isValid(x+1, y+1)) {
            const target = board[y+1][x+1];
            if (target && target.color === stone.color) {
                // Check if cut by TWO opposing stones (classic cross-cut)
                // If board[y][x+1] AND board[y+1][x] are opponents, line is broken visually
                const right = board[y][x+1];
                const down = board[y+1][x];
                const isCut = right && right.color === opColor && down && down.color === opColor;
                
                if (!isCut) {
                    lines.push({ x1: x, y1: y, x2: x+1, y2: y+1, color: stone.color, type: 'loose' });
                }
            }
        }
        // B. Diagonal (Kosumi) - Down Left
        if (isValid(x-1, y+1)) {
            const target = board[y+1][x-1];
            if (target && target.color === stone.color) {
                const left = board[y][x-1];
                const down = board[y+1][x];
                const isCut = left && left.color === opColor && down && down.color === opColor;
                
                if (!isCut) {
                    lines.push({ x1: x, y1: y, x2: x-1, y2: y+1, color: stone.color, type: 'loose' });
                }
            }
        }

        // C. One-Point Jump (Tobikomi) - Right
        if (isValid(x+2, y)) {
            const target = board[y][x+2];
            const mid = board[y][x+1];
            if (target && target.color === stone.color && (!mid || mid.color !== opColor)) {
                if (!mid) lines.push({ x1: x, y1: y, x2: x+2, y2: y, color: stone.color, type: 'loose' });
            }
        }
        // D. One-Point Jump - Down
        if (isValid(x, y+2)) {
            const target = board[y+2][x];
            const mid = board[y+1][x];
            if (target && target.color === stone.color && (!mid || mid.color !== opColor)) {
                if (!mid) lines.push({ x1: x, y1: y, x2: x, y2: y+2, color: stone.color, type: 'loose' });
            }
        }

        // E. Knight's Move (Keima)
        const checkKnight = (dx: number, dy: number, cutX: number, cutY: number) => {
            if (isValid(x + dx, y + dy)) {
                const target = board[y + dy][x + dx];
                const cutter = isValid(x + cutX, y + cutY) ? board[y + cutY][x + cutX] : null;
                
                if (target && target.color === stone.color) {
                    if (!cutter || cutter.color !== opColor) {
                         lines.push({ x1: x, y1: y, x2: x + dx, y2: y + dy, color: stone.color, type: 'loose' });
                    }
                }
            }
        }

        checkKnight(1, 2, 0, 1);
        checkKnight(2, 1, 1, 0);
        checkKnight(-1, 2, 0, 1);
        checkKnight(-2, 1, -1, 0);
      }
    }
    return lines;
  }, [board, boardSize]);

  const stones = useMemo(() => {
    const flat: Stone[] = [];
    board.forEach(row => row.forEach(stone => {
      if (stone) flat.push(stone);
    }));
    return flat;
  }, [board]);

  // Calculate Group Faces placement
  const groupFaces = useMemo(() => {
    const groups = getAllGroups(board);
    return groups.map(group => {
        // 1. Calculate Geometric Centroid
        let sumX = 0;
        let sumY = 0;
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        
        // Use a stable sort to ensure deterministic behavior for "last" stone
        const sortedStones = [...group.stones].sort((a, b) => {
            if (a.y !== b.y) return a.y - b.y;
            return a.x - b.x;
        });

        // Generate ID
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

        // 2. Determine Face Placement Logic
        const isHorizontalLine = (maxY === minY) && count > 1;
        const isVerticalLine = (maxX === minX) && count > 1;

        if (isHorizontalLine) {
            // Render on the right-most stone (Tail/Head)
            const edgeStone = sortedStones[sortedStones.length - 1];
            finalX = edgeStone.x;
            finalY = edgeStone.y;
        } else if (isVerticalLine) {
            // Render on the bottom-most stone
            const edgeStone = sortedStones[sortedStones.length - 1];
            finalX = edgeStone.x;
            finalY = edgeStone.y;
        } else {
            // Irregular shape: Find the stone closest to the geometric center
            // This prevents the face from floating in empty space (void)
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

        // Determine mood
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
            scale: 1 + sizeBonus
        };
    });
  }, [board]);

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

  const starPoints = useMemo(() => {
    if (boardSize === 9) return [[2, 2], [6, 2], [4, 4], [2, 6], [6, 6]];
    if (boardSize === 13) return [[3, 3], [9, 3], [6, 6], [3, 9], [9, 9]];
    if (boardSize === 19) return [[3, 3], [9, 3], [15, 3], [3, 9], [9, 9], [15, 9], [3, 15], [9, 15], [15, 15]];
    return [];
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
          />
        );
      }
    }
    return hits;
  };

  const renderStoneLayer = (color: Player) => {
    const filterId = color === 'black' ? 'goo-black' : 'goo-white';
    const fill = color === 'black' ? '#2a2a2a' : '#f0f0f0';
    const stroke = fill;
    
    return (
        <g filter={`url(#${filterId})`}>
           {connections.filter(c => c.color === color).map((c, i) => {
              // Capsule logic: Make Ortho connections very thick to merge properly
              let width = CELL_SIZE * 0.90; // Almost full width to create capsule
              if (c.type === 'loose') width = CELL_SIZE * 0.18; // Thicker silk for better visibility

              return (
                <line 
                    key={`${color}-conn-${i}`}
                    x1={GRID_PADDING + c.x1 * CELL_SIZE}
                    y1={GRID_PADDING + c.y1 * CELL_SIZE}
                    x2={GRID_PADDING + c.x2 * CELL_SIZE}
                    y2={GRID_PADDING + c.y2 * CELL_SIZE}
                    stroke={stroke}
                    strokeWidth={width}
                    strokeLinecap="round"
                />
              );
           })}
           {stones.filter(s => s.color === color).map(s => (
            <circle
              key={`${color}-base-${s.id}`}
              cx={GRID_PADDING + s.x * CELL_SIZE}
              cy={GRID_PADDING + s.y * CELL_SIZE}
              r={STONE_RADIUS} 
              fill={fill}
              className="stone-enter" 
            />
          ))}
        </g>
    );
  };

  return (
    <div 
        className="relative flex justify-center items-center w-full max-w-[95vw] mx-auto aspect-square rounded-xl overflow-hidden border-4 border-[#cba367] bg-[#e3c086] touch-none shadow-xl"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={() => {
            setTimeout(() => {
                touchState.current.blockClick = false;
                touchState.current.isPanning = false;
            }, 100);
        }}
    >
      <div 
        className="w-full h-full relative transition-transform duration-75 ease-linear origin-center"
        style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`
        }}
      >
        <div 
            className="absolute inset-0 bg-[#e3c086]"
            style={{
                backgroundImage: 'radial-gradient(circle, #deb879 10%, transparent 10.5%)',
                backgroundSize: '20px 20px',
                zIndex: 0
            }}
        />

        <svg 
            viewBox={`0 0 ${boardPixelSize} ${boardPixelSize}`}
            className="relative z-10 w-full h-full select-none"
            style={{ maxWidth: '100%', maxHeight: '100%' }}
        >
            <defs>
            <filter id="goo-black">
                <feGaussianBlur in="SourceGraphic" stdDeviation={CELL_SIZE * 0.15} result="blur" />
                <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="goo" />
                <feComposite in="SourceGraphic" in2="goo" operator="atop"/>
            </filter>
            <filter id="goo-white">
                <feGaussianBlur in="SourceGraphic" stdDeviation={CELL_SIZE * 0.15} result="blur" />
                <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="goo" />
                <feComposite in="SourceGraphic" in2="goo" operator="atop"/>
            </filter>
            </defs>

            <g>{renderGridLines()}</g>
            {starPoints.map(([x, y], i) => (
                <circle key={`star-${i}`} cx={GRID_PADDING + x * CELL_SIZE} cy={GRID_PADDING + y * CELL_SIZE} r={boardSize > 13 ? 2 : 3} fill="#5c4033" />
            ))}

            {renderStoneLayer('black')}
            {renderStoneLayer('white')}

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
                    {/* Background glow for better visibility */}
                    <circle 
                        r={CELL_SIZE * 0.15 * face.scale} 
                        fill="rgba(255,255,255,0.15)" 
                    />
                    <g transform={`translate(${-CELL_SIZE/2}, ${-CELL_SIZE/2})`}>
                        <StoneFace
                            x={0}
                            y={0}
                            size={CELL_SIZE}
                            color={face.color === 'black' ? '#fff' : '#333'}
                            mood={face.mood}
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
