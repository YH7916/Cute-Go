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
  showQi: boolean;
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
  lastMove,
  showQi
}) => {
  const boardSize = board.length;
  // Dynamic cell size
  const CELL_SIZE = boardSize === 9 ? 40 : boardSize === 13 ? 30 : 22;
  const GRID_PADDING = boardSize === 19 ? 20 : 30;
  
  const STONE_RADIUS = CELL_SIZE * 0.45; // Slightly larger for better merging
  
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
        const isValid = (cx: number, cy: number) => cx >= 0 && cx < boardSize && cy >= 0 && cy < boardSize;

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

            let isCut = false;
            if (Math.abs(dx) === 1 && Math.abs(dy) === 1) {
                 const s1 = board[y][tx]; 
                 const s2 = board[ty][x]; 
                 if (s1?.color === opColor && s2?.color === opColor) isCut = true;
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
    return lines;
  }, [board, boardSize]);

  const stones = useMemo(() => {
    const flat: Stone[] = [];
    board.forEach(row => row.forEach(stone => {
      if (stone) flat.push(stone);
    }));
    return flat;
  }, [board]);

  const groupFaces = useMemo(() => {
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

  const renderQiLayer = () => {
      if (!showQi) return null;
      return (
        <g className="animate-pulse-slow">
            {stones.map(s => {
                const cx = GRID_PADDING + s.x * CELL_SIZE;
                const cy = GRID_PADDING + s.y * CELL_SIZE;
                const isBlack = s.color === 'black';
                const fillColor = isBlack ? '#4a148c' : '#e0f7fa';
                const opacity = isBlack ? 0.35 : 0.5;

                return (
                    <circle
                        key={`qi-${s.id}`}
                        cx={cx}
                        cy={cy}
                        r={CELL_SIZE * 0.8}
                        fill={fillColor}
                        opacity={opacity}
                        filter="url(#qi-blur)"
                    />
                )
            })}
        </g>
      )
  };

  // 1. Renders the solid, merged body (Stones + Ortho Connections)
  // New: Uses "jelly-black" or "jelly-white" filters for 3D Specular Highlight + Soft Shadow
  const renderSolidBody = (color: Player) => {
    const baseColor = color === 'black' ? '#2a2a2a' : '#f0f0f0';
    const filterId = color === 'black' ? 'url(#jelly-black)' : 'url(#jelly-white)';
    const orthoWidth = CELL_SIZE * 0.95; // Thicker for better merging

    return (
        <g filter={filterId}>
           {connections.filter(c => c.color === color && c.type === 'ortho').map((c, i) => (
                <line 
                    key={`${color}-body-ortho-${i}`}
                    x1={GRID_PADDING + c.x1 * CELL_SIZE}
                    y1={GRID_PADDING + c.y1 * CELL_SIZE}
                    x2={GRID_PADDING + c.x2 * CELL_SIZE}
                    y2={GRID_PADDING + c.y2 * CELL_SIZE}
                    stroke={baseColor}
                    strokeWidth={orthoWidth}
                    strokeLinecap="round"
                />
           ))}
           {stones.filter(s => s.color === color).map(s => (
            <circle
              key={`${color}-body-base-${s.id}`}
              cx={GRID_PADDING + s.x * CELL_SIZE}
              cy={GRID_PADDING + s.y * CELL_SIZE}
              r={STONE_RADIUS}
              fill={baseColor}
              className="stone-enter"
            />
          ))}
        </g>
    );
  };

  // 2. Renders the loose silk connections 
  // Improved: Groups all lines BEFORE opacity to avoid dark intersections
  // Improved: "Breathe" animation is now strokewidth change before Goo filter, creating liquid flow
  const renderLooseSilk = (color: Player) => {
    const baseColor = color === 'black' ? '#2a2a2a' : '#f0f0f0';
    
    // Group opacity is applied to the WHOLE liquid layer, solving intersection darkness
    return (
        <g opacity="0.65" filter="url(#goo-silk)">
           <g className="animate-liquid-flow">
             {connections.filter(c => c.color === color && c.type === 'loose').map((c, i) => (
                  <line 
                      key={`${color}-loose-${i}`}
                      x1={GRID_PADDING + c.x1 * CELL_SIZE}
                      y1={GRID_PADDING + c.y1 * CELL_SIZE}
                      x2={GRID_PADDING + c.x2 * CELL_SIZE}
                      y2={GRID_PADDING + c.y2 * CELL_SIZE}
                      stroke={baseColor}
                      strokeLinecap="round"
                  />
             ))}
           </g>
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
            /* 
               Varying stroke width fed into a Threshold filter creates a "peristaltic" pumping effect 
               visually resembling liquid flowing through a tube.
            */
            0%, 100% { stroke-width: ${CELL_SIZE * 0.12}px; }
            50% { stroke-width: ${CELL_SIZE * 0.22}px; }
        }
        .animate-liquid-flow line {
            animation: liquidFlow 2.5s ease-in-out infinite;
        }
      `}</style>
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
                {/* --- SHARED LIGHTING DEFINITIONS --- */}
                
                {/* 1. SILK GOO: High blur + High contrast = Liquid Blob */}
                <filter id="goo-silk">
                    <feGaussianBlur in="SourceGraphic" stdDeviation={CELL_SIZE * 0.15} result="blur" />
                    <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 25 -10" result="goo" />
                    <feComposite in="SourceGraphic" in2="goo" operator="atop"/>
                </filter>

                {/* 2. JELLY BLACK: 3D look for Black stones */}
                <filter id="jelly-black" x="-50%" y="-50%" width="200%" height="200%">
                    {/* A. Create Blob Shape */}
                    <feGaussianBlur in="SourceGraphic" stdDeviation={CELL_SIZE * 0.1} result="blur" />
                    <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9" result="blob" />
                    
                    {/* B. Specular Highlight (The "Wet" look) */}
                    <feGaussianBlur in="blob" stdDeviation="2" result="blurBlob"/>
                    <feSpecularLighting in="blurBlob" surfaceScale="5" specularConstant="0.8" specularExponent="20" lightingColor="#ffffff" result="specular">
                        <fePointLight x="-500" y="-500" z="300" />
                    </feSpecularLighting>
                    <feComposite in="specular" in2="blob" operator="in" result="specularInBlob"/>

                    {/* C. Soft Drop Shadow (Instead of black border) */}
                    <feDropShadow dx="0" dy={CELL_SIZE * 0.1} stdDeviation={CELL_SIZE * 0.05} floodColor="#000000" floodOpacity="0.5" in="blob" result="shadow" />

                    {/* D. Composition: Shadow -> Blob -> Highlight */}
                    <feComposite in="shadow" in2="blob" operator="over" result="shadowedBlob"/>
                    <feComposite in="specularInBlob" in2="shadowedBlob" operator="over" />
                </filter>

                {/* 3. JELLY WHITE: 3D look for White stones */}
                <filter id="jelly-white" x="-50%" y="-50%" width="200%" height="200%">
                    {/* A. Create Blob Shape */}
                    <feGaussianBlur in="SourceGraphic" stdDeviation={CELL_SIZE * 0.1} result="blur" />
                    <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9" result="blob" />
                    
                    {/* B. Specular Highlight (The "Wet" look) */}
                    <feGaussianBlur in="blob" stdDeviation="2" result="blurBlob"/>
                    <feSpecularLighting in="blurBlob" surfaceScale="5" specularConstant="1.2" specularExponent="15" lightingColor="#ffffff" result="specular">
                        <fePointLight x="-500" y="-500" z="300" />
                    </feSpecularLighting>
                    <feComposite in="specular" in2="blob" operator="in" result="specularInBlob"/>

                    {/* C. Soft Drop Shadow */}
                    <feDropShadow dx="0" dy={CELL_SIZE * 0.1} stdDeviation={CELL_SIZE * 0.05} floodColor="#5c4033" floodOpacity="0.3" in="blob" result="shadow" />

                    {/* D. Composition */}
                    <feComposite in="shadow" in2="blob" operator="over" result="shadowedBlob"/>
                    <feComposite in="specularInBlob" in2="shadowedBlob" operator="over" />
                </filter>

                {/* QI BLUR */}
                <filter id="qi-blur">
                    <feGaussianBlur in="SourceGraphic" stdDeviation={CELL_SIZE * 0.3} />
                </filter>
            </defs>
            
            {/* Layer 0: Qi (Aura) - Below Grid */}
            {renderQiLayer()}

            <g>{renderGridLines()}</g>
            {starPoints.map(([x, y], i) => (
                <circle key={`star-${i}`} cx={GRID_PADDING + x * CELL_SIZE} cy={GRID_PADDING + y * CELL_SIZE} r={boardSize > 13 ? 2 : 3} fill="#5c4033" />
            ))}

            {/* Layer 1: Loose Silk (Liquid) */}
            {renderLooseSilk('black')}
            {renderLooseSilk('white')}

            {/* Layer 2: Main Body (Jelly 3D) */}
            {renderSolidBody('black')}
            {renderSolidBody('white')}

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
