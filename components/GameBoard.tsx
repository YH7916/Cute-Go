import React, { useMemo } from 'react';
import { getAllGroups } from '../utils/goLogic';
import { BoardState, Player, Stone } from '../types';
import { StoneFace } from './StoneFaces';

interface GameBoardProps {
  board: BoardState;
  onIntersectionClick: (x: number, y: number) => void;
  currentPlayer: Player;
  lastMove: { x: number, y: number } | null;
}

export const GameBoard: React.FC<GameBoardProps> = ({ 
  board, 
  onIntersectionClick, 
  lastMove 
}) => {
  const boardSize = board.length;
  // Dynamic cell size
  const CELL_SIZE = boardSize === 9 ? 40 : boardSize === 13 ? 30 : 22;
  const GRID_PADDING = 30;
  const STONE_RADIUS = CELL_SIZE * 0.48; 

  const boardPixelSize = (boardSize - 1) * CELL_SIZE + GRID_PADDING * 2;

  // Identify connected pairs for "Puyo" effect
  const connections = useMemo(() => {
    const lines: {x1: number, y1: number, x2: number, y2: number, color: Player, type: 'ortho' | 'diag'}[] = [];
    
    for(let y=0; y<boardSize; y++) {
      for(let x=0; x<boardSize; x++) {
        const stone = board[y][x];
        if(!stone) continue;

        // 1. Right neighbor
        if(x < boardSize - 1) {
           const right = board[y][x+1];
           if(right && right.color === stone.color) {
             lines.push({ x1: x, y1: y, x2: x+1, y2: y, color: stone.color, type: 'ortho' });
           }
        }
        // 2. Bottom neighbor
        if(y < boardSize - 1) {
           const bottom = board[y+1][x];
           if(bottom && bottom.color === stone.color) {
             lines.push({ x1: x, y1: y, x2: x, y2: y+1, color: stone.color, type: 'ortho' });
           }
        }
        // 3. Bottom-Right Diagonal (Sticky Silk)
        if(x < boardSize - 1 && y < boardSize - 1) {
            const br = board[y+1][x+1];
            if(br && br.color === stone.color) {
                lines.push({ x1: x, y1: y, x2: x+1, y2: y+1, color: stone.color, type: 'diag' });
            }
        }
        // 4. Bottom-Left Diagonal (Sticky Silk)
        if(x > 0 && y < boardSize - 1) {
            const bl = board[y+1][x-1];
            if(bl && bl.color === stone.color) {
                lines.push({ x1: x, y1: y, x2: x-1, y2: y+1, color: stone.color, type: 'diag' });
            }
        }
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

  const stoneMoods = useMemo(() => {
    const moods = new Map<string, 'happy' | 'neutral' | 'worried' | 'dead'>();
    const groups = getAllGroups(board);

    groups.forEach(group => {
      let mood: 'happy' | 'neutral' | 'worried' = 'happy';
      if (group.liberties === 1) mood = 'worried';
      else if (group.liberties <= 3) mood = 'neutral';
      
      group.stones.forEach(s => moods.set(s.id, mood));
    });
    return moods;
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
            onClick={() => onIntersectionClick(x, y)}
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
           {connections.filter(c => c.color === color).map((c, i) => (
              <line 
                key={`${color}-conn-${i}`}
                x1={GRID_PADDING + c.x1 * CELL_SIZE}
                y1={GRID_PADDING + c.y1 * CELL_SIZE}
                x2={GRID_PADDING + c.x2 * CELL_SIZE}
                y2={GRID_PADDING + c.y2 * CELL_SIZE}
                stroke={stroke}
                // Ortho = 0.65, Diag = 0.35 (Visible but distinct)
                strokeWidth={c.type === 'ortho' ? CELL_SIZE * 0.65 : CELL_SIZE * 0.35} 
                strokeLinecap="round"
              />
           ))}
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
    <div className="relative flex justify-center items-center p-2">
      <div 
        className="absolute inset-0 bg-[#e3c086] rounded-xl shadow-xl transform scale-[1.02] border-b-8 border-[#cba367]"
        style={{
             backgroundImage: 'radial-gradient(circle, #deb879 10%, transparent 10.5%)',
             backgroundSize: '20px 20px',
             zIndex: 0
        }}
      />

      <svg 
        width={boardPixelSize} 
        height={boardPixelSize} 
        viewBox={`0 0 ${boardPixelSize} ${boardPixelSize}`}
        className="relative z-10"
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
          {stones.map(s => (
            <g key={`face-${s.id}`} className="stone-enter" style={{ transformOrigin: 'center' }}>
               <circle 
                 cx={GRID_PADDING + s.x * CELL_SIZE - CELL_SIZE*0.15} 
                 cy={GRID_PADDING + s.y * CELL_SIZE - CELL_SIZE*0.15} 
                 r={CELL_SIZE * 0.12} 
                 fill="rgba(255,255,255,0.25)" 
               />
              <StoneFace
                x={GRID_PADDING + s.x * CELL_SIZE - CELL_SIZE / 2}
                y={GRID_PADDING + s.y * CELL_SIZE - CELL_SIZE / 2}
                size={CELL_SIZE}
                color={s.color === 'black' ? '#fff' : '#333'}
                mood={stoneMoods.get(s.id) || 'happy'}
              />
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
  );
};
