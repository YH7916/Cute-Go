import React from 'react';
import type { BoardState } from '../../types';
import type { BoardGeometry, QiSegment } from './types';

export const BoardGrid = ({
  boardSize,
  GRID_PADDING,
  CELL_SIZE,
  boardPixelSize,
}: BoardGeometry) => {
  const lines = [];
  for (let i = 0; i < boardSize; i++) {
    const pos = GRID_PADDING + i * CELL_SIZE;
    lines.push(
      <line
        key={`v-${i}`}
        x1={pos}
        y1={GRID_PADDING}
        x2={pos}
        y2={boardPixelSize - GRID_PADDING}
        stroke="#5c4033"
        strokeWidth={boardSize > 13 ? 1 : 2}
        strokeLinecap="round"
      />
    );
    lines.push(
      <line
        key={`h-${i}`}
        x1={GRID_PADDING}
        y1={pos}
        x2={boardPixelSize - GRID_PADDING}
        y2={pos}
        stroke="#5c4033"
        strokeWidth={boardSize > 13 ? 1 : 2}
        strokeLinecap="round"
      />
    );
  }
  return lines;
};
export const BoardCoordinates = ({
  boardSize,
  GRID_PADDING,
  CELL_SIZE,
  showCoordinates,
}: BoardGeometry & { showCoordinates: boolean }) => {
  if (!showCoordinates) return null;

  const labels = [];
  const colLabels = 'ABCDEFGHJKLMNOPQRST'.split('').slice(0, boardSize);

  for (let i = 0; i < boardSize; i++) {
    const pos = GRID_PADDING + i * CELL_SIZE;

    labels.push(
      <text
        key={`col-top-${i}`}
        x={pos}
        y={GRID_PADDING - 12}
        textAnchor="middle"
        fontSize={boardSize > 13 ? '8' : '10'}
        fill="#5c4033"
        fontWeight="bold"
      >
        {colLabels[i]}
      </text>
    );

    const rowNum = boardSize - i;

    labels.push(
      <text
        key={`row-left-${i}`}
        x={GRID_PADDING - 12}
        y={pos + 3}
        textAnchor="end"
        fontSize={boardSize > 13 ? '8' : '10'}
        fill="#5c4033"
        fontWeight="bold"
      >
        {rowNum}
      </text>
    );
  }
  return <g opacity="0.7">{labels}</g>;
};
export const BoardIntersections = ({
  boardSize,
  GRID_PADDING,
  CELL_SIZE,
  handleIntersectionClickWrapper,
  handleStoneHover,
}: BoardGeometry & {
  handleIntersectionClickWrapper: (x: number, y: number) => void;
  handleStoneHover: (x: number, y: number) => void;
}) => {
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
export const BoardTerritory = ({
  boardSize,
  GRID_PADDING,
  CELL_SIZE,
  showTerritory,
  territory,
  board,
}: BoardGeometry & {
  showTerritory?: boolean;
  territory?: Float32Array | null;
  board: BoardState;
}) => {
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
        x={cx - size / 2}
        y={cy - size / 2}
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
export const BoardQiFlow = ({
  boardSize,
  GRID_PADDING,
  CELL_SIZE,
  showQi,
  activeQiSegments,
}: BoardGeometry & { showQi: boolean; activeQiSegments: QiSegment[] }) => {
  if (!showQi || activeQiSegments.length === 0) return null;

  return (
    <g filter="url(#glow-flow)">
      {/* 底层高亮线 (背景) */}
      {activeQiSegments.map((seg) => (
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
      {activeQiSegments.map((seg) => (
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
      {activeQiSegments.map((seg) => (
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
