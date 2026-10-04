import React from 'react';
import type { Player, Stone, GameType } from '../../types';
import { STONE_THEMES, type StoneThemeId } from '../../utils/themes';
import { StoneFace } from '../StoneFaces';
import type { BoardGeometry, Connection } from './types';
import type { getGroupFaces } from './faces';

interface StoneBodyProps extends BoardGeometry {
  color: Player;
  stoneSkin: string;
  gameType: GameType;
  separatePieces: boolean;
  stones: Stone[];
  connections: Connection[];
  animatingStoneId: string | null;
  filterIdPrefix?: string;
}
export const BoardStoneBody = React.memo(
  ({
    color,
    stoneSkin,
    gameType,
    separatePieces,
    stones,
    connections,
    animatingStoneId,
    filterIdPrefix = '',
    CELL_SIZE,
    GRID_PADDING,
    STONE_RADIUS,
  }: StoneBodyProps) => {
    const theme = STONE_THEMES[stoneSkin as StoneThemeId] || STONE_THEMES['classic'];
    const isSkeuomorphic = theme.id === 'skeuomorphic' || theme.useGradientFill;
    // Separation changes geometry/filter scope, never the selected skin's material.
    const useSeparateRendering = gameType === 'Gomoku' || separatePieces;

    // Helper to render the actual shapes (Lines + Circles + Fillers)
    // We pass color/width override to allow drawing "Shadow/Highlight" layers
    const renderShapes = (drawColor: string, isMainLayer: boolean, opacity: number = 1.0) => {
      // [Fix] Ortho connection width should match stone diameter (2 * 0.45 = 0.9)
      const orthoWidth = CELL_SIZE * 0.9;

      // Define Filter ID (only for classic theme)
      let filterId = undefined;
      if (!isSkeuomorphic && !theme.filter) {
        filterId = `url(#${filterIdPrefix}jelly-${color})`;
      }

      const styleFilter = theme.filter ? { filter: theme.filter } : undefined;
      const borderColor = color === 'black' ? theme.blackBorder : theme.whiteBorder;
      const strokeW = 0;

      const effectiveStroke = isMainLayer ? borderColor : 'none';
      const effectiveStrokeWidth = isMainLayer ? strokeW : 0;

      // Connected mode filters each color together; independent stones must not
      // share the blur input, which would fuse adjacent circles back together.
      const myStones = stones.filter((s) => s.color === color);
      const stoneSet = new Set(myStones.map((s) => `${s.x},${s.y}`));

      // Compute fillers (2x2 blocks) globally
      const fillers: { x: number; y: number }[] = [];
      if (!useSeparateRendering) {
        myStones.forEach((s) => {
          if (
            stoneSet.has(`${s.x + 1},${s.y}`) &&
            stoneSet.has(`${s.x},${s.y + 1}`) &&
            stoneSet.has(`${s.x + 1},${s.y + 1}`)
          ) {
            fillers.push({ x: s.x, y: s.y });
          }
        });
      }

      return (
        <g filter={useSeparateRendering ? undefined : filterId} style={styleFilter} opacity={opacity}>
          {/* 1. Direct Connections (Fused Body) */}
          <g>
            {!useSeparateRendering && connections
              .filter((c) => c.color === color && c.type === 'ortho')
              .map((c, i) => (
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

          {/* 2. Filler Quads (Close gaps in 2x2 blocks) */}
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
          {myStones.map((s) => (
            <circle
              key={`st-${s.id}-${drawColor}`}
              cx={GRID_PADDING + s.x * CELL_SIZE}
              cy={GRID_PADDING + s.y * CELL_SIZE}
              r={STONE_RADIUS}
              fill={drawColor}
              filter={useSeparateRendering ? filterId : undefined}
              stroke={effectiveStroke}
              strokeWidth={effectiveStrokeWidth}
              className={animatingStoneId === s.id ? 'stone-enter' : undefined}
            />
          ))}
        </g>
      );
    };

    if (isSkeuomorphic) {
      // === PREMIUM BUTTON STYLE (精致纽扣) ===
      // 使用 CSS drop-shadow 应用到整个组，避免单个棋子阴影叠加

      const isBlack = color === 'black';

      // Main body color with subtle tint
      const mainColor = isBlack ? '#2d2d30' : '#f5f5f2';

      // CSS drop-shadow applies to ENTIRE GROUP as one shape - no overlap!
      const shadowStyle = isBlack
        ? {
            filter:
              'drop-shadow(1.5px 1.5px 1px rgba(0,0,0,0.4)) drop-shadow(2.5px 2.5px 2px rgba(0,0,0,0.2))',
          }
        : {
            filter:
              'drop-shadow(1.5px 1.5px 1px rgba(80,60,40,0.25)) drop-shadow(2.5px 2.5px 2px rgba(50,30,10,0.12))',
          };

      return (
        <g style={shadowStyle}>
          {/* Main Body - shadow is applied to entire group above */}
          {renderShapes(mainColor, true)}
        </g>
      );
    } else {
      // Standard Rendering (Classic with filters)
      const baseColor = color === 'black' ? theme.blackColor : theme.whiteColor;
      return renderShapes(baseColor, true);
    }
  }
);

interface SilkProps extends BoardGeometry {
  color: Player;
  stoneSkin: string;
  gameType: GameType;
  separatePieces: boolean;
  connections: Connection[];
}
export const BoardLooseSilk = React.memo(
  ({ color, stoneSkin, gameType, separatePieces, connections, CELL_SIZE, GRID_PADDING }: SilkProps) => {
    const theme = STONE_THEMES[stoneSkin as StoneThemeId] || STONE_THEMES['classic'];
    const baseColor = color === 'black' ? theme.blackColor : theme.whiteColor;
    const isGomoku = gameType === 'Gomoku';

    if (isGomoku || separatePieces) return null;

    // [Perf] Use CSS drop-shadow instead of SVG goo-silk filter.
    // SVG filters force full re-rasterization on any geometry change (like stroke-width anim).
    // CSS drop-shadow is GPU-accelerated and much cheaper.
    const silkShadow = { filter: `drop-shadow(0px 0px ${CELL_SIZE * 0.08}px ${baseColor})` };
    const strokeWidth = CELL_SIZE * 0.15;

    return (
      <g opacity={0.65} style={silkShadow}>
        <g className="animate-liquid-flow">
          {connections
            .filter((c) => c.color === color && c.type === 'loose')
            .map((c, i) => {
              const x1 = GRID_PADDING + c.x1 * CELL_SIZE;
              const y1 = GRID_PADDING + c.y1 * CELL_SIZE;
              const x2 = GRID_PADDING + c.x2 * CELL_SIZE;
              const y2 = GRID_PADDING + c.y2 * CELL_SIZE;

              return (
                <line
                  key={`${color}-loose-${i}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={baseColor}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                />
              );
            })}
        </g>
      </g>
    );
  }
);

export const BoardFaces = React.memo(
  ({
    groupFaces,
    stoneAnimationEnabled = true,
    CELL_SIZE,
    GRID_PADDING,
  }: BoardGeometry & { groupFaces: ReturnType<typeof getGroupFaces>; stoneAnimationEnabled?: boolean }) => (
    <g>
      {groupFaces.map((face) => (
        <g
          key={`face-group-${face.id}`}
          className={stoneAnimationEnabled ? 'face-enter transition-all duration-300 ease-out' : undefined}
          style={{
            transformOrigin: 'center',
            transform: `translate(${GRID_PADDING + face.x * CELL_SIZE}px, ${GRID_PADDING + face.y * CELL_SIZE}px)`,
          }}
        >
          <g transform={`translate(${-CELL_SIZE / 2}, ${-CELL_SIZE / 2})`}>
            <StoneFace
              x={0}
              y={0}
              size={CELL_SIZE}
              color={face.color === 'black' ? '#fff' : '#333'}
              mood={face.mood}
              lookOffset={face.lookOffset}
              stoneAnimationEnabled={stoneAnimationEnabled}
            />
          </g>
        </g>
      ))}
    </g>
  )
);
